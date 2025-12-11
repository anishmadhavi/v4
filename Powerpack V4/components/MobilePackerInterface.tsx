import React, { useState, useEffect, useRef } from 'react';
import { UserProfile, UserRole } from '../types';
import { api } from '../services/api';
import { Loader2, FolderOpen, LogOut, Zap } from 'lucide-react';

// --- INDEXEDDB HELPERS (Shared with Desktop) ---
const DB_NAME = 'PackerSettingsDB';
const STORE_NAME = 'settings';

const getDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e: any) => {
      e.target.result.createObjectStore(STORE_NAME);
    };
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
  } catch (e) {
    return null;
  }
};

const saveDirectoryHandle = async (handle: FileSystemDirectoryHandle) => {
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  store.put(handle, 'videoSaveDir');
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
  const [status, setStatus] = useState<'IDLE' | 'DETECTED' | 'RECORDING'>('IDLE');
  const [awb, setAwb] = useState(''); 
  const [scanBuffer, setScanBuffer] = useState(''); 
  const [uploadQueue, setUploadQueue] = useState<QueueItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const awbRef = useRef(''); 
  const scanTimeoutRef = useRef<any>(null);

  // --- 1. INITIALIZATION ---
  useEffect(() => {
    startCameraStream();

    const handleKeyDown = (e: KeyboardEvent) => {
        if (status === 'RECORDING') return; // Ignore scans while recording

        if (e.key === 'Enter') {
            if (scanBuffer.length > 3) {
                handleScan(scanBuffer);
                setScanBuffer('');
            }
        } else if (e.key.length === 1) {
            setScanBuffer(prev => prev + e.key);
        }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
        window.removeEventListener('keydown', handleKeyDown);
        stopCameraStream();
    };
  }, [scanBuffer, status]);

  // --- 2. CAMERA LOGIC ---
  const startCameraStream = async () => {
    try {
        if (videoRef.current && videoRef.current.srcObject) return;
        
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: 'environment' }, // Back camera
          audio: false 
        });
        
        if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play().catch(e => console.log("Autoplay blocked", e));
        }
    } catch (err) { console.error("Camera Error", err); }
  };

  const stopCameraStream = () => {
    if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
        videoRef.current.srcObject = null;
    }
  };

  // --- 3. CORE WORKFLOW ---

  const handleScan = (code: string) => {
      // 1. Clean the code
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

      // 2. VISUAL FEEDBACK: Show "DETECTED" state for 1 second
      setStatus('DETECTED');
      if (navigator.vibrate) navigator.vibrate(100);

      // 3. Wait 1 second, then start recording automatically
      if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
      
      scanTimeoutRef.current = setTimeout(async () => {
          await startRecording();
      }, 1000); // 1 Second Delay as requested
  };

  const startRecording = async () => {
      // Ensure camera is active
      if (!videoRef.current || !videoRef.current.srcObject) {
          await startCameraStream();
      }
      
      const stream = videoRef.current?.srcObject as MediaStream;
      if (!stream || !stream.active) return;

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
      if (navigator.vibrate) navigator.vibrate([50, 50, 50]); // distinct buzz
  };

  const stopRecording = () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop();
      }
      setStatus('IDLE');
      setAwb('');
      // We keep the camera ON for the next scan immediately
  };

  // --- 4. SAVING & UPLOAD (BACKGROUND) ---

  const addToQueue = (blob: Blob, recordedAwb: string) => {
      const filename = `${recordedAwb || 'scan'}.webm`;
      
      // 1. Save Locally (Memory Folder)
      saveToLocalFolder(blob, filename);

      // 2. Add to Upload Queue
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
          if (!dirHandle) {
             // If first time, we might fail silently on mobile if not triggered by user
             // But we will try anyway, or user can click the folder icon in header
             console.warn("No folder selected yet");
             return;
          }
          // Permission check
          if ((await dirHandle.queryPermission({ mode: 'readwrite' })) !== 'granted') {
             if ((await dirHandle.requestPermission({ mode: 'readwrite' })) !== 'granted') return;
          }

          const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(blob);
          await writable.close();
      } catch (err) {
          console.error("Local save error", err);
      }
  };

  // Queue Processor
  useEffect(() => {
      const processNext = async () => {
          if (isProcessing || uploadQueue.length === 0) return;
          setIsProcessing(true);
          const item = uploadQueue[0];

          try {
              // 1. Get Token
              const tokenRes = await api.getUploadToken(item.filename, 'video/webm');
              
              // 2. Upload to Drive
              await fetch(tokenRes.uploadUrl, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'video/webm' },
                  body: item.blob
              });

              // 3. Mark Complete in Backend
              await api.completeFulfillment({
                  awb: item.awb,
                  videoUrl: `https://drive.google.com/file/d/${tokenRes.fileId}/view`,
                  folderId: tokenRes.folderId || ''
              });

              // Success: Remove from queue
              setUploadQueue(prev => prev.slice(1));
          } catch (e) {
              console.error("Upload failed", e);
              // Retry logic or skip? For now, we skip to not block flow
              setUploadQueue(prev => prev.slice(1)); 
          } finally {
              setIsProcessing(false);
          }
      };
      processNext();
  }, [uploadQueue, isProcessing]);

  // --- 5. UI HANDLERS ---
  
  const handleFolderSetup = async () => {
      try {
          const handle = await window.showDirectoryPicker();
          await saveDirectoryHandle(handle);
          alert("Folder linked!");
      } catch (e) { console.log(e); }
  };

  return (
    <div className="fixed inset-0 bg-black overflow-hidden flex flex-col">
        {/* TOP BAR (Small, transparent) */}
        <div className="absolute top-0 left-0 right-0 z-20 p-4 flex justify-between items-start bg-gradient-to-b from-black/80 to-transparent">
            <div>
                <h1 className="text-white font-bold text-lg drop-shadow-md">
                   {packer.name}
                </h1>
                <div className="flex items-center gap-2 text-xs text-white/80">
                   <Zap size={12} className={status === 'RECORDING' ? 'text-red-500 fill-red-500' : 'text-green-500'} />
                   {uploadQueue.length === 0 ? 'Queue Empty' : `${uploadQueue.length} Uploading...`}
                </div>
            </div>
            <div className="flex gap-4">
                 <button onClick={handleFolderSetup} className="p-2 bg-white/10 rounded-full text-white backdrop-blur">
                    <FolderOpen size={20} />
                 </button>
                 <button onClick={onLogout} className="p-2 bg-white/10 rounded-full text-white backdrop-blur">
                    <LogOut size={20} />
                 </button>
            </div>
        </div>

        {/* FULL SCREEN VIDEO */}
        <video 
            ref={videoRef}
            autoPlay muted playsInline
            className="absolute inset-0 w-full h-full object-cover"
        />

        {/* STATE: DETECTED (The 1 Second Pause) */}
        {status === 'DETECTED' && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                <div className="bg-white text-black px-8 py-4 rounded-2xl shadow-2xl animate-bounce">
                    <h2 className="text-2xl font-black tracking-tighter">BARCODE DETECTED</h2>
                    <p className="text-center font-mono text-lg mt-1">{awb}</p>
                    <p className="text-center text-xs text-gray-500 mt-2">Starting Camera...</p>
                </div>
            </div>
        )}

        {/* STATE: RECORDING (The 70% Red Zone) */}
        {status === 'RECORDING' && (
            <div 
                onClick={stopRecording}
                className="absolute bottom-0 left-0 w-full h-[70%] bg-red-600/60 z-40 flex flex-col items-center justify-center backdrop-blur-sm active:bg-red-600/80 transition-colors cursor-pointer touch-manipulation"
            >
                <div className="bg-white/20 p-6 rounded-full animate-pulse">
                    <div className="w-4 h-4 bg-white rounded-sm"></div>
                </div>
                <h2 className="text-white font-black text-3xl mt-4 tracking-widest drop-shadow-lg">
                    TAP ANYWHERE TO STOP
                </h2>
                <p className="text-white/80 mt-2 font-mono text-xl">{awb}</p>
                <div className="absolute top-0 w-full h-1 bg-red-400 animate-[pulse_1s_infinite]"></div>
            </div>
        )}

        {/* STATE: IDLE (Scan Overlay) */}
        {status === 'IDLE' && (
            <div className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center">
                 {/* Visual Guide for Scanner */}
                 <div className="w-[80%] h-32 border-2 border-white/50 rounded-lg flex items-center justify-center relative">
                    <div className="w-[90%] h-0.5 bg-red-500/80 animate-pulse shadow-[0_0_10px_rgba(255,0,0,0.8)]"></div>
                    <p className="absolute -bottom-8 text-white/70 font-bold tracking-wider text-sm">
                        READY TO SCAN
                    </p>
                 </div>
            </div>
        )}
    </div>
  );
};

export default MobilePackerInterface;
