import React, { useState, useEffect, useRef } from 'react';
import { useZxing } from 'react-zxing'; 
import { UserProfile } from '../types';
import { api } from '../services/api';
import { LogOut, Zap, ScanLine, Volume2, VolumeX, Download, CheckCircle } from 'lucide-react';

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

  // --- 2. CAMERA & SCANNING LOGIC ---
  const onScanResult = (result: any) => {
    if (status === 'RECORDING' || status === 'DETECTED') return;

    const rawCode = result.getText();
    if (!rawCode) return;

    if (rawCode !== lastSeenCodeRef.current) {
        lastSeenCodeRef.current = rawCode;
        setStatus('STABILIZING'); 
        
        if (stableTimerRef.current) clearTimeout(stableTimerRef.current);
        
        stableTimerRef.current = setTimeout(() => {
            confirmScan(rawCode);
        }, 1000); 
    }
  };

  const { ref: videoRef } = useZxing({
    onDecodeResult: onScanResult,
    // CRITICAL FIX: Do NOT pause the camera. 
    // This ensures the video feed is alive for the MediaRecorder.
    constraints: {
        audio: false,
        video: { 
            facingMode: 'environment',
            width: { ideal: 1920 },
            height: { ideal: 1080 } 
        }
    }
  });

  // --- 3. CORE WORKFLOW ---
  const confirmScan = (code: string) => {
      let cleanCode = code.trim();
      // Double naming fix
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
          startRecording();
      }, 500); 
  };

  const startRecording = () => {
      if (!videoRef.current || !videoRef.current.srcObject) return;
      
      const stream = videoRef.current.srcObject as MediaStream;
      
      // FIX: Detect correct MIME type for iOS vs Android
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
          alert("Camera Recording Error: Not supported on this browser.");
          setStatus('IDLE');
      }
  };

  const stopRecording = () => {
      playTone(150, 'sawtooth', 0.3);

      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop();
      }
      
      setStatus('IDLE');
      setAwb('');
      lastSeenCodeRef.current = null;
      if (stableTimerRef.current) clearTimeout(stableTimerRef.current);
  };

  // --- 4. QUEUE & UPLOAD ---
  const addToQueue = (blob: Blob, recordedAwb: string, mimeType: string) => {
      const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
      const filename = `${recordedAwb || 'scan'}.${ext}`;
      
      // 1. Add to Upload Queue FIRST (Priority)
      setUploadQueue(prev => [...prev, {
          id: Date.now().toString(),
          blob,
          awb: recordedAwb,
          filename,
          mimeType
      }]);

      // 2. Trigger Mobile Download (Delayed to not kill upload)
      setTimeout(() => {
          forceMobileDownload(blob, filename);
      }, 1500);
  };

  // Mobile Download Helper
  const forceMobileDownload = (blob: Blob, filename: string) => {
      try {
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.style.display = 'none';
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          setTimeout(() => {
              document.body.removeChild(a);
              window.URL.revokeObjectURL(url);
          }, 100);
      } catch (e) {
          console.error("Download failed", e);
      }
  };

  useEffect(() => {
      const processNext = async () => {
          if (isProcessing || uploadQueue.length === 0) return;
          setIsProcessing(true);
          const item = uploadQueue[0];

          try {
              // Using item.mimeType to ensure API knows what we are sending
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
              // Retry Logic: Keep in queue if network error? 
              // For now, we remove it to prevent blocking, but you could add a 'retry' status
              setUploadQueue(prev => prev.slice(1)); 
          } finally {
              setIsProcessing(false);
          }
      };
      processNext();
  }, [uploadQueue, isProcessing]);

  return (
    <div className="fixed inset-0 bg-black overflow-hidden flex flex-col" onClick={() => !audioEnabled && enableAudio()}>
        {/* HEADER */}
        <div className="absolute top-0 left-0 right-0 z-20 p-4 flex justify-between items-start bg-gradient-to-b from-black/80 to-transparent">
            <div>
                <h1 className="text-white font-bold text-lg drop-shadow-md">{packer.name}</h1>
                <div className="flex items-center gap-2 text-xs text-white/80">
                   {/* Queue Indicator */}
                   {uploadQueue.length === 0 ? (
                       <span className="flex items-center gap-1 text-green-400"><CheckCircle size={12}/> All Uploaded</span>
                   ) : (
                       <span className="flex items-center gap-1 text-yellow-400"><Zap size={12} className="animate-pulse"/> {uploadQueue.length} Pending...</span>
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
                 <p className="text-yellow-400 font-black text-2xl mt-4 drop-shadow-md">HOLD STILL...</p>
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
                    <Download size={16} />
                    <span className="font-mono text-sm">Saving to Gallery...</span>
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
                 
                 <div className="absolute top-10 left-10 w-16 h-16 border-l-4 border-t-4 border-white/40 rounded-tl-xl"></div>
                 <div className="absolute top-10 right-10 w-16 h-16 border-r-4 border-t-4 border-white/40 rounded-tr-xl"></div>
                 <div className="absolute bottom-10 left-10 w-16 h-16 border-l-4 border-b-4 border-white/40 rounded-bl-xl"></div>
                 <div className="absolute bottom-10 right-10 w-16 h-16 border-r-4 border-b-4 border-white/40 rounded-br-xl"></div>

                 <p className="text-white/50 font-bold tracking-widest text-lg bg-black/20 px-4 py-1 rounded-full backdrop-blur-sm">
                    SCAN ANYWHERE
                 </p>
            </div>
        )}
    </div>
  );
};

export default MobilePackerInterface;
