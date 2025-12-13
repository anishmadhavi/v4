import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useZxing } from 'react-zxing'; 
import { UserProfile } from '../types';
import { api } from '../services/api';
import { LogOut, Zap, ScanLine, Volume2, VolumeX, CheckCircle, CloudUpload, Loader2 } from 'lucide-react';

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
        console.error("Audio playback failed", e);
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

  // --- 1. RECORDING START (With Bitrate Optimization) ---
  const triggerRecordStart = (videoElement: HTMLVideoElement) => {
      if (!videoElement.srcObject) return;
      
      const stream = videoElement.srcObject as MediaStream;
      
      let mimeType = 'video/webm';
      if (MediaRecorder.isTypeSupported('video/mp4')) {
          mimeType = 'video/mp4'; 
      } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
          mimeType = 'video/webm;codecs=vp9'; 
      }

      try {
          const mediaRecorder = new MediaRecorder(stream, { 
              mimeType,
              // PERFORMANCE HACK: 2.5 Mbps is HD quality but 5x smaller file size
              videoBitsPerSecond: 2500000 
          });
          
          mediaRecorderRef.current = mediaRecorder;
          chunksRef.current = [];

          mediaRecorder.ondataavailable = (e) => {
              if (e.data.size > 0) chunksRef.current.push(e.data);
          };

          mediaRecorder.onstop = () => {
              const blob = new Blob(chunksRef.current, { type: mimeType });
              addToQueue(blob, awbRef.current, mimeType);
          };

          mediaRecorder.start();
          setStatus('RECORDING');
      } catch (e) {
          console.error("Failed to start MediaRecorder", e);
          setStatus('IDLE');
      }
  };

  // --- 2. QUEUE MANAGEMENT ---
  const addToQueue = useCallback((blob: Blob, recordedAwb: string, mimeType: string) => {
      const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
      const filename = `${recordedAwb || 'scan'}.${ext}`;
      
      setUploadQueue(prev => [...prev, {
          id: Date.now().toString(),
          blob,
          awb: recordedAwb,
          filename,
          mimeType,
          status: 'PENDING'
      }]);
  }, []);

  const stopRecording = useCallback(() => {
      playTone(150, 'sawtooth', 0.3);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop();
      }
      setStatus('IDLE');
      setAwb('');
      lastSeenCodeRef.current = null;
      if (stableTimerRef.current) clearTimeout(stableTimerRef.current);
  }, []);

  // --- 3. SCANNING LOGIC ---
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
      if (navigator.vibrate) navigator.vibrate(200);

      setTimeout(() => {
          triggerRecordStart(videoElement);
      }, 500); 
  }, []);

  const onScanResult = useCallback((result: any) => {
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
  }, [status, confirmScan]);

  const { ref: videoRef } = useZxing({
    onDecodeResult: onScanResult,
    constraints: {
        audio: false,
        video: { 
            facingMode: 'environment',
            width: { ideal: 1920 },
            height: { ideal: 1080 } 
        }
    }
  });

  // --- 4. PARALLEL UPLOAD ENGINE (FIXED) ---
  useEffect(() => {
      const pendingItems = uploadQueue.filter(item => item.status === 'PENDING');
      
      if (pendingItems.length > 0 && activeUploads < 2) {
          const itemToUpload = pendingItems[0];
          
          setUploadQueue(prev => prev.map(i => 
              i.id === itemToUpload.id ? { ...i, status: 'UPLOADING' } : i
          ));
          setActiveUploads(prev => prev + 1);

          const performUpload = async () => {
              try {
                  // A. Get Token
                  const tokenRes = await api.getUploadToken(itemToUpload.filename, itemToUpload.mimeType);
                  
                  // B. Upload to Google & Capture Response
                  const googleRes = await fetch(tokenRes.uploadUrl, {
                      method: 'PUT',
                      headers: { 'Content-Type': itemToUpload.mimeType },
                      body: itemToUpload.blob
                  });

                  if (!googleRes.ok) throw new Error("Google Drive Upload Failed");
                  
                  // *** CRITICAL FIX: Extract Real File ID ***
                  const googleData = await googleRes.json();
                  const realFileId = googleData.id; 

                  // C. Send to Backend (Fulfillment)
                  await api.completeFulfillment({
                      awb: itemToUpload.awb,
                      videoUrl: `https://drive.google.com/file/d/${realFileId}/view`,
                      folderId: tokenRes.folderId || '' 
                  });

                  // Success: Remove
                  setUploadQueue(prev => prev.filter(i => i.id !== itemToUpload.id));
              } catch (e) {
                  console.error("Upload failed", e);
                  setUploadQueue(prev => prev.filter(i => i.id !== itemToUpload.id));
              } finally {
                  setActiveUploads(prev => prev - 1);
              }
          };
          
          performUpload();
      }
  }, [uploadQueue, activeUploads]);

  return (
    <div className="fixed inset-0 bg-black overflow-hidden flex flex-col" onClick={() => !audioEnabled && enableAudio()}>
        {/* HEADER */}
        <div className="absolute top-0 left-0 right-0 z-20 p-4 flex justify-between items-start bg-gradient-to-b from-black/80 to-transparent">
            <div>
                <h1 className="text-white font-bold text-lg drop-shadow-md">{packer.name}</h1>
                <div className="flex items-center gap-2 text-xs text-white/80">
                   {uploadQueue.length === 0 ? (
                       <span className="flex items-center gap-1 text-green-400 font-bold">
                           <CheckCircle size={12}/> Ready
                       </span>
                   ) : (
                       <span className="flex items-center gap-1 text-yellow-400 font-bold">
                           <Loader2 size={12} className="animate-spin"/> 
                           Uploading... ({activeUploads} active, {uploadQueue.length - activeUploads} waiting)
                       </span>
                   )}
                </div>
            </div>
            <div className="flex gap-4">
                 <div className={`p-2 rounded-full backdrop-blur ${audioEnabled ? 'bg-white/10 text-white' : 'bg-red-500/50 text-white'}`}>
                    {audioEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
                 </div>
                 <button onClick={onLogout} className="p-2 bg-white/10 rounded-full text-white backdrop-blur">
                    <LogOut size={20} />
                 </button>
            </div>
        </div>

        {/* CAMERA FEED */}
        <video 
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-cover"
            playsInline
            muted 
        />

        {/* FEEDBACK: STABILIZING */}
        {status === 'STABILIZING' && (
             <div className="absolute inset-0 pointer-events-none z-10 flex flex-col items-center justify-center bg-black/10">
                 <div className="absolute inset-4 border-4 border-yellow-400/50 rounded-2xl animate-pulse"></div>
                 <ScanLine className="text-yellow-400 animate-pulse w-32 h-32 drop-shadow-lg" />
                 <p className="text-yellow-400 font-black text-2xl mt-4 drop-shadow-md">HOLD STEADY...</p>
                 <div className="w-64 h-2 bg-gray-700 rounded-full mt-2 overflow-hidden">
                    <div className="h-full bg-yellow-400 animate-[width_2s_linear_forwards] w-0"></div>
                 </div>
             </div>
        )}

        {/* FEEDBACK: DETECTED */}
        {status === 'DETECTED' && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-green-500/20 backdrop-blur-sm">
                <div className="bg-green-600 text-white px-10 py-8 rounded-3xl shadow-2xl animate-bounce">
                    <h2 className="text-4xl font-black tracking-tighter">SCANNED!</h2>
                    <p className="text-center font-mono text-xl mt-2">{awb}</p>
                </div>
            </div>
        )}

        {/* RECORDING MODE */}
        {status === 'RECORDING' && (
            <div 
                onClick={(e) => { e.stopPropagation(); stopRecording(); }}
                className="absolute bottom-0 left-0 w-full h-[70%] bg-red-600/90 z-40 flex flex-col items-center justify-center backdrop-blur-md active:bg-red-700 transition-colors cursor-pointer touch-manipulation"
            >
                <div className="bg-white/20 p-8 rounded-full animate-pulse mb-4">
                    <div className="w-8 h-8 bg-white rounded-sm"></div>
                </div>
                <h2 className="text-white font-black text-5xl tracking-widest drop-shadow-xl select-none">
                    STOP
                </h2>
                <div className="flex items-center gap-2 mt-4 text-white/80">
                    <CloudUpload size={16} />
                    <span className="font-mono text-sm">Turbo Upload Active</span>
                </div>
                <p className="text-white/80 font-mono text-xl mt-1">{awb}</p>
            </div>
        )}

        {/* IDLE GUIDE */}
        {status === 'IDLE' && (
            <div className="absolute inset-0 pointer-events-none z-10 flex flex-col items-center justify-center">
                 {!audioEnabled && (
                     <div className="absolute top-24 bg-red-600 text-white px-6 py-3 rounded-full font-bold animate-bounce z-50 shadow-lg">
                        TAP SCREEN TO ENABLE AUDIO
                     </div>
                 )}
                 
                 <div className="bg-black/40 backdrop-blur-md px-6 py-2 rounded-full border border-white/20 flex items-center gap-2 mb-8">
                    <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="text-white font-bold tracking-widest text-sm">SCANNER READY</span>
                 </div>
            </div>
        )}
    </div>
  );
};

export default MobilePackerInterface;
