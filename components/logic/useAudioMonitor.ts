import { useCallback, useRef, useEffect } from 'react';
import { useVoiceChat } from './useVoiceChat';

interface AudioMonitorConfig {
  volumeThreshold: number; // Volume threshold as percentage (0-100)
  checkInterval: number; // How often to check volume in ms
  sustainDuration: number; // How long volume must be sustained in ms
}

const DEFAULT_CONFIG: AudioMonitorConfig = {
  volumeThreshold: 13, // 10%
  checkInterval: 100, // 100ms
  sustainDuration: 100, // 0.5 second
};

export const useAudioMonitor = (config: Partial<AudioMonitorConfig> = {}) => {
  const { muteInputAudio, unmuteInputAudio } = useVoiceChat();
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  
  // Refs for tracking state
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isMonitoringRef = useRef(false);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  
  // Volume state tracking
  const highVolumeStartTimeRef = useRef<number | null>(null);
  const lowVolumeStartTimeRef = useRef<number | null>(null);
  const currentlyMutedRef = useRef(false);

  const calculateVolume = useCallback((): number => {
    if (!analyserRef.current || !dataArrayRef.current) return 0;
    
    analyserRef.current.getByteFrequencyData(dataArrayRef.current);
    
    // Calculate RMS (Root Mean Square) for better volume representation
    let sum = 0;
    for (let i = 0; i < dataArrayRef.current.length; i++) {
      sum += dataArrayRef.current[i] * dataArrayRef.current[i];
    }
    const rms = Math.sqrt(sum / dataArrayRef.current.length);
    
    // Convert to percentage (0-100)
    return (rms / 255) * 100;
  }, []);

  const processVolumeLevel = useCallback((volume: number) => {
    const now = Date.now();
    const isVolumeHigh = volume > finalConfig.volumeThreshold;
    
    if (isVolumeHigh) {
      // High volume detected
      if (highVolumeStartTimeRef.current === null) {
        highVolumeStartTimeRef.current = now;
      }
      
      // Reset low volume timer
      lowVolumeStartTimeRef.current = null;
      
      // Check if high volume sustained for required duration
      const highVolumeDuration = now - highVolumeStartTimeRef.current;
      if (highVolumeDuration >= finalConfig.sustainDuration && !currentlyMutedRef.current) {
        console.log(`🔇 Volume ${volume.toFixed(1)}% exceeded threshold for ${highVolumeDuration}ms - MUTING microphone`);
        muteInputAudio();
        currentlyMutedRef.current = true;
      }
    } else {
      // Low volume detected
      if (lowVolumeStartTimeRef.current === null) {
        lowVolumeStartTimeRef.current = now;
      }
      
      // Reset high volume timer
      highVolumeStartTimeRef.current = null;
      
      // Check if low volume sustained for required duration
      const lowVolumeDuration = now - lowVolumeStartTimeRef.current;
      if (lowVolumeDuration >= finalConfig.sustainDuration && currentlyMutedRef.current) {
        console.log(`🔊 Volume ${volume.toFixed(1)}% below threshold for ${lowVolumeDuration}ms - UNMUTING microphone`);
        unmuteInputAudio();
        currentlyMutedRef.current = false;
      }
    }
  }, [finalConfig.volumeThreshold, finalConfig.sustainDuration, muteInputAudio, unmuteInputAudio]);

  const startMonitoring = useCallback((videoElement: HTMLVideoElement) => {
    if (isMonitoringRef.current) {
      console.log('🎧 Audio monitoring already active');
      return;
    }

    if (!videoElement || !videoElement.srcObject) {
      console.log('🚨 No video element or stream available for audio monitoring');
      return;
    }

    try {
      const stream = videoElement.srcObject as MediaStream;
      const audioTracks = stream.getAudioTracks();
      
      if (audioTracks.length === 0) {
        console.log('🚨 No audio tracks found in the stream');
        return;
      }

      // Create audio context and analyser
      audioContextRef.current = new AudioContext();
      sourceRef.current = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      
      // Configure analyser
      analyserRef.current.fftSize = 256;
      analyserRef.current.smoothingTimeConstant = 0.8;
      
      // Create data array for frequency data
      const bufferLength = analyserRef.current.frequencyBinCount;
      dataArrayRef.current = new Uint8Array(bufferLength);
      
      // Connect source to analyser
      sourceRef.current.connect(analyserRef.current);
      
      // Start monitoring interval
      intervalRef.current = setInterval(() => {
        const volume = calculateVolume();
        processVolumeLevel(volume);
      }, finalConfig.checkInterval);
      
      isMonitoringRef.current = true;
      console.log(`🎧 Audio monitoring started - threshold: ${finalConfig.volumeThreshold}%, interval: ${finalConfig.checkInterval}ms`);
      
    } catch (error) {
      console.error('🚨 Failed to start audio monitoring:', error);
    }
  }, [finalConfig.checkInterval, calculateVolume, processVolumeLevel]);

  const stopMonitoring = useCallback(() => {
    if (!isMonitoringRef.current) return;

    // Clear interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Disconnect source
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }

    // Close audio context
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    // Reset refs
    analyserRef.current = null;
    dataArrayRef.current = null;
    highVolumeStartTimeRef.current = null;
    lowVolumeStartTimeRef.current = null;
    currentlyMutedRef.current = false;
    isMonitoringRef.current = false;

    console.log('🎧 Audio monitoring stopped');
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopMonitoring();
    };
  }, [stopMonitoring]);

  return {
    startMonitoring,
    stopMonitoring,
    isMonitoring: isMonitoringRef.current,
  };
}; 