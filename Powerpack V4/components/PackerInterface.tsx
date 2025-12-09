import React, { useState, useEffect, useRef } from 'react';
import { UserProfile, VideoLog } from '../types';
import { api } from '../services/api';
import { Scan, StopCircle, LogOut, Video as VideoIcon, Smartphone, UploadCloud } from 'lucide-react';
import { UserRole } from '../types';

interface PackerInterfaceProps {
  packer: UserProfile;
  onLogout: () => void;
}

const PackerInterface: React.FC<PackerInterfaceProps> = ({ packer, onLogout }) => {
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [recording, setRecording] = useState(false);
  const [awb, setAwb] = useState('');
  const [uploading, setUploading] = useState(false);
  const [logs, setLogs] = useState<VideoLog[]>([]);
  const [scanBuffer, setScanBuffer] = useState(''); 
  
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
        if (device === 'desktop') {
            if (e.key === 'Enter') {
                if (scanBuffer.length > 3) {
                    handleScan(scanBuffer);
                    setScanBuffer('');
                }
            } else {
                setScanBuffer(prev => prev + e.key);
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
    
    // Fetch logs
    api.getLogs(packer.id, UserRole.PACKER).then(data => setLogs(data.slice(0,5))).catch(console.error);

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
        // Mock for no camera
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
    if (!recording) {
        setAwb(scannedCode);
        startRecording();
    } else {
        if (scannedCode === awb) {
            stopRecording();
        } else {
            alert(`Wrong End Scan! Expected ${awb}, got ${scannedCode}. Video continuing.`);
        }
    }
  };

  const saveVideo = async (blob: Blob) => {
    setUploading(true);
    try {
        const filename = `${awb}_${Date.now()}.webm`;
        
        // Step 1: Get Token
        const { uploadUrl } = await api.getUploadToken(filename, 'video/webm');
        
        // Step 2: Direct Upload
        await fetch(uploadUrl, {
            method: 'PUT',
            body: blob,
            headers: { 'Content-Type': 'video/webm' }
        });

        // Step 3: Webhook Fulfillment
        const result = await api.completeFulfillment({
            awb: awb,
            videoUrl: uploadUrl.split('?')[0] // Assuming the clean URL is valid, or backend handles it
        });
        
        alert('Video uploaded and processed successfully!');
        
        // Refresh logs locally
        const newLog: VideoLog = {
            id: 'temp-' + Date.now(),
            awb: awb,
            packer_id: packer.id,
            admin_id: packer.organization_id || '',
            created_at: new Date().toISOString(),
            video_url: '#',
            status: 'completed',
            whatsapp_status: 'pending'
        };
        setLogs([newLog, ...logs]);

    } catch (err) {
        console.error(err);
        alert('Upload failed: ' + err);
    } finally {
        setAwb('');
        setUploading(false);
    }
  };

  // Mobile Scan Simulation
  const handleMobileScanTrigger = (start: boolean) => {
    if (start) {
        scanTimerRef.current = setTimeout(() => {
            const simulatedCode = recording ? awb : `AWB-${Math.floor(Math.random()*10000)}`;
            handleScan(simulatedCode);
        }, 1500); 
    } else {
        if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
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
      <div className="flex-1 relative overflow-hidden flex flex-col items-center justify-center bg-gray-900">
        <video 
            ref={videoRef} 
            autoPlay 
            muted 
            playsInline
            className="absolute inset-0 w-full h-full object-cover"
        />
        
        {/* Overlay UI */}
        <div className="absolute inset-0 flex flex-col items-center justify-between p-6 pointer-events-none">
            {/* Status Top */}
            <div className="bg-black/60 backdrop-blur-md px-6 py-2 rounded-full mt-4 flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${recording ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`}></div>
                <span className="font-mono font-bold tracking-wider">
                    {recording ? `REC: ${awb}` : 'READY TO SCAN'}
                </span>
            </div>

            {/* Mobile Scan Trigger */}
            {device === 'mobile' && (
                <div className="pointer-events-auto w-full max-w-sm flex flex-col gap-4 mb-10">
                    {!recording ? (
                        <button 
                            onMouseDown={() => handleMobileScanTrigger(true)}
                            onMouseUp={() => handleMobileScanTrigger(false)}
                            onTouchStart={() => handleMobileScanTrigger(true)}
                            onTouchEnd={() => handleMobileScanTrigger(false)}
                            className="bg-white/10 border-2 border-white/50 backdrop-blur-sm rounded-2xl h-32 flex flex-col items-center justify-center active:bg-white/20 transition-all"
                        >
                            <Scan size={48} className="text-white/80" />
                            <span className="text-sm mt-2 font-medium">Hold to Scan Barcode (1.5s)</span>
                        </button>
                    ) : (
                        <div 
                            onClick={stopRecording}
                            className="absolute inset-0 bg-red-500/30 flex items-center justify-center cursor-pointer pointer-events-auto z-20"
                            style={{ top: '30%' }} 
                        >
                            <div className="text-center">
                                <StopCircle size={64} className="mx-auto mb-2 text-white drop-shadow-lg" />
                                <span className="text-lg font-bold drop-shadow-md">Tap to Stop & Save</span>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Desktop Helper */}
            {device === 'desktop' && (
                <div className="mb-10 bg-black/70 px-6 py-4 rounded-xl text-center">
                    {!recording ? (
                        <p className="text-xl">Scan parcel barcode to start</p>
                    ) : (
                        <p className="text-xl text-red-400 font-bold animate-pulse">Scanning {awb}... Scan again to stop</p>
                    )}
                </div>
            )}
        </div>

        {uploading && (
            <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-50">
                <UploadCloud size={48} className="text-blue-500 animate-bounce mb-4" />
                <h2 className="text-xl font-bold">Uploading Video...</h2>
                <p className="text-slate-400">Syncing to Backend</p>
            </div>
        )}
      </div>

      {device === 'desktop' && (
          <div className="h-48 bg-slate-900 border-t border-slate-800 overflow-y-auto p-4">
              <h3 className="text-sm font-bold text-slate-400 mb-3 uppercase tracking-wider">Session History</h3>
              <table className="w-full text-sm text-left text-slate-300">
                  <thead>
                      <tr className="border-b border-slate-700">
                          <th className="py-2">AWB</th>
                          <th className="py-2">Time</th>
                          <th className="py-2">Status</th>
                      </tr>
                  </thead>
                  <tbody>
                      {logs.map(log => (
                          <tr key={log.id} className="border-b border-slate-800/50">
                              <td className="py-2 font-mono text-blue-400">{log.awb}</td>
                              <td className="py-2">{new Date(log.created_at).toLocaleTimeString()}</td>
                              <td className="py-2 text-green-400">{log.status}</td>
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