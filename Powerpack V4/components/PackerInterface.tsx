import React, { useState, useEffect, useRef } from 'react';
import { UserProfile, VideoLog, UserRole } from '../types';
import { api } from '../services/api';
import { StopCircle, LogOut, Video as VideoIcon, UploadCloud, Keyboard, Search, X, Loader2, AlertTriangle, FolderOpen } from 'lucide-react';

// --- INDEXEDDB HELPERS (For Folder Memory) ---
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
    console.error("DB Read Error", e);
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
interface PackerInterfaceProps {
  packer: UserProfile;
  onLogout: () => void;
}

interface QueueItem {
  id: string;
  blob: Blob;
  awb: string;
  filename: string;
  attempts: number;
}

const PackerInterface: React.FC<PackerInterfaceProps> = ({ packer, onLogout }) => {
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  
  // Camera & Recording State
  const [recording, setRecording] = useState(false);
  const [awb, setAwb] = useState(''); 
  const [manualAwb, setManualAwb] = useState(''); 
  const [isScanning, setIsScanning] = useState(false); 
  const [showMobileInput, setShowMobileInput] = useState(false);
  const [scanBuffer, setScanBuffer] = useState(''); 

  // Queue State
  const [uploadQueue, setUploadQueue] = useState<QueueItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Logs & History
  const [logs, setLogs] = useState<VideoLog[]>([]);
  
  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const awbRef = useRef(''); 
  const scanTimerRef = useRef<any>(null);
  const lastScanTimeRef = useRef<number>(0); 

  // --- 1. SETUP & HARDWARE ---
  useEffect(() => {
    const handleResize = () => setDevice(window.innerWidth < 768 ? 'mobile' : 'desktop');
    handleResize();
    window.addEventListener('resize', handleResize);
    
    // Scanner Input Handler
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.target instanceof HTMLInputElement) return;
        if (device === 'desktop') {
            if (e.key === 'Enter') {
                if (scanBuffer.length > 3) {
                    handleScan(scanBuffer);
                    setScanBuffer('');
                }
            } else if (e.key.length === 1) {
                setScanBuffer(prev => prev + e.key);
            }
        }
    };
    window.addEventListener('keydown', handleKeyDown);

    // Initial Camera Start
    startCameraStream();
    
    // Initial Logs Fetch
    api.getLogs(packer.id, UserRole.PACKER).then(data => setLogs(data.slice(0,5))).catch(console.error);

    return () => {
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('keydown', handleKeyDown);
        stopCameraStream(); 
    };
  }, [scanBuffer, device, packer.id]);


  // --- 2. CAMERA MANAGEMENT ---
  
  const startCameraStream = async () => {
    try {
        // If stream already exists and is active, don't restart
        if (videoRef.current && videoRef.current.srcObject) {
             const currentStream = videoRef.current.srcObject as MediaStream;
             if(currentStream.active && currentStream.getVideoTracks()[0].readyState === 'live') {
                 return; // Already good to go
             }
        }

        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: 'environment' }, 
          audio: false 
        });
        
        if (videoRef.current) {
            videoRef.current.srcObject = stream;
            // Await play to ensure the browser has actually started the pixels flowing
            await videoRef.current.play().catch(e => console.log("Play error (expected if backgrounded)", e));
        }
    } catch (err) { console.error("Camera error:", err); }
  };

  const stopCameraStream = () => {
    if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
        videoRef.current.srcObject = null;
    }
  };


  // --- 3. RECORDING LOGIC ---
  
  // FIX: Make this robust. It now ensures camera is ready before recording.
  const startRecording = async () => {
    // 1. Ensure camera is running. If not, start it and WAIT.
    if (!videoRef.current || !videoRef.current.srcObject) {
        console.log("Camera was cold, starting now...");
        await startCameraStream();
    }
    
    // 2. Double check: Is the stream active?
    const stream = videoRef.current?.srcObject as MediaStream;
    if (!stream || !stream.active) {
        console.error("Camera failed to start, cannot record.");
        return;
    }

    const sessionAwb = awbRef.current; 

    // 3. Initialize Recorder
    try {
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        chunksRef.current = [];

        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunksRef.current.push(e.data);
        };

        mediaRecorder.onstop = () => {
            const blob = new Blob(chunksRef.current, { type: 'video/webm' });
            addToQueue(blob, sessionAwb); 
        };

        mediaRecorder.start();
        setRecording(true);
        console.log("Recording started for:", sessionAwb);
    } catch (e) {
        console.error("MediaRecorder failed to start", e);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
    }
    
    setRecording(false);
    setAwb('');
    awbRef.current = '';

    // Stop camera to prevent browser "Recording" icon persistence
    stopCameraStream(); 
  };

  const handleScan = async (scannedCode: string) => {
    if (!scannedCode) return;

    // Debounce
    const now = Date.now();
    if (now - lastScanTimeRef.current < 2000 && scannedCode === awbRef.current) {
        return;
    }
    lastScanTimeRef.current = now;

    // Double Naming Fix
    let cleanCode = scannedCode.trim();
    if (cleanCode.length > 8 && cleanCode.length % 2 === 0) {
        const half = cleanCode.length / 2;
        const firstHalf = cleanCode.slice(0, half);
        const secondHalf = cleanCode.slice(half);
        if (firstHalf === secondHalf) {
            cleanCode = firstHalf;
        }
    }

    if (!recording) {
        setAwb(cleanCode);
        awbRef.current = cleanCode;
        setManualAwb('');
        setShowMobileInput(false);
        
        // FIX: Await the start process so we don't miss the first scan
        await startRecording();
    } else {
        if (cleanCode === awbRef.current) {
            stopRecording();
        } else {
            if(confirm(`Current AWB: ${awbRef.current}\nScanned: ${cleanCode}\n\nStop recording?`)) {
                 stopRecording();
            }
        }
    }
  };

  // --- 4. QUEUE & SAVING SYSTEM ---
  
  const addToQueue = (blob: Blob, recordedAwb: string) => {
      const finalAwb = recordedAwb || `scan_${Date.now()}`;
      
      const newItem: QueueItem = {
          id: Date.now().toString(),
          blob: blob,
          awb: finalAwb,
          filename: `${finalAwb}.webm`, 
          attempts: 0
      };
      
      setUploadQueue(prev => [...prev, newItem]);
      saveVideoToFolder(blob, newItem.filename);
  };

  const saveVideoToFolder = async (blob: Blob, filename: string) => {
    try {
        let dirHandle = await getDirectoryHandle();

        if (!dirHandle) {
            try {
                dirHandle = await window.showDirectoryPicker();
                await saveDirectoryHandle(dirHandle); 
            } catch (cancelErr) {
                downloadLocallyFallback(blob, filename);
                return;
            }
        }

        if (dirHandle) {
            const permission = await dirHandle.requestPermission({ mode: 'readwrite' });
            if (permission !== 'granted') {
                throw new Error("Permission not granted");
            }
            
            const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(blob);
            await writable.close();
            console.log("Saved to folder successfully");
        }

    } catch (err) {
        console.error("Advanced save failed, using fallback:", err);
        downloadLocallyFallback(blob, filename);
    }
  };

  const downloadLocallyFallback = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  // Queue Processor Effect
  useEffect(() => {
      const processNext = async () => {
          if (isProcessing || uploadQueue.length === 0) return;

          setIsProcessing(true);
          const item = uploadQueue[0]; 

          try {
             await processUpload(item);
             setUploadQueue(prev => prev.slice(1));
             
             setLogs(prev => [{
                 id: item.id,
                 awb: item.awb,
                 packer_id: packer.id,
                 admin_id: packer.organization_id || '',
                 created_at: new Date().toISOString(),
                 video_url: '#',
                 status: 'completed',
                 whatsapp_status: 'pending'
             }, ...prev]);

          } catch (error: any) {
              console.error(error);
              alert(`❌ Upload FAILED for AWB: ${item.awb}\nReason: ${error.message}`);
              setUploadQueue(prev => prev.slice(1));
          } finally {
              setIsProcessing(false);
          }
      };

      processNext();
  }, [uploadQueue, isProcessing, packer.id, packer.organization_id]);


  const processUpload = async (item: QueueItem) => {
        const tokenRes = await api.getUploadToken(item.filename, 'video/webm');
        const { uploadUrl, folderId } = tokenRes;
        if (!uploadUrl) throw new Error("No upload URL received");

        const res = await fetch(uploadUrl, {
            method: 'PUT',
            headers: { 'Content-Type': 'video/webm' },
            body: item.blob,
        });

        if (!res.ok) throw new Error("Google Drive refused the file");

        const googleData = await res.json();
        const realVideoUrl = `https://drive.google.com/file/d/${googleData.id}/view`;

        await api.completeFulfillment({
            awb: item.awb,
            videoUrl: realVideoUrl,
            folderId: folderId || ''
        });
  };


  // --- 5. UI HANDLERS ---
  const handleTouchStart = (e: React.TouchEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'BUTTON' || target.tagName === 'INPUT') return;
      e.preventDefault();
      if (recording) return;

      setIsScanning(true);
      scanTimerRef.current = setTimeout(() => {
          setIsScanning(false);
          const simulatedCode = `ASEN-${Math.floor(Math.random()*100000)}`;
          handleScan(simulatedCode);
          if (navigator.vibrate) navigator.vibrate(200); 
      }, 1500);
  };

  const handleTouchEnd = () => {
      if (recording) return;
      setIsScanning(false);
      if (scanTimerRef.current) { clearTimeout(scanTimerRef.current); scanTimerRef.current = null; }
  };

  const resetFolder = async () => {
      try {
          const handle = await window.showDirectoryPicker();
          await saveDirectoryHandle(handle);
          alert("Default folder updated successfully!");
      } catch (e) {
          // ignore cancel
      }
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* Header */}
      <div className="bg-slate-900 p-4 flex justify-between items-center border-b border-slate-800 z-10">
        <div>
            <div className="font-bold flex items-center gap-2">
                <VideoIcon className="text-blue-500" />
                {device === 'mobile' ? 'Mobile Scanner' : 'Desktop Station'}
            </div>
            <div className="text-xs text-slate-400">Packer: {packer.name}</div>
        </div>
        <div className="flex gap-4">
            <button onClick={resetFolder} className="text-slate-400 hover:text-white" title="Change Save Folder">
                <FolderOpen size={20} />
            </button>
            <button onClick={onLogout} className="text-slate-400 hover:text-white"><LogOut size={20} /></button>
        </div>
      </div>

      {/* Main Viewport */}
      <div 
        className="flex-1 relative overflow-hidden flex flex-col items-center justify-center bg-gray-900 select-none touch-none"
        onTouchStart={device === 'mobile' ? handleTouchStart : undefined}
        onTouchEnd={device === 'mobile' ? handleTouchEnd : undefined}
      >
        <video 
            ref={videoRef} 
            autoPlay muted playsInline
            className={`absolute inset-0 w-full h-full object-cover transition-transform duration-200 ${isScanning ? 'scale-105' : 'scale-100'}`}
        />
        
        {/* Scanning Effect */}
        {isScanning && (
            <div className="absolute inset-0 flex items-center justify-center z-20 bg-black/30 pointer-events-none">
                 <div className="w-full h-0.5 bg-red-500 shadow-[0_0_15px_rgba(239,68,68,1)] animate-pulse"></div>
                 <div className="absolute text-white font-mono font-bold text-lg bg-black/50 px-3 py-1 rounded mt-8">SCANNING...</div>
            </div>
        )}

        {/* Processing Indicator */}
        {uploadQueue.length > 0 && (
             <div className="absolute top-4 right-4 z-30 bg-blue-600/90 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-3 backdrop-blur-md animate-pulse">
                <Loader2 className="animate-spin" size={18} />
                <div className="flex flex-col leading-tight">
                    <span className="text-xs font-bold uppercase tracking-wider">Background Upload</span>
                    <span className="text-xs">{uploadQueue.length} Pending...</span>
                </div>
             </div>
        )}

        {/* Main Overlay UI */}
        <div className="absolute inset-0 flex flex-col items-center justify-between p-6 pointer-events-none">
            {/* Recording Status */}
            <div className="bg-black/60 backdrop-blur-md px-6 py-2 rounded-full mt-16 flex items-center gap-3 pointer-events-auto">
                <div className={`w-3 h-3 rounded-full ${recording ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`}></div>
                <span className="font-mono font-bold tracking-wider">
                    {recording ? `REC: ${awb}` : (isScanning ? 'SCANNING...' : 'READY')}
                </span>
            </div>

            {/* Mobile Controls */}
            {device === 'mobile' && !recording && !isScanning && !showMobileInput && (
                <div className="flex flex-col items-center gap-4 mb-20 pointer-events-auto">
                      <div className="text-white/70 bg-black/40 px-4 py-2 rounded-full backdrop-blur-sm text-sm animate-bounce">
                         Hold screen to scan
                    </div>
                    <button 
                        onClick={() => setShowMobileInput(true)}
                        className="bg-slate-800/80 p-3 rounded-full text-slate-300 hover:text-white hover:bg-slate-700 backdrop-blur-md"
                    >
                        <Keyboard size={24} />
                    </button>
                </div>
            )}

            {/* Mobile Manual Input */}
            {device === 'mobile' && showMobileInput && !recording && (
                 <div className="pointer-events-auto bg-black/80 p-4 rounded-xl w-full max-w-xs mb-20 backdrop-blur-md border border-slate-700">
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-bold text-slate-300">Enter AWB Manually</span>
                        <button onClick={() => setShowMobileInput(false)}><X size={16} className="text-slate-400" /></button>
                    </div>
                    <input 
                        type="text" autoFocus value={manualAwb}
                        onChange={(e) => setManualAwb(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-white mb-3"
                        placeholder="ASEN..."
                    />
                    <button 
                        onClick={() => handleScan(manualAwb)} disabled={!manualAwb}
                        className="w-full bg-blue-600 py-2 rounded font-bold text-sm disabled:opacity-50"
                    >
                        Start Recording
                    </button>
                 </div>
            )}

            {/* Mobile Stop */}
            {device === 'mobile' && recording && (
                <div className="pointer-events-auto mb-20">
                      <button 
                        onClick={(e) => { e.stopPropagation(); stopRecording(); }}
                        className="bg-red-600 hover:bg-red-700 text-white p-6 rounded-full shadow-lg shadow-red-900/50 flex flex-col items-center gap-1 active:scale-95"
                    >
                        <StopCircle size={32} />
                        <span className="text-xs font-bold">STOP</span>
                    </button>
                </div>
            )}

            {/* Desktop UI */}
            {device === 'desktop' && (
                <div className="mb-10 w-full max-w-md pointer-events-auto flex flex-col gap-4">
                      <div className="flex gap-2 bg-black/80 p-2 rounded-xl border border-slate-700">
                        <div className="relative flex-1">
                            <Keyboard className="absolute left-3 top-3 text-slate-400" size={20} />
                            <input 
                                type="text"
                                value={manualAwb}
                                onChange={(e) => setManualAwb(e.target.value)}
                                onKeyDown={(e) => { if(e.key === 'Enter' && manualAwb) handleScan(manualAwb); }}
                                disabled={recording}
                                placeholder={recording ? "Recording in progress..." : "Scan or Type Barcode"}
                                className="w-full bg-slate-900 border border-slate-700 text-white pl-10 pr-4 py-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none placeholder:text-slate-500"
                            />
                        </div>
                        
                        {!recording ? (
                            <button 
                                onClick={() => manualAwb && handleScan(manualAwb)} disabled={!manualAwb}
                                className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-800 disabled:text-slate-500 text-white px-4 rounded-lg font-medium transition-colors"
                            >
                                Start
                            </button>
                        ) : (
                            <button 
                                onClick={stopRecording}
                                className="bg-red-600 hover:bg-red-700 text-white px-4 rounded-lg font-medium transition-colors flex items-center gap-2"
                            >
                                <StopCircle size={18} /> Stop
                            </button>
                        )}
                      </div>
                </div>
            )}
        </div>
      </div>

      {/* History Log */}
      {device === 'desktop' && (
          <div className="h-48 bg-slate-900 border-t border-slate-800 overflow-y-auto p-4">
              <h3 className="text-sm font-bold text-slate-400 mb-3 uppercase tracking-wider flex items-center gap-2">
                  <Search size={14} /> Session History
              </h3>
              <table className="w-full text-sm text-left text-slate-300">
                  <thead className="text-xs uppercase bg-slate-800 text-slate-400">
                      <tr>
                          <th className="px-4 py-2 rounded-tl-lg">AWB</th>
                          <th className="px-4 py-2">Time</th>
                          <th className="px-4 py-2 rounded-tr-lg">Status</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                      {logs.map(log => (
                          <tr key={log.id} className="hover:bg-slate-800/50">
                              <td className="px-4 py-3 font-mono text-blue-400 font-medium">{log.awb}</td>
                              <td className="px-4 py-3 text-slate-400">{new Date(log.created_at).toLocaleTimeString()}</td>
                              <td className="px-4 py-3">
                                  <span className={`px-2 py-1 rounded text-xs border ${
                                      log.status === 'completed' ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                                  }`}>
                                    {log.status}
                                  </span>
                              </td>
                          </tr>
                      ))}
                  </tbody>
              </table>
          </div>
      )}
    </div>
  );
};

export default PackerInterface;
