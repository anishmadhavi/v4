import React, { useState, useEffect, useRef } from 'react';
import { useZxing } from 'react-zxing'; 
import { UserProfile } from '../types';
import { api } from '../services/api';
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

// --- AUDIO ENGINE (NEW) ---
// This creates a beep mathematically without needing mp3 files
const playTone = (freq: number, type: 'sine' | 'square' | 'sawtooth', duration: number) => {
    try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContext) return;
        
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        
        gain.gain.setValueAtTime(0.1, ctx.currentTime); // Volume (0.1 is usually loud enough for beeps)
        gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + duration);

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
  // States
  const [status, setStatus] = useState<'IDLE' | 'STABILIZING' | 'DETECTED' | 'RECORDING'>('IDLE');
  const [awb, setAwb] = useState(''); 
  const [uploadQueue, setUploadQueue] = useState<QueueItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(false);

  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const awbRef = useRef(''); 
  
  // Stability Logic Refs
  const stableTimerRef = useRef<any>(null);
  const lastSeenCodeRef = useRef<string | null>(null);

  // --- 1. ENABLE AUDIO ---
  // We need one user interaction to "unlock" audio context on mobile
  const enableAudio = () => {
      playTone(0, 'sine', 0); // Silent dummy sound to unlock
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
        
        // 1-Second Stability Check
        stableTimerRef.current = setTimeout(() => {
            confirmScan(rawCode);
        }, 1000); 
    }
  };

  const { ref: videoRef } = useZxing({
    onDecodeResult: onScanResult,
    paused: status === 'RECORDING',
    constraints: {
        audio: false,
        video: { facingMode: 'environment' }
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

      // --- AUDIO FEEDBACK (SUCCESS) ---
      // High Pitch (1200Hz), Pure Tone
      playTone(1200, 'sine', 0.15); 
      // --------------------------------

      setStatus('DETECTED');
      if (navigator.vibrate) navigator.vibrate(200);

      // Trigger Recording
      setTimeout(() => {
          startRecording();
      }, 500); 
  };

  const startRecording = () => {
      if (!videoRef.current || !videoRef.current.srcObject) return;
      
      const stream = videoRef.current.srcObject as MediaStream;
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: 'video/webm' });
          addToQueue(blob, awbRef.current);
      };

      mediaRecorder.start();
      setStatus('RECORDING');
  };

  const stopRecording = () => {
      // --- AUDIO FEEDBACK (STOP) ---
      // Low Pitch (300Hz), Buzzer like
      playTone(300, 'sawtooth', 0.2);
      // -----------------------------

      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop();
      }
      
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

  useEffect(() => {
      const processNext = async () => {
          if (isProcessing || uploadQueue.length === 0) return;
          setIsProcessing(true);
          const item = uploadQueue[0];

          try {
              const tokenRes = await api.getUploadToken(item.filename, 'video/webm');
              await fetch(tokenRes.uploadUrl, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'video/webm' },
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
              setUploadQueue(prev => prev.slice(1)); 
          } finally {
              setIsProcessing(false);
          }
      };
      processNext();
  }, [uploadQueue, isProcessing]);

  // --- 5. UI HANDLERS ---
  const handleFolderSetup = async () => {
      enableAudio(); // Also enable audio when they set up folder
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
                 {/* AUDIO INDICATOR */}
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
        />

        {/* FEEDBACK: STABILIZING (Yellow warning) */}
        {status === 'STABILIZING' && (
             <div className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center">
                 <div className="w-[80%] h-64 border-4 border-yellow-400 rounded-lg flex flex-col items-center justify-center bg-black/20 backdrop-blur-sm">
                     <ScanLine className="text-yellow-400 animate-pulse w-16 h-16" />
                     <p className="text-yellow-400 font-bold text-xl mt-4">HOLD STILL...</p>
                 </div>
             </div>
        )}

        {/* FEEDBACK: DETECTED (Success Green) */}
        {status === 'DETECTED' && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                <div className="bg-green-500 text-white px-8 py-6 rounded-2xl shadow-2xl animate-bounce">
                    <h2 className="text-3xl font-black tracking-tighter">SCANNED!</h2>
                    <p className="text-center font-mono text-xl mt-1">{awb}</p>
                </div>
            </div>
        )}

        {/* INTERACTION: RECORDING (Red Slap Zone) */}
        {status === 'RECORDING' && (
            <div 
                onClick={(e) => { e.stopPropagation(); stopRecording(); }}
                className="absolute bottom-0 left-0 w-full h-[70%] bg-red-600/80 z-40 flex flex-col items-center justify-center backdrop-blur-md active:bg-red-700 transition-colors cursor-pointer touch-manipulation"
            >
                <div className="bg-white/20 p-6 rounded-full animate-pulse">
                    <div className="w-6 h-6 bg-white rounded-sm"></div>
                </div>
                <h2 className="text-white font-black text-4xl mt-4 tracking-widest drop-shadow-lg select-none">
                    STOP
                </h2>
                <p className="text-white/80 mt-2 font-mono text-xl">{awb}</p>
            </div>
        )}

        {/* IDLE GUIDE */}
        {status === 'IDLE' && (
            <div className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center">
                 {!audioEnabled && (
                     <div className="absolute top-20 bg-red-500 text-white px-4 py-2 rounded-full font-bold animate-pulse z-50">
                        TAP SCREEN TO ENABLE AUDIO
                     </div>
                 )}
                 <div className="w-[80%] h-48 border-2 border-white/30 rounded-lg flex items-center justify-center relative">
                    <p className="absolute -bottom-8 text-white/50 font-bold tracking-wider text-sm">
                        SHOW BARCODE
                    </p>
                 </div>
            </div>
        )}
    </div>
  );
};

export default MobilePackerInterface;
