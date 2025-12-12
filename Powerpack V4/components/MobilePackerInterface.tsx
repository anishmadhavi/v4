import React, { useState, useEffect, useRef } from 'react';
import { useZxing } from 'react-zxing'; 
import { UserProfile } from '../types';
import { api } from '../services/api';
import { supabase } from '../lib/supabase';
import { FolderOpen, LogOut, Zap, ScanLine, Volume2, VolumeX } from 'lucide-react';

// --- INDEXEDDB HELPERS (Preserved) ---
const DB_NAME = 'PackerSettingsDB';
const STORE_NAME = 'settings';

const getDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e: any) => e.target.result.createObjectStore(STORE_NAME);
    request.onsuccess = (e: any) => resolve(e.target.result);
    request.onerror = (e) => reject(e);
  });
};

const getDirectoryHandle = async (): Promise<FileSystemDirectoryHandle | null> => {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get('videoSaveDir');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (e) { return null; }
};

const saveDirectoryHandle = async (handle: FileSystemDirectoryHandle) => {
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  store.put(handle, 'videoSaveDir');
};

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
  
  // NEW: Canvas Ref for drawing text overlay
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  
  const stableTimerRef = useRef<any>(null);
  const lastSeenCodeRef = useRef<string | null>(null);

  // --- 1. ENABLE AUDIO ---
  const enableAudio = () => {
      playTone(0, 'sine', 0); 
      setAudioEnabled(true);
  };

  // --- STEP 1: Log Scan Start ---
  const logScanStart = async (scannedAwb: string) => {
      console.log('Step 1: Logging Scan Start for', scannedAwb);
      supabase.functions.invoke('fulfillment', {
          body: {
              action: 'scan_start',
              awb: scannedAwb,
              timestamp: new Date().toISOString(),
          },
      }).then(({ error }) => {
          if (error) console.error("Step 1 Error:", error);
      });
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
      if (cleanCode.length > 8 && cleanCode.length % 2 === 0) {
        const half = cleanCode.length / 2;
        if (cleanCode.slice(0, half) === cleanCode.slice(half)) {
            cleanCode = cleanCode.slice(0, half);
        }
      }

      setAwb(cleanCode);
      awbRef.current = cleanCode;
      
      logScanStart(cleanCode);
      playTone(880, 'square', 0.2); 

      setStatus('DETECTED');
      if (navigator.vibrate) navigator.vibrate(200);

      setTimeout(() => {
          startRecording();
      }, 500); 
  };

  // --- MODIFIED: START RECORDING WITH OVERLAY ---
  const startRecording = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (!video || !canvas) {
          console.error("Video or Canvas missing");
          return;
      }

      try {
          // 1. Setup Canvas Dimensions to match Video (Full HD)
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          
          const ctx = canvas.getContext('2d');
          if (!ctx) return;

          // 2. Start Drawing Loop (Video + Text)
          const drawFrame = () => {
              if (!video || !ctx) return;
              
              // A. Draw the video frame
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

              // B. Configure Text Style
              const fontSize = Math.floor(canvas.height * 0.04); // Dynamic size (4% of height)
              ctx.font = `bold ${fontSize}px sans-serif`;
              ctx.fillStyle = 'white';
              ctx.strokeStyle = 'black';
              ctx.lineWidth = 4;
              ctx.lineJoin = 'round';

              // C. Prepare Strings
              const timestamp = new Date().toLocaleString(); // Date & Time
              const awbText = `AWB: ${awbRef.current}`;

              // D. Draw Text (Bottom Left Corner)
              const x = 30;
              const yTime = canvas.height - 30;
              const yAwb = canvas.height - 30 - fontSize - 10;

              // Draw Stroke (Outline) first
              ctx.strokeText(awbText, x, yAwb);
              ctx.strokeText(timestamp, x, yTime);

              // Draw Fill (Color) second
              ctx.fillText(awbText, x, yAwb);
              ctx.fillText(timestamp, x, yTime);

              // Loop
              animationFrameRef.current = requestAnimationFrame(drawFrame);
          };

          // Start the loop
          drawFrame();

          // 3. Capture Stream from Canvas (30 FPS)
          // 4 Mbps Bitrate for Clarity
          const stream = canvas.captureStream(30); 
          
          let mimeType = 'video/webm';
          if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
             mimeType = 'video/webm;codecs=vp9';
          } else if (MediaRecorder.isTypeSupported('video/webm;codecs=h264')) {
             mimeType = 'video/webm;codecs=h264'; 
          }

          const options: MediaRecorderOptions = {
              mimeType: mimeType,
              videoBitsPerSecond: 4000000 // 4 Mbps High Quality
          };

          const mediaRecorder = new MediaRecorder(stream, options);
          mediaRecorderRef.current = mediaRecorder;
          chunksRef.current = [];

          mediaRecorder.ondataavailable = (e) => {
              if (e.data && e.data.size > 0) {
                  chunksRef.current.push(e.data);
              }
          };

          mediaRecorder.onstop = () => {
              const blob = new Blob(chunksRef.current, { type: 'video/webm' });
              console.log("Recording finished. Size:", blob.size);
              
              // Stop the drawing loop to save battery
              if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
              
              if (blob.size > 0) {
                  addToQueue(blob, awbRef.current);
              } else {
                  console.warn("Empty recording detected.");
                  alert("Recording failed. Check permissions.");
              }
          };

          mediaRecorder.start(1000); 
          console.log("Recording started with Overlay...");
          setStatus('RECORDING');

      } catch (err) {
          console.error("Recorder Error:", err);
          alert("Could not start recording.");
      }
  };

  const stopRecording = () => {
      playTone(150, 'sawtooth', 0.3);

      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop();
      }
      
      // Stop the canvas loop immediately
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);

      setStatus('IDLE');
      setAwb('');
      lastSeenCodeRef.current = null;
      if (stableTimerRef.current) clearTimeout(stableTimerRef.current);
  };

  // --- 4. QUEUE & UPLOAD ---
  const addToQueue = (blob: Blob, recordedAwb: string) => {
      const filename = `${recordedAwb || 'scan'}.webm`;
      saveToLocalFolder(blob, filename);
      setUploadQueue(prev => [...prev, {
          id: Date.now().toString(),
          blob,
          awb: recordedAwb,
          filename
      }]);
  };

  // --- 5. DEBUGGING UPLOAD PROCESS ---
  useEffect(() => {
      const processNext = async () => {
          if (isProcessing || uploadQueue.length === 0) return;
          setIsProcessing(true);
          const item = uploadQueue[0];

          try {
              console.log("1. Requesting Token for:", item.filename);
              const tokenRes = await api.getUploadToken(item.filename, 'video/webm');
              
              console.log("2. Uploading File...");
              const uploadRes = await fetch(tokenRes.uploadUrl, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'video/webm' },
                  body: item.blob
              });
              
              if (!uploadRes.ok) throw new Error(`Upload Failed: ${uploadRes.status}`);
              console.log("3. Upload Success!");

              const finalVideoUrl = `https://drive.google.com/file/d/${tokenRes.fileId}/view`;

              console.log("4. Updating DB Log...");
              const { error } = await supabase.functions.invoke('fulfillment', {
                  body: {
                      action: 'scan_complete',
                      awb: item.awb,
                      video_url: finalVideoUrl,
                      timestamp: new Date().toISOString(),
                  },
              });

              if (error) throw error;
              console.log("5. Log Completed!");

              setUploadQueue(prev => prev.slice(1));

          } catch (e: any) {
              console.error("CRITICAL UPLOAD ERROR:", e);
              alert(`Upload Error: ${e.message}`);
              setUploadQueue(prev => prev.slice(1)); 
          } finally {
              setIsProcessing(false);
          }
      };
      processNext();
  }, [uploadQueue, isProcessing]);

  // --- UI HANDLERS ---
  const handleFolderSetup = async () => {
      enableAudio(); 
      try {
          const handle = await window.showDirectoryPicker();
          await saveDirectoryHandle(handle);
          alert("Folder linked!");
      } catch (e) { console.log(e); }
  };

  return (
    <div className="fixed inset-0 bg-black overflow-hidden flex flex-col" onClick={() => !audioEnabled && enableAudio()}>
        {/* HEADER */}
        <div className="absolute top-0 left-0 right-0 z-20 p-4 flex justify-between items-start bg-gradient-to-b from-black/80 to-transparent">
            <div>
                <h1 className="text-white font-bold text-lg drop-shadow-md">{packer.name}</h1>
                <div className="flex items-center gap-2 text-xs text-white/80">
                   <Zap size={12} className={status === 'RECORDING' ? 'text-red-500 fill-red-500' : 'text-green-500'} />
                   {uploadQueue.length === 0 ? 'Queue Empty' : `${uploadQueue.length} Uploading...`}
                </div>
            </div>
            <div className="flex gap-4">
                 <div className={`p-2 rounded-full backdrop-blur ${audioEnabled ? 'bg-white/10 text-white' : 'bg-red-500/50 text-white'}`}>
                    {audioEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
                 </div>

                 <button onClick={handleFolderSetup} className="p-2 bg-white/10 rounded-full text-white backdrop-blur">
                    <FolderOpen size={20} />
                 </button>
                 <button onClick={onLogout} className="p-2 bg-white/10 rounded-full text-white backdrop-blur">
                    <LogOut size={20} />
                 </button>
            </div>
        </div>

        {/* HIDDEN CANVAS (Used for Recording Overlay) */}
        {/* We keep this hidden from view, but use it to generate the video file */}
        <canvas ref={canvasRef} className="hidden" />

        {/* CAMERA FEED - VISIBLE TO USER */}
        <video 
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-cover"
            playsInline 
            muted 
        />

        {/* FEEDBACK OVERLAYS */}
        {status === 'STABILIZING' && (
             <div className="absolute inset-0 pointer-events-none z-10 flex flex-col items-center justify-center bg-black/10">
                 <div className="absolute inset-4 border-4 border-yellow-400/50 rounded-2xl animate-pulse"></div>
                 <ScanLine className="text-yellow-400 animate-pulse w-32 h-32 drop-shadow-lg" />
                 <p className="text-yellow-400 font-black text-2xl mt-4 drop-shadow-md">HOLD STILL...</p>
             </div>
        )}

        {status === 'DETECTED' && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-green-500/20 backdrop-blur-sm">
                <div className="bg-green-600 text-white px-10 py-8 rounded-3xl shadow-2xl animate-bounce">
                    <h2 className="text-4xl font-black tracking-tighter">SCANNED!</h2>
                    <p className="text-center font-mono text-xl mt-2">{awb}</p>
                </div>
            </div>
        )}

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
                {/* Visual indicator that text is being burnt in */}
                <p className="text-white/80 mt-2 font-mono text-sm uppercase">
                    • REC • {awb}
                </p>
            </div>
        )}

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
