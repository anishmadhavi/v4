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
}

const MobilePackerInterface: React.FC<Props> = ({ packer, onLogout }) => {
  const [status, setStatus] = useState<'IDLE' | 'STABILIZING' | 'DETECTED' | 'RECORDING'>('IDLE');
  const [awb, setAwb] = useState(''); 
  const [uploadQueue, setUploadQueue] = useState<QueueItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(false);

  // Refs for data that doesn't need to trigger re-renders
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const awbRef = useRef(''); 
  
  const stableTimerRef = useRef<any>(null);
  const lastSeenCodeRef = useRef<string | null>(null);

  // --- 1. ENABLE AUDIO ---
  const enableAudio = () => {
      playTone(0, 'sine', 0); 
      setAudioEnabled(true);
  };

  // --- 2. RECORDING LOGIC (Memoized to prevent scanner lag) ---
  
  // Add to Queue Wrapper
  const addToQueue = useCallback((blob: Blob, recordedAwb: string, mimeType: string) => {
      const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
      const filename = `${recordedAwb || 'scan'}.${ext}`;
      
      setUploadQueue(prev => [...prev, {
          id: Date.now().toString(),
          blob,
          awb: recordedAwb,
          filename,
          mimeType
      }]);
  }, []);

  const startRecording = useCallback(() => {
      // Access the video element from the ref directly in the hook below, 
      // but here we need to ensure we have the stream.
      // We'll pass the stream from the hook or look it up if needed.
      // *Optimization*: We will capture stream in the confirmScan logic.
  }, []); // Placeholder, actual logic moved inside confirmScan to access videoRef safely

  const stopRecording = useCallback(() => {
      playTone(150, 'sawtooth', 0.3);

      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop();
      }
      
      // IMMEDIATE RESET for fast scanning
      setStatus('IDLE');
      setAwb('');
      lastSeenCodeRef.current = null;
      if (stableTimerRef.current) clearTimeout(stableTimerRef.current);
  }, []);

  // --- 3. SCANNING LOGIC ---
  
  // We define this separately to break the dependency cycle
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
          const mediaRecorder = new MediaRecorder(stream, { mimeType });
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
  }, [addToQueue]);

  // Memoized Scan Handler to prevent re-creation on render
  const onScanResult = useCallback((result: any) => {
    // If we are recording or already detected, ignore everything.
    // We check the REF for status if possible, but state is fine here 
    // because we stop scanning logic via this guard.
    if (status === 'RECORDING' || status === 'DETECTED') return;

    const rawCode = result.getText();
    if (!rawCode) return;

    if (rawCode !== lastSeenCodeRef.current) {
        lastSeenCodeRef.current = rawCode;
        setStatus('STABILIZING'); 
        
        if (stableTimerRef.current) clearTimeout(stableTimerRef.current);
        
        // --- UPDATED: 2 SECOND DELAY ---
        stableTimerRef.current = setTimeout(() => {
            // We need the video element to start recording. 
            // Since we can't easily access videoRef.current here without triggering deps,
            // we will find it by ID or assume standard behavior.
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

  // --- 4. BACKGROUND UPLOAD QUEUE ---
  useEffect(() => {
      const processNext = async () => {
          if (isProcessing || uploadQueue.length === 0) return;
          setIsProcessing(true);
          const item = uploadQueue[0];

          try {
              const tokenRes = await api.getUploadToken(item.filename, item.mimeType);
              
              await fetch(tokenRes.uploadUrl, {
                  method: 'PUT',
                  headers: { 'Content-Type': item.mimeType },
                  body: item.blob
              });

              await api.completeFulfillment({
                  awb: item.awb,
                  videoUrl: `https://drive.google.com/file/d/${tokenRes.fileId}/view`,
                  folderId: tokenRes.folderId || ''
              });

              setUploadQueue(prev => prev.slice(1));
          } catch (e) {
              console.error("Upload failed", e);
              // On error, remove it so it doesn't block the queue forever
              setUploadQueue(prev => prev.slice(1)); 
          } finally {
              setIsProcessing(false);
          }
      };
      processNext();
  }, [uploadQueue, isProcessing]);

  return (
    <div className="fixed inset-0 bg-black overflow-hidden flex flex-col" onClick={() => !audioEnabled && enableAudio()}>
        {/* HEADER - Shows Upload Status independently */}
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
                           Uploading {uploadQueue.length} remaining...
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

        {/* CAMERA FEED - Always Active */}
        <video 
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-cover"
            playsInline
            muted 
        />

        {/* FEEDBACK: STABILIZING (2 Seconds) */}
        {status === 'STABILIZING' && (
             <div className="absolute inset-0 pointer-events-none z-10 flex flex-col items-center justify-center bg-black/10">
                 <div className="absolute inset-4 border-4 border-yellow-400/50 rounded-2xl animate-pulse"></div>
                 <ScanLine className="text-yellow-400 animate-pulse w-32 h-32 drop-shadow-lg" />
                 <p className="text-yellow-400 font-black text-2xl mt-4 drop-shadow-md">HOLD STEADY...</p>
                 {/* Visual countdown hint */}
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
                    <span className="font-mono text-sm">Uploads in Background</span>
                </div>
                <p className="text-white/80 font-mono text-xl mt-1">{awb}</p>
            </div>
        )}

        {/* IDLE GUIDE - "READY" Indicator */}
        {status === 'IDLE' && (
            <div className="absolute inset-0 pointer-events-none z-10 flex flex-col items-center justify-center">
                 {!audioEnabled && (
                     <div className="absolute top-24 bg-red-600 text-white px-6 py-3 rounded-full font-bold animate-bounce z-50 shadow-lg">
                        TAP SCREEN TO ENABLE AUDIO
                     </div>
                 )}
                 
                 {/* VISUAL CUE: READY TO SCAN */}
                 <div className="bg-black/40 backdrop-blur-md px-6 py-2 rounded-full border border-white/20 flex items-center gap-2 mb-8">
                    <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="text-white font-bold tracking-widest text-sm">SCANNER READY</span>
                 </div>

                 <div className="absolute top-10 left-10 w-16 h-16 border-l-4 border-t-4 border-white/40 rounded-tl-xl"></div>
                 <div className="absolute top-10 right-10 w-16 h-16 border-r-4 border-t-4 border-white/40 rounded-tr-xl"></div>
                 <div className="absolute bottom-10 left-10 w-16 h-16 border-l-4 border-b-4 border-white/40 rounded-bl-xl"></div>
                 <div className="absolute bottom-10 right-10 w-16 h-16 border-r-4 border-b-4 border-white/40 rounded-br-xl"></div>
            </div>
        )}
    </div>
  );
};

export default MobilePackerInterface;
