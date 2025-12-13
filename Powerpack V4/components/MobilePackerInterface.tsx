import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useZxing } from 'react-zxing'; 
import { UserProfile } from '../types';
import { api } from '../services/api';
import { LogOut, ScanLine, Volume2, VolumeX, CheckCircle, CloudUpload, Loader2, AlertCircle, Wifi, WifiOff } from 'lucide-react';

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
  status: 'PENDING' | 'UPLOADING' | 'FAILED';
  retryCount: number;
  error?: string;
  addedAt: number;
}

const MobilePackerInterface: React.FC<Props> = ({ packer, onLogout }) => {
  const [status, setStatus] = useState<'IDLE' | 'STABILIZING' | 'DETECTED' | 'RECORDING'>('IDLE');
  const [awb, setAwb] = useState(''); 
  const [uploadQueue, setUploadQueue] = useState<QueueItem[]>([]);
  
  const [activeUploads, setActiveUploads] = useState(0);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [totalUploaded, setTotalUploaded] = useState(0);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [lastError, setLastError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const awbRef = useRef(''); 
  const stableTimerRef = useRef<any>(null);
  const lastSeenCodeRef = useRef<string | null>(null);
  const uploadRetryTimerRef = useRef<any>(null);

  // --- NETWORK DETECTION ---
  useEffect(() => {
    const handleOnline = () => {
      console.log("📡 Network online");
      setIsOnline(true);
      playTone(880, 'sine', 0.1);
    };
    
    const handleOffline = () => {
      console.log("📡 Network offline");
      setIsOnline(false);
      playTone(220, 'sawtooth', 0.3);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const enableAudio = () => {
      playTone(0, 'sine', 0); 
      setAudioEnabled(true);
  };

  // --- QUEUE MANAGEMENT ---
  const addToQueue = useCallback((blob: Blob, recordedAwb: string, mimeType: string) => {
      const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
      const finalAwb = recordedAwb || `scan_${Date.now()}`; 
      const filename = `${finalAwb}.${ext}`;
      
      console.log("➕ Added to queue:", finalAwb, `(${(blob.size / 1024 / 1024).toFixed(2)} MB)`);
      
      setUploadQueue(prev => [...prev, {
          id: Date.now().toString(),
          blob,
          awb: finalAwb,
          filename,
          mimeType,
          status: 'PENDING',
          retryCount: 0,
          addedAt: Date.now()
      }]);
  }, []);

  // --- RECORDING START (✅ Race Condition FULLY Fixed) ---
  const triggerRecordStart = useCallback((videoElement: HTMLVideoElement, awbToUse: string) => {
      if (!videoElement.srcObject) {
          console.error("No video source available");
          return;
      }
      
      const stream = videoElement.srcObject as MediaStream;

      if (!awbToUse) {
          console.error("No AWB provided!");
          return;
      }

      let mimeType = 'video/webm';
      if (MediaRecorder.isTypeSupported('video/mp4')) {
          mimeType = 'video/mp4'; 
      } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
          mimeType = 'video/webm;codecs=vp9'; 
      } else if (MediaRecorder.isTypeSupported('video/webm;codecs=h264')) {
          mimeType = 'video/webm;codecs=h264';
      }

      console.log(`🎥 Starting recording: ${awbToUse} (${mimeType})`);

      try {
          const mediaRecorder = new MediaRecorder(stream, { 
              mimeType,
              videoBitsPerSecond: 2500000
          });
          
          mediaRecorderRef.current = mediaRecorder;
          chunksRef.current = [];

          mediaRecorder.ondataavailable = (e) => {
              if (e.data.size > 0) {
                  chunksRef.current.push(e.data);
              }
          };

          mediaRecorder.onstop = () => {
              const blob = new Blob(chunksRef.current, { type: mimeType });
              console.log(`✅ Recording stopped: ${(blob.size / 1024 / 1024).toFixed(2)} MB`);
              addToQueue(blob, awbToUse, mimeType);
          };

          mediaRecorder.onerror = (e) => {
              console.error("MediaRecorder error:", e);
              setStatus('IDLE');
          };

          mediaRecorder.start();
          setStatus('RECORDING');
      } catch (e) {
          console.error("Failed to start MediaRecorder:", e);
          alert("Recording failed. Please check camera permissions.");
          setStatus('IDLE');
      }
  }, [addToQueue]);

  const stopRecording = useCallback(() => {
      playTone(150, 'sawtooth', 0.3);
      
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop();
      }
      
      setStatus('IDLE');
      setAwb('');
      awbRef.current = '';
      lastSeenCodeRef.current = null;
      
      if (stableTimerRef.current) {
          clearTimeout(stableTimerRef.current);
          stableTimerRef.current = null;
      }
  }, []);

  // --- SCANNING LOGIC ---
  const confirmScan = useCallback((code: string, videoElement: HTMLVideoElement) => {
      let cleanCode = code.trim();
      
      if (cleanCode.length > 8 && cleanCode.length % 2 === 0) {
        const half = cleanCode.length / 2;
        if (cleanCode.slice(0, half) === cleanCode.slice(half)) {
            cleanCode = cleanCode.slice(0, half);
            console.log("🔄 Deduped barcode:", cleanCode);
        }
      }

      console.log("✅ Scan confirmed:", cleanCode);

      setAwb(cleanCode);
      awbRef.current = cleanCode;

      playTone(880, 'square', 0.2); 
      setStatus('DETECTED');
      if (navigator.vibrate) navigator.vibrate(200);

      setTimeout(() => {
          triggerRecordStart(videoElement, cleanCode);
      }, 500); 
  }, [triggerRecordStart]);

  const onScanResult = useCallback((result: any) => {
    if (status === 'RECORDING' || status === 'DETECTED') return;

    const rawCode = result.getText();
    if (!rawCode || rawCode.trim().length === 0) return;

    if (rawCode !== lastSeenCodeRef.current) {
        lastSeenCodeRef.current = rawCode;
        setStatus('STABILIZING'); 
        
        if (stableTimerRef.current) {
            clearTimeout(stableTimerRef.current);
        }
        
        stableTimerRef.current = setTimeout(() => {
            const videoEl = document.querySelector('video'); 
            if (videoEl && lastSeenCodeRef.current === rawCode) {
                confirmScan(rawCode, videoEl);
            }
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

  // --- PARALLEL UPLOAD ENGINE WITH ENHANCED DEBUG ---
  useEffect(() => {
      if (!isOnline) {
          console.log("⏸️ Offline - pausing uploads");
          return;
      }

      const pendingItems = uploadQueue.filter(item => 
          item.status === 'PENDING' || item.status === 'FAILED'
      );
      
      if (pendingItems.length > 0 && activeUploads < 2) {
          const itemToUpload = pendingItems[0];
          
          if (itemToUpload.retryCount >= 3) {
              console.error("❌ Max retries reached for:", itemToUpload.awb);
              alert(`Upload failed after 3 attempts: ${itemToUpload.awb}\n\nError: ${itemToUpload.error || 'Unknown'}\n\nRemoving from queue.`);
              setUploadQueue(prev => prev.filter(i => i.id !== itemToUpload.id));
              return;
          }

          setUploadQueue(prev => prev.map(i => 
              i.id === itemToUpload.id 
                ? { ...i, status: 'UPLOADING' as const, retryCount: i.retryCount + 1 } 
                : i
          ));
          setActiveUploads(prev => prev + 1);

          const performUpload = async () => {
              const attemptNum = itemToUpload.retryCount + 1;
              console.log(`⬆️ Upload attempt ${attemptNum}/3:`, itemToUpload.awb);

              try {
                  console.log("🔐 Step 1/4: Getting upload token...");
                  const tokenRes = await api.getUploadToken(
                      itemToUpload.filename, 
                      itemToUpload.mimeType
                  );
                  
                  if (!tokenRes.uploadUrl || !tokenRes.accessToken) {
                      throw new Error("STEP 1 FAILED: No upload URL or token received");
                  }

                  console.log("✅ Step 1 complete - Token received");

                  console.log("🔐 Step 2/4: Creating file in Drive...");
                  
                  const metadata = tokenRes.metadata ? JSON.parse(tokenRes.metadata) : {
                      name: itemToUpload.filename,
                      mimeType: itemToUpload.mimeType,
                      parents: [tokenRes.folderId]
                  };

                  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
                      method: 'POST',
                      headers: {
                          'Authorization': `Bearer ${tokenRes.accessToken}`,
                          'Content-Type': 'application/json'
                      },
                      body: JSON.stringify(metadata)
                  });

                  if (!createRes.ok) {
                      const errText = await createRes.text();
                      console.error("Step 2 failed:", errText);
                      throw new Error(`STEP 2 FAILED: Create file (${createRes.status}): ${errText}`);
                  }

                  const fileData = await createRes.json();
                  const realFileId = fileData.id;

                  if (!realFileId) {
                      throw new Error("STEP 2 FAILED: No file ID returned");
                  }

                  console.log("✅ Step 2 complete: File created:", realFileId);

                  console.log("📤 Step 3/4: Uploading video content...");

                  const uploadContentRes = await fetch(
                      `https://www.googleapis.com/upload/drive/v3/files/${realFileId}?uploadType=media`,
                      {
                          method: 'PATCH',
                          headers: {
                              'Authorization': `Bearer ${tokenRes.accessToken}`,
                              'Content-Type': itemToUpload.mimeType
                          },
                          body: itemToUpload.blob
                      }
                  );

                  if (!uploadContentRes.ok) {
                      const errText = await uploadContentRes.text();
                      console.error("Step 3 failed:", errText);
                      throw new Error(`STEP 3 FAILED: Upload content (${uploadContentRes.status}): ${errText}`);
                  }

                  console.log("✅ Step 3 complete: Content uploaded");

                  console.log("📊 Step 4/4: Completing fulfillment...");
                  
                  const fulfillmentData = {
                      stage: 1,
                      awb: itemToUpload.awb,
                      videoUrl: `https://drive.google.com/file/d/${realFileId}/view`,
                      folder_id: tokenRes.folderId || null 
                  };
                  
                  console.log("📋 Fulfillment payload:", JSON.stringify(fulfillmentData, null, 2));
                  
                  try {
                      console.log("🚀 Calling api.completeFulfillment...");
                      const fulfillmentRes = await api.completeFulfillment(fulfillmentData);
                      console.log("✅ Fulfillment response:", JSON.stringify(fulfillmentRes, null, 2));
                  } catch (fulfillErr: any) {
                      console.error("❌ Fulfillment error:", fulfillErr);
                      console.error("   Error name:", fulfillErr.name);
                      console.error("   Error message:", fulfillErr.message);
                      console.error("   Error stack:", fulfillErr.stack);
                      throw new Error(`STEP 4 FAILED: ${fulfillErr.message}`);
                  }

                  console.log("✅ Step 4 complete: All done!");
                  console.log("🎉 SUCCESS:", itemToUpload.awb);

                  setUploadQueue(prev => prev.filter(i => i.id !== itemToUpload.id));
                  setTotalUploaded(prev => prev + 1);
                  playTone(660, 'sine', 0.15);

              } catch (e: any) {
                  console.error(`❌ UPLOAD FAILED [${attemptNum}/3]:`, e.message);
                  console.error("   Full error:", e);
                  console.error("   Error stack:", e.stack);
                  
                  setLastError(e.message);
                  
                  setUploadQueue(prev => prev.map(i => 
                      i.id === itemToUpload.id 
                        ? { ...i, status: 'FAILED' as const, error: e.message } 
                        : i
                  ));

                  playTone(220, 'square', 0.2);

                  if (attemptNum === 1) {
                      alert(`Upload Error (will retry):\n\n${e.message}\n\nAWB: ${itemToUpload.awb}`);
                  }

                  if (e.message.includes('Failed to fetch') || e.message.includes('NetworkError')) {
                      console.log("⏳ Network error, waiting 5s before retry...");
                      await new Promise(resolve => setTimeout(resolve, 5000));
                  }

              } finally {
                  setActiveUploads(prev => prev - 1);
              }
          };
          
          performUpload();
      }
  }, [uploadQueue, activeUploads, isOnline]);

  // --- CLEANUP ---
  useEffect(() => {
      return () => {
          if (stableTimerRef.current) clearTimeout(stableTimerRef.current);
          if (uploadRetryTimerRef.current) clearTimeout(uploadRetryTimerRef.current);
          if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
              mediaRecorderRef.current.stop();
          }
      };
  }, []);

  const pendingCount = uploadQueue.filter(i => i.status === 'PENDING').length;
  const failedCount = uploadQueue.filter(i => i.status === 'FAILED').length;
  const queueSize = uploadQueue.reduce((sum, item) => sum + item.blob.size, 0);

  return (
    <div className="fixed inset-0 bg-black overflow-hidden flex flex-col" onClick={() => !audioEnabled && enableAudio()}>
        <div className="absolute top-0 left-0 right-0 z-20 p-4 flex justify-between items-start bg-gradient-to-b from-black/90 to-transparent">
            <div>
                <h1 className="text-white font-bold text-lg drop-shadow-md">{packer.name}</h1>
                <div className="flex flex-col gap-1 text-xs text-white/80">
                   {uploadQueue.length === 0 ? (
                       <span className="flex items-center gap-1 text-green-400 font-bold">
                           <CheckCircle size={12}/> Ready • {totalUploaded} uploaded
                       </span>
                   ) : (
                       <div className="flex flex-col gap-1">
                           <span className="flex items-center gap-1 text-yellow-400 font-bold">
                               <Loader2 size={12} className="animate-spin"/> 
                               {activeUploads} uploading • {pendingCount} pending
                           </span>
                           {failedCount > 0 && (
                               <span className="flex items-center gap-1 text-red-400 text-xs">
                                   <AlertCircle size={10}/> {failedCount} retrying...
                               </span>
                           )}
                           {queueSize > 0 && (
                               <span className="text-white/60 text-xs">
                                   Queue: {(queueSize / 1024 / 1024).toFixed(1)} MB
                               </span>
                           )}
                       </div>
                   )}
                   
                   <div className={`flex items-center gap-1 text-xs ${isOnline ? 'text-green-400' : 'text-red-400'}`}>
                       {isOnline ? <Wifi size={10}/> : <WifiOff size={10}/>}
                       <span>{isOnline ? 'Online' : 'Offline'}</span>
                   </div>
                </div>
            </div>
            <div className="flex gap-3">
                 <div className={`p-2 rounded-full backdrop-blur ${audioEnabled ? 'bg-white/10 text-white' : 'bg-red-500/50 text-white animate-pulse'}`}>
                    {audioEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
                 </div>
                 <button onClick={onLogout} className="p-2 bg-white/10 rounded-full text-white backdrop-blur hover:bg-white/20 transition-colors">
                    <LogOut size={18} />
                 </button>
            </div>
        </div>

        <video 
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-cover"
            playsInline
            muted 
            autoPlay
        />

        {status === 'STABILIZING' && (
             <div className="absolute inset-0 pointer-events-none z-10 flex flex-col items-center justify-center bg-black/20">
                 <div className="absolute inset-4 border-4 border-yellow-400/50 rounded-2xl animate-pulse"></div>
                 <ScanLine className="text-yellow-400 animate-pulse w-32 h-32 drop-shadow-lg" />
                 <p className="text-yellow-400 font-black text-2xl mt-4 drop-shadow-md">HOLD STEADY...</p>
                 <div className="w-64 h-2 bg-gray-700 rounded-full mt-3 overflow-hidden">
                    <div className="h-full bg-yellow-400 w-0 animate-[width_2s_linear_forwards]" style={{animation: 'width 2s linear forwards'}}></div>
                 </div>
             </div>
        )}

        {status === 'DETECTED' && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-green-500/20 backdrop-blur-sm pointer-events-none">
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
                <div className="bg-white/20 p-8 rounded-full animate-pulse mb-6">
                    <div className="w-8 h-8 bg-white rounded-sm"></div>
                </div>
                <h2 className="text-white font-black text-6xl tracking-widest drop-shadow-xl select-none mb-2">
                    STOP
                </h2>
                <p className="text-white/90 text-sm mb-4">TAP TO STOP RECORDING</p>
                <div className="flex items-center gap-2 text-white/80">
                    <CloudUpload size={16} />
                    <span className="font-mono text-sm">Auto-upload enabled</span>
                </div>
                <p className="text-white/80 font-mono text-xl mt-3 px-4 py-2 bg-black/20 rounded-lg">{awb}</p>
            </div>
        )}

        {status === 'IDLE' && (
            <div className="absolute inset-0 pointer-events-none z-10 flex flex-col items-center justify-center">
                 {!audioEnabled && (
                     <div className="absolute top-24 bg-red-600 text-white px-6 py-3 rounded-full font-bold animate-bounce z-50 shadow-lg pointer-events-auto cursor-pointer">
                        TAP SCREEN TO ENABLE AUDIO
                     </div>
                 )}
                 
                 {!isOnline && (
                     <div className="absolute top-40 bg-orange-600 text-white px-6 py-3 rounded-full font-bold shadow-lg flex items-center gap-2">
                        <WifiOff size={16}/>
                        <span>Offline Mode - Scans queued</span>
                     </div>
                 )}
                 
                 <div className="bg-black/50 backdrop-blur-md px-6 py-3 rounded-full border border-white/30 flex items-center gap-3 mb-8 shadow-xl">
                    <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="text-white font-bold tracking-widest text-sm">SCANNER READY</span>
                 </div>
            </div>
        )}
        
        {uploadQueue.length > 0 && status === 'IDLE' && (
            <div className="absolute bottom-4 left-4 right-4 bg-black/70 backdrop-blur-md rounded-2xl p-4 z-20 border border-white/10">
                <div className="flex items-center justify-between text-white text-sm">
                    <div className="flex items-center gap-2">
                        <Loader2 size={16} className="animate-spin text-yellow-400"/>
                        <span className="font-semibold">Upload Queue</span>
                    </div>
                    <span className="text-white/70">{uploadQueue.length} items</span>
                </div>
                {failedCount > 0 && (
                    <div className="mt-2 text-xs text-red-400 flex items-center gap-1">
                        <AlertCircle size={12}/>
                        <span>{failedCount} items retrying...</span>
                    </div>
                )}
            </div>
        )}

        {lastError && status === 'IDLE' && (
            <div className="absolute top-1/2 left-4 right-4 transform -translate-y-1/2 bg-red-600 text-white rounded-2xl p-4 z-30 shadow-2xl">
                <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                        <h3 className="font-bold mb-1 flex items-center gap-2">
                            <AlertCircle size={16}/>
                            Last Error
                        </h3>
                        <p className="text-sm opacity-90 break-words">{lastError}</p>
                        <p className="text-xs opacity-70 mt-2">Will retry automatically...</p>
                    </div>
                    <button 
                        onClick={() => setLastError(null)}
                        className="px-3 py-1 bg-white/20 rounded-lg text-xs hover:bg-white/30"
                    >
                        Dismiss
                    </button>
                </div>
            </div>
        )}
    </div>
  );
};

export default MobilePackerInterface;
