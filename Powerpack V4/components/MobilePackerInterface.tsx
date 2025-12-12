import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { Camera } from 'expo-camera';
import { supabase } from '../lib/supabase'; // Ensure this path matches your project

export default function MobilePackerInterface() {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scanned, setScanned] = useState(false);
  const [scannedAwb, setScannedAwb] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  
  // Camera refs and logic (simplified for brevity, keep your existing UI logic)
  const cameraRef = useRef(null);

  useEffect(() => {
    (async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
    })();
  }, []);

  // --- NEW: Step 1 Trigger (Immediate Log) ---
  const logScanStart = async (awb: string) => {
    try {
      console.log('Step 1: Logging Scan Start for', awb);
      const { error } = await supabase.functions.invoke('fulfillment', {
        body: {
          action: 'scan_start',
          awb: awb,
          timestamp: new Date().toISOString(),
        },
      });

      if (error) throw error;
    } catch (err) {
      console.error('Failed to log scan start:', err);
      // Optional: Alert user, but usually better to fail silently so they can keep packing
    }
  };

  const handleBarCodeScanned = ({ type, data }: { type: string; data: string }) => {
    if (scanned) return;
    setScanned(true);
    setScannedAwb(data);
    
    // FIRE STEP 1 IMMEDIATELY
    logScanStart(data);
    
    Alert.alert(`AWB Scanned`, `Tracking ID: ${data}\nRecording will start automatically.`);
    // ... trigger your video recording logic here ...
  };

  // --- NEW: Step 2 Trigger (Video Upload & Completion) ---
  const completeLog = async (videoUrl: string) => {
    if (!scannedAwb) return;
    setIsUploading(true);

    try {
      console.log('Step 2: Completing Log with Video');
      const { data, error } = await supabase.functions.invoke('fulfillment', {
        body: {
          action: 'scan_complete',
          awb: scannedAwb,
          video_url: videoUrl,
          timestamp: new Date().toISOString(),
        },
      });

      if (error) throw error;
      Alert.alert("Success", "Order Packed and Logged!");
      
      // Reset for next scan
      setScanned(false);
      setScannedAwb(null);
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to save log");
    } finally {
      setIsUploading(false);
    }
  };

  if (hasPermission === null) return <View />;
  if (hasPermission === false) return <Text>No access to camera</Text>;

  return (
    <View style={styles.container}>
      {/* Your Camera View and Overlay UI here */}
      <Camera
        onBarCodeScanned={scanned ? undefined : handleBarCodeScanned}
        style={StyleSheet.absoluteFillObject}
      />
      {isUploading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={{color:'#fff', marginTop:10}}>Saving Video...</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center' },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center'
  }
});
