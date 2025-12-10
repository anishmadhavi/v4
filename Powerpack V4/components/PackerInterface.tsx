import React, { useState, useEffect, useRef } from 'react';
import { UserProfile, VideoLog, UserRole } from '../types';
import { api } from '../services/api';
import { Scan, StopCircle, LogOut, Video as VideoIcon, UploadCloud, Keyboard, Search, X } from 'lucide-react';

interface PackerInterfaceProps {
  packer: UserProfile;
  onLogout: () => void;
}

const PackerInterface: React.FC<PackerInterfaceProps> = ({ packer, onLogout }) => {
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [recording, setRecording] = useState(false);
  const [awb, setAwb] = useState('');
  const [manualAwb, setManualAwb] = useState(''); 
  const [uploading, setUploading] = useState(false);
  const [logs, setLogs] = useState<VideoLog[]>([]);
  const [scanBuffer, setScanBuffer] = useState(''); 
  const [isScanning, setIsScanning] = useState(false); 
  const [showMobileInput, setShowMobileInput] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const scanTimerRef = useRef<any>(null);

  useEffect(() => {
    const handleResize = () => {
      setDevice(window.innerWidth < 768 ? 'mobile' : 'desktop');
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    
    const handleKeyDown = (e: KeyboardEvent) => {
        // Don't capture scanner input if typing in a text box
        if (e.target instanceof HTMLInputElement) return;

        if (device === 'desktop') {
            if (e.key === 'Enter') {
                if (scanBuffer.length > 3) {
                    handleScan(scanBuffer);
                    setScanBuffer('');
                }
            } else {
                if (e.key.length === 1) {
                    setScanBuffer(prev => prev + e.key);
                }
            }
        }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('keydown', handleKeyDown);
    };
  }, [scanBuffer, device]);

  useEffect(() => {
    const startCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
              video: { facingMode: 'environment' }, 
              audio: false 
            });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }
        } catch (err) {
            console.error("Camera error:", err);
        }
    };
    startCamera();
    
    api.getLogs(packer.id, UserRole.PACKER)
      .then(data => setLogs(data.slice(0,5)))
      .catch(console.error);

    return () => {
        if (videoRef.current && videoRef.current.srcObject) {
            const stream = videoRef.current.srcObject as MediaStream;
            stream.getTracks().forEach(track => track.stop());
        }
    };
  }, [packer.id]);

  const startRecording = () => {
    if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        chunksRef.current = [];

        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunksRef.current.push(e.data);
        };

        mediaRecorder.onstop = () => {
            const blob = new Blob(chunksRef.current, { type: 'video/webm' });
            saveVideo(blob);
        };

        mediaRecorder.start();
        setRecording(true);
    } else {
        setRecording(true);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
    }
    setRecording(false);
  };

  const handleScan = (scannedCode: string) => {
    if (!scannedCode) return;

    if (!recording) {
        setAwb(scannedCode);
        setManualAwb('');
        setShowMobileInput(false);
        startRecording();
    } else {
        if (scannedCode === awb) {
            stopRecording();
        } else {
            if(confirm(`Current AWB: ${awb}\nScanned: ${scannedCode}\n\nStop recording?`)) {
                 stopRecording();
            }
        }
    }
  };

  // --- Helper to Download Video Locally (backup) ---
  const downloadLocally = (blob: Blob, filename: string) => {
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

  // --- Save & Upload Video ---
  const saveVideo = async (blob: Blob) => {
    setUploading(true);
    
    // 1. Generate Filename & Download Locally Immediately (safety backup)
    const filename = `${awb}_${Date.now()}.webm`;
    downloadLocally(blob, filename);

    try {
        // 2. Upload to backend, which then uploads to Google Drive
        // NOTE: implement api.uploadVideoToDrive(filename: string, file: Blob)
        const { fileUrl } = await api.uploadVideoToDrive(filename, blob);

        if (!fileUrl) {
          throw new Error('Upload succeeded but no fileUrl returned from server');
        }

        // 3. Notify backend that fulfillment is complete
        await api.completeFulfillment({
            awb: awb,
            videoUrl: fileUrl,
        });
        
        alert('Video uploaded successfully!');

        const newLog: VideoLog = {
            id: 'temp-' + Date.now(),
            awb: awb,
            packer_id: packer.id,
            admin_id: packer.organization_id || '',
            created_at: new Date().toISOString(),
            video_url: fileUrl,
            status: 'completed',
            whatsapp_status: 'pending',
        };
        setLogs([newLog, ...logs]);

    } catch (err: any) {
        console.error(err);
        alert('Cloud Upload Failed (Video saved to device): ' + (err?.message || 'Unknown error'));
    } finally {
        setAwb('');
        setUploading(false);
    }
  };

  // --- Mobile Touch Logic ---
  const handleTouchStart = (e: React.TouchEvent) => {
      // Allow buttons/inputs to work normally
      const target = e.target as HTMLElement;
      if (target.tagName === 'BUTTON' || target.tagName === 'INPUT') return;
      
      e.preventDefault(); // Stop iOS magnifier
      if (recording) return;

      setIsScanning(true);
      
      scanTimerRef.current = setTimeout(() => {
          setIsScanning(false);
          // Simulate Scan
          const simulatedCode = `ASEN-${Math.floor(Math.random()*100000)}`;
          handleScan(simulatedCode);
          if (navigator.vibrate) navigator.vibrate(200); 
      }, 1500);
  };

  const handleTouchEnd = () => {
      if (recording) return;
      setIsScanning(false);
      if (scanTimerRef.current) {
          clearTimeout(scanTimerRef.current);
          scanTimerRef.current = null;
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
        <button onClick={onLogout} className="text-slate-400 hover:text-white"><LogOut /></button>
      </div>

      {/* Main Viewport */}
      <div 
        className="flex-1 relative overflow-hidden flex flex-col items-center justify-center bg-gray-900 select-none touch-none"
        onTouchStart={device === 'mobile' ? handleTouchStart : undefined}
        onTouchEnd={device === 'mobile' ? handleTouchEnd : undefined}
      >
        <video 
            ref={videoRef} 
            autoPlay 
            muted 
            playsInline
            className={`absolute inset-0 w-full h-full object-cover transition-transform duration-200 ${isScanning ? 'scale-105' : 'scale-100'}`}
        />
        
        {/* Mobile Scanning Visuals */}
        {isScanning && (
            <div className="absolute inset-0 flex items-center justify-center z-20 bg-black/30 pointer-events-none">
                 <div className="w-full h-0.5 bg-red-500 shadow-[0_0_15px_rgba(239,68,68,1)] animate-pulse"></div>
                 <div className="absolute text-white font-mono font-bold text-lg bg-black/50 px-3 py-1 rounded mt-8">
                     DETECTING BARCODE...
                 </div>
            </div>
        )}

        {/* Overlay UI */}
        <div className="absolute inset-0 flex flex-col items-center justify-between p-6 pointer-events-none">
            {/* Top Status */}
            <div className="bg-black/60 backdrop-blur-md px-6 py-2 rounded-full mt-4 flex items-center gap-3 pointer-events-auto">
                <div className={`w-3 h-3 rounded-full ${recording ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`}></div>
                <span className="font-mono font-bold tracking-wider">
                    {recording ? `REC: ${awb}` : (isScanning ? 'SCANNING...' : 'READY')}
                </span>
            </div>

            {/* Mobile UI Layers */}
            {device === 'mobile' && !recording && !isScanning && !showMobileInput && (
                <div className="flex flex-col items-center gap-4 mb-20 pointer-events-auto">
                     <div className="text-white/70 bg-black/40 px-4 py-2 rounded-full backdrop-blur-sm text-sm animate-bounce">
                        Hold screen to scan
                    </div>
                    {/* Toggle Manual Input */}
                    <button 
                        onClick={() => setShowMobileInput(true)}
                        className="bg-slate-800/80 p-3 rounded-full text-slate-300 hover:text-white hover:bg-slate-700 backdrop-blur-md"
                    >
                        <Keyboard size={24} />
                    </button>
                </div>
            )}

            {/* Mobile Manual Input Modal */}
            {device === 'mobile' && showMobileInput && !recording && (
                 <div className="pointer-events-auto bg-black/80 p-4 rounded-xl w-full max-w-xs mb-20 backdrop-blur-md border border-slate-700">
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-bold text-slate-300">Enter AWB Manually</span>
                        <button onClick={() => setShowMobileInput(false)}><X size={16} className="text-slate-400" /></button>
                    </div>
                    <input 
                        type="text"
                        autoFocus
                        value={manualAwb}
                        onChange={(e) => setManualAwb(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-white mb-3"
                        placeholder="ASEN..."
                    />
                    <button 
                        onClick={() => handleScan(manualAwb)}
                        disabled={!manualAwb}
                        className="w-full bg-blue-600 py-2 rounded font-bold text-sm disabled:opacity-50"
                    >
                        Start Recording
                    </button>
                 </div>
            )}

            {/* Mobile Stop Button */}
            {device === 'mobile' && recording && (
                <div className="pointer-events-auto mb-20">
                     <button 
                        onClick={(e) => { e.stopPropagation(); stopRecording(); }}
                        className="bg-red-600 hover:bg-red-700 text-white p-6 rounded-full shadow-lg shadow-red-900/50 flex flex-col items-center gap-1 transition-transform active:scale-95"
                    >
                        <StopCircle size={32} />
                        <span className="text-xs font-bold">STOP</span>
                    </button>
                </div>
            )}

            {/* Desktop UI */}
            {device === 'desktop' && (
                <div className="mb-10 w-full max-w-md pointer-events-auto flex flex-col gap-4">
                     {/* Manual Input Box */}
                     <div className="flex gap-2 bg-black/80 p-2 rounded-xl border border-slate-700">
                        <div className="relative flex-1">
                            <Keyboard className="absolute left-3 top-3 text-slate-400" size={20} />
                            <input 
                                type="text"
                                value={manualAwb}
                                onChange={(e) => setManualAwb(e.target.value)}
                                onKeyDown={(e) => {
                                    if(e.key === 'Enter' && manualAwb) handleScan(manualAwb);
                                }}
                                disabled={recording}
                                placeholder={recording ? "Recording in progress..." : "Scan or Type Barcode"}
                                className="w-full bg-slate-900 border border-slate-700 text-white pl-10 pr-4 py-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none placeholder:text-slate-500"
                            />
                        </div>
                        
                        {!recording ? (
                            <button 
                                onClick={() => manualAwb && handleScan(manualAwb)}
                                disabled={!manualAwb}
                                className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-800 disabled:text-slate-500 text-white px-4 rounded-lg font-medium transition-colors"
                            >
                                Start
                            </button>
                        ) : (
                            // Desktop Stop Button
                            <button 
                                onClick={stopRecording}
                                className="bg-red-600 hover:bg-red-700 text-white px-4 rounded-lg font-medium transition-colors flex items-center gap-2"
                            >
                                <StopCircle size={18} /> Stop
                            </button>
                        )}
                     </div>

                    {!recording && (
                        <div className="bg-black/50 px-4 py-2 rounded-lg text-center text-sm text-slate-400 backdrop-blur-sm">
                            Use USB Scanner OR type manually above
                        </div>
                    )}
                </div>
            )}
        </div>

        {uploading && (
            <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center z-50">
                <UploadCloud size={64} className="text-blue-500 animate-bounce mb-6" />
                <h2 className="text-2xl font-bold">Uploading Proof...</h2>
                <p className="text-slate-400 mt-2">Do not close this window</p>
            </div>
        )}
      </div>

      {/* Desktop History Log */}
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
                          <th classNam
