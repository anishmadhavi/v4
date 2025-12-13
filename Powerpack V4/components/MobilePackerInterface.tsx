import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useZxing } from 'react-zxing';
import { UserProfile } from '../types';
import { api } from '../services/api';
import {
  LogOut,
  ScanLine,
  Volume2,
  VolumeX,
  CheckCircle,
  CloudUpload,
  Loader2,
} from 'lucide-react';

// --- AUDIO ENGINE ---
const playTone = (freq: number, type: 'sine' | 'square' | 'sawtooth', duration: number) => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;

    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);

    gain.gain.setValueAtTime(1.0, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (e) {
    console.error('Audio playback failed', e);
  }
};

// --- TYPES ---
interface Props {
  packer: UserProfile;
  onLogout: () => void;
}

interface QueueItem {
  id: string;
  blob: Blob;
  awb: string;
  filename: string;
  mimeType: string;
  status: 'PENDING' | 'UPLOADING';
}

const MobilePackerInterface: React.FC<Props> = ({ packer, onLogout }) => {
  const [status, setStatus] = useState<'IDLE' | 'STABILIZING' | 'DETECTED' | 'RECORDING'>('IDLE');
  const [awb, setAwb] = useState('');
  const [uploadQueue, setUploadQueue] = useState<QueueItem[]>([]);
  const [activeUploads, setActiveUploads] = useState(0);
  const [audioEnabled, setAudioEnabled] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const awbRef = useRef('');
  const stableTimerRef = useRef<any>(null);
  const lastSeenCodeRef = useRef<string | null>(null);

  const enableAudio = () => {
    playTone(0, 'sine', 0);
    setAudioEnabled(true);
  };

  // --- QUEUE MANAGEMENT ---
  const addToQueue = useCallback((blob: Blob, recordedAwb: string, mimeType: string) => {
    const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
    const finalAwb = recordedAwb || 'unknown_scan';
    const filename = `${finalAwb}.${ext}`;

    setUploadQueue(prev => [
      ...prev,
      {
        id: Date.now().toString(),
        blob,
        awb: finalAwb,
        filename,
        mimeType,
        status: 'PENDING',
      },
    ]);
  }, []);

  // --- RECORD START ---
  const triggerRecordStart = (videoElement: HTMLVideoElement) => {
    if (!videoElement.srcObject) return;

    const stream = videoElement.srcObject as MediaStream;
    const currentSessionAwb = awbRef.current;

    let mimeType = 'video/webm';
    if (MediaRecorder.isTypeSupported('video/mp4')) {
      mimeType = 'video/mp4';
    }

    try {
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 2500000,
      });

      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = e => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        addToQueue(blob, currentSessionAwb, mimeType);
      };

      mediaRecorder.start();
      setStatus('RECORDING');
    } catch (e) {
      console.error('Failed to start MediaRecorder', e);
      setStatus('IDLE');
    }
  };

  const stopRecording = useCallback(() => {
    playTone(150, 'sawtooth', 0.3);
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setStatus('IDLE');
    setAwb('');
    awbRef.current = '';
    lastSeenCodeRef.current = null;
    if (stableTimerRef.current) clearTimeout(stableTimerRef.current);
  }, []);

  // --- SCANNING LOGIC ---
  const confirmScan = useCallback((code: string, videoElement: HTMLVideoElement) => {
    let cleanCode = code.trim();

    if (cleanCode.length > 8 && cleanCode.length % 2 === 0) {
      const half = cleanCode.length / 2;
      if (cleanCode.slice(0, half) === cleanCode.slice(half)) {
        cleanCode = cleanCode.slice(0, half);
      }
    }

    setAwb(cleanCode);
    awbRef.current = cleanCode;

    playTone(880, 'square', 0.2);
    setStatus('DETECTED');

    setTimeout(() => {
      triggerRecordStart(videoElement);
    }, 500);
  }, []);

  const onScanResult = useCallback(
    (result: any) => {
      if (status === 'RECORDING' || status === 'DETECTED') return;

      const rawCode = result.getText();
      if (!rawCode) return;

      if (rawCode !== lastSeenCodeRef.current) {
        lastSeenCodeRef.current = rawCode;
        setStatus('STABILIZING');

        if (stableTimerRef.current) clearTimeout(stableTimerRef.current);

        stableTimerRef.current = setTimeout(() => {
          const videoEl = document.querySelector('video');
          if (videoEl) confirmScan(rawCode, videoEl);
        }, 2000);
      }
    },
    [status, confirmScan]
  );

  const { ref: videoRef } = useZxing({
    onDecodeResult: onScanResult,
    constraints: {
      audio: false,
      video: { facingMode: 'environment' },
    },
  });

  // --- UPLOAD ENGINE ---
  useEffect(() => {
    const pendingItems = uploadQueue.filter(item => item.status === 'PENDING');

    if (pendingItems.length > 0 && activeUploads < 2) {
      const itemToUpload = pendingItems[0];

      setUploadQueue(prev =>
        prev.map(i => (i.id === itemToUpload.id ? { ...i, status: 'UPLOADING' } : i))
      );
      setActiveUploads(prev => prev + 1);

      const performUpload = async () => {
        try {
          const tokenRes = await api.getUploadToken(itemToUpload.filename, itemToUpload.mimeType);

          const googleRes = await fetch(tokenRes.uploadUrl, {
            method: 'PUT',
            headers: { 'Content-Type': itemToUpload.mimeType },
            body: itemToUpload.blob,
          });

          if (!googleRes.ok) throw new Error('Google Drive upload failed');

          const googleData = await googleRes.json();
          const realFileId = googleData.id;

          if (!realFileId) throw new Error('Upload succeeded but no file ID returned');

          // 🔴 STAGE-1 EXPLICIT CALL (LOG CREATION)
          await api.completeFulfillment({
            stage: 1,
            awb: itemToUpload.awb,
            videoUrl: `https://drive.google.com/file/d/${realFileId}/view`,
            folder_id: tokenRes.folderId || null,
          });

          setUploadQueue(prev => prev.filter(i => i.id !== itemToUpload.id));
        } catch (e) {
          console.error('❌ Fulfillment failed', e);
          alert('Fulfillment failed. Please check logs.');
          setUploadQueue(prev => prev.filter(i => i.id !== itemToUpload.id));
        } finally {
          setActiveUploads(prev => prev - 1);
        }
      };

      performUpload();
    }
  }, [uploadQueue, activeUploads]);

  return (
    <div className="fixed inset-0 bg-black flex flex-col" onClick={() => !audioEnabled && enableAudio()}>
      <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" playsInline muted />

      {/* HEADER */}
      <div className="absolute top-0 left-0 right-0 z-20 p-4 flex justify-between">
        <div>
          <h1 className="text-white font-bold">{packer.name}</h1>
          {uploadQueue.length === 0 ? (
            <span className="text-green-400 flex items-center gap-1">
              <CheckCircle size={12} /> Ready
            </span>
          ) : (
            <span className="text-yellow-400 flex items-center gap-1">
              <Loader2 size={12} className="animate-spin" /> Uploading…
            </span>
          )}
        </div>

        <div className="flex gap-4">
          <div className="p-2 text-white">{audioEnabled ? <Volume2 /> : <VolumeX />}</div>
          <button onClick={onLogout} className="p-2 text-white">
            <LogOut />
          </button>
        </div>
      </div>

      {/* RECORDING UI */}
      {status === 'RECORDING' && (
        <div
          onClick={stopRecording}
          className="absolute bottom-0 w-full h-[70%] bg-red-600/90 z-40 flex flex-col items-center justify-center"
        >
          <CloudUpload className="text-white mb-4" />
          <h2 className="text-white text-4xl font-black">STOP</h2>
          <p className="text-white mt-2">{awb}</p>
        </div>
      )}
    </div>
  );
};

export default MobilePackerInterface;
