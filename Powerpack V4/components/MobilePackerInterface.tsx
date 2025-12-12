import React, { useState, useEffect, useRef } from 'react';
import { useZxing } from 'react-zxing'; 
import { UserProfile } from '../types';
import { api } from '../services/api';
// NEW: Import supabase client directly for the edge function calls
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
  
  const stableTimerRef = useRef<any>(null);
  const lastSeenCodeRef = useRef<string | null>(null);

  // --- 1. ENABLE AUDIO ---
  const enableAudio = () => {
      playTone(0, 'sine', 0); 
      setAudioEnabled(true);
  };

  // --- NEW: STEP 1 (Log Scan Start) ---
  const logScanStart = async (scannedAwb: string) => {
      console.log('Step 1: Logging Scan Start for', scannedAwb);
      // Fire and forget (don't await) to keep UI fast
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
    // Stop scanning if we are already recording or detected
    if (status === 'RECORDING' || status === 'DETECTED') return;

    const rawCode = result.getText();
    if (!rawCode) return;

    if (rawCode !== lastSeenCodeRef.current) {
        lastSeenCodeRef.current = rawCode;
        setStatus('STABILIZING'); 
        
        if (stableTimerRef.current) clearTimeout(stableTimerRef.current);
        
        // 1-Second Stability Check
        stableTimerRef.current = setTimeout(() => {
            confirmScan(rawCode);
        }, 1000); 
    }
  };

  const { ref: videoRef } = useZxing({
    onDecodeResult: onScanResult,
    paused: status === 'RECORDING', // Important: Pause scanning while recording
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

      // 1. Fire Backend Log (Step 1)
      logScanStart(cleanCode);

      // 2. Audio Feedback
      playTone(880, 'square', 0.2); 

      setStatus('DETECTED');
      if (navigator.vibrate) navigator.vibrate(200);

      // 3. Start Recording after brief delay
      setTimeout(() => {
          startRecording();
      }, 500); 
  };

  const startRecording = () => {
      if (!videoRef.current || !videoRef.current.srcObject) {
          console.error("No video stream found to record!");
          return;
      }
      
      try {
          const stream = videoRef.current.srcObject as MediaStream;
          // Use correct mime type for broader compatibility
          const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') 
             ? 'video/webm;codecs=vp9' 
             : 'video/webm';

          const mediaRecorder = new MediaRecorder(stream, { mimeType });
          mediaRecorderRef.current = mediaRecorder;
          chunksRef.current = [];

          mediaRecorder.ondataavailable = (e) => {
              if (e.data.size > 0) chunksRef.current.push(e.data);
          };

          mediaRecorder.onstop = () => {
              const blob = new Blob(chunksRef.current, { type: 'video/webm' });
              console.log("Recording stopped. Blob size:", blob.size);
              if (blob.size > 0) {
                  addToQueue(blob, awbRef.current);
              } else {
                  alert("Recording failed: Empty file.");
              }
          };

          mediaRecorder.start();
          console.log("Recording started...");
          setStatus('RECORDING');
      } catch (err) {
          console.error("Failed to start MediaRecorder:", err);
          alert("Camera recording failed. Refresh page.");
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

  // --- 4. QUEUE & UPLOAD (Step 2 Logic) ---
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

  const saveToLocalFolder = async (blob: Blob, filename: string) => {
      try {
          let dirHandle = await getDirectoryHandle();
          if (!dirHandle) return;
          if ((await dirHandle.queryPermission({ mode: 'readwrite' })) !== 'granted') {
             if ((await dirHandle.requestPermission({ mode: 'readwrite' })) !== 'granted') return;
          }
          const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(blob);
          await writable.close();
      } catch (err) { console.error("Local save error", err); }
  };

  // --- DEBUGGING VERSION: UPLOAD PROCESS ---
  useEffect(() => {
      const processNext = async () => {
          if (isProcessing || uploadQueue.length === 0) return;
          setIsProcessing(true);
          const item = uploadQueue[0];

          try {
              console.log("1. Requesting Upload Token for:", item.filename);
              const tokenRes = await api.getUploadToken(item.filename, 'video/webm');
              console.log("2. Got Token/URL:", tokenRes);

              console.log("3. Starting File Upload...");
              const uploadRes = await fetch(tokenRes.uploadUrl, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'video/webm' },
                  body: item.blob
              });
              
              if (!uploadRes.ok) {
                  throw new Error(`Upload Failed: ${uploadRes.status} ${uploadRes.statusText}`);
              }
              console.log("4. Upload Success!");

              // Construct URL
              const finalVideoUrl = `https://drive.google.com/file/d/${tokenRes.fileId}/view`;

              console.log("5. Updating Fulfillment with URL:", finalVideoUrl);
              const { error } = await supabase.functions.invoke('fulfillment', {
                  body: {
                      action: 'scan_complete',
                      awb: item.awb,
                      video_url: finalVideoUrl,
                      timestamp: new Date().toISOString(),
                  },
              });

              if (error) throw error;
              console.log("6. Fulfillment Logged Successfully!");

              // Remove from queue on success
              setUploadQueue(prev => prev.slice(1));

          } catch (e: any) {
              console.error("CRITICAL UPLOAD ERROR:", e);
              alert(`Video Upload Failed: ${e.message}`);
              setUploadQueue(prev => prev.slice(1)); 
          } finally {
              setIsProcessing(false);
          }
      };
      processNext();
  }, [uploadQueue, isProcessing]);

  // --- 5. UI HANDLERS ---
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

        {/* CAMERA FEED */}
        <video 
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-cover"
            // Important for iOS/Mobile browsers to allow inline playback
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
                <p className="text-white/80 mt-2 font-mono text-xl">{awb}</p>
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
