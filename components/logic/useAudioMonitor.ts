import { useCallback, useRef, useEffect } from 'react';
import { useVoiceChat } from './useVoiceChat';

interface AudioMonitorConfig {
  volumeThreshold: number; // Volume threshold as percentage (0-100)
  checkInterval: number; // How often to check volume in ms
  sustainDuration: number; // How long volume must be sustained in ms
}

const DEFAULT_CONFIG: AudioMonitorConfig = {
  volumeThreshold: 20, // 10%
  checkInterval: 100, // 100ms
  sustainDuration: 50, // 0.5 second
};
enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
  TRACE = 4
}

class SmartLogger {
  private static instance: SmartLogger;
  private logBuffer: Array<{timestamp: string, level: LogLevel, message: string, data?: any}> = [];
  private readonly maxBufferSize = 100; // Son 100 log'u tut
  private readonly isDevelopment = process.env.NODE_ENV === 'development';
  private readonly logLevel: LogLevel;

  constructor() {
    // Environment variable'dan log level belirle
    const envLogLevel = process.env.NEXT_PUBLIC_LOG_LEVEL?.toUpperCase();
    this.logLevel = this.isDevelopment 
      ? LogLevel.DEBUG  // Development'da varsayılan DEBUG
      : LogLevel.WARN;  // Production'da varsayılan WARN
    
    // Override if specific level set
    switch(envLogLevel) {
      case 'ERROR': this.logLevel = LogLevel.ERROR; break;
      case 'WARN': this.logLevel = LogLevel.WARN; break;
      case 'INFO': this.logLevel = LogLevel.INFO; break;
      case 'DEBUG': this.logLevel = LogLevel.DEBUG; break;
      case 'TRACE': this.logLevel = LogLevel.TRACE; break;
    }
  }

  static getInstance(): SmartLogger {
    if (!SmartLogger.instance) {
      SmartLogger.instance = new SmartLogger();
    }
    return SmartLogger.instance;
  }

  private shouldLog(level: LogLevel): boolean {
    return level <= this.logLevel;
  }

  private addToBuffer(level: LogLevel, message: string, data?: any) {
    if (this.logBuffer.length >= this.maxBufferSize) {
      this.logBuffer.shift(); // En eski log'u sil
    }
    
    this.logBuffer.push({
      timestamp: new Date().toLocaleTimeString(),
      level,
      message,
      data
    });
  }

  error(message: string, data?: any) {
    if (this.shouldLog(LogLevel.ERROR)) {
      console.error(`🚨 [${new Date().toLocaleTimeString()}] ${message}`, data || '');
      this.addToBuffer(LogLevel.ERROR, message, data);
    }
  }

  warn(message: string, data?: any) {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(`⚠️ [${new Date().toLocaleTimeString()}] ${message}`, data || '');
      this.addToBuffer(LogLevel.WARN, message, data);
    }
  }

  info(message: string, data?: any) {
    if (this.shouldLog(LogLevel.INFO)) {
      logger.debug(`ℹ️ [${new Date().toLocaleTimeString()}] ${message}`, data || '');
      this.addToBuffer(LogLevel.INFO, message, data);
    }
  }

  debug(message: string, data?: any) {
    if (this.shouldLog(LogLevel.DEBUG)) {
      logger.debug(`🔍 [${new Date().toLocaleTimeString()}] ${message}`, data || '');
      this.addToBuffer(LogLevel.DEBUG, message, data);
    }
  }

  trace(message: string, data?: any) {
    if (this.shouldLog(LogLevel.TRACE)) {
      logger.debug(`🔬 [${new Date().toLocaleTimeString()}] ${message}`, data || '');
      this.addToBuffer(LogLevel.TRACE, message, data);
    }
  }

  // Log buffer'ını görüntüle (debugging için)
  showBuffer() {
    if (this.isDevelopment) {
      console.table(this.logBuffer);
    }
  }

  // Buffer'ı temizle
  clearBuffer() {
    this.logBuffer = [];
    if (this.isDevelopment) {
      logger.debug('🧹 Log buffer cleared');
    }
  }
}

// Global logger instance
const logger = SmartLogger.getInstance();
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
        logger.debug(`🔇 Volume ${volume.toFixed(1)}% exceeded threshold for ${highVolumeDuration}ms - MUTING microphone`);
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
        logger.debug(`🔊 Volume ${volume.toFixed(1)}% below threshold for ${lowVolumeDuration}ms - UNMUTING microphone`);
        unmuteInputAudio();
        currentlyMutedRef.current = false;
      }
    }
  }, [finalConfig.volumeThreshold, finalConfig.sustainDuration, muteInputAudio, unmuteInputAudio]);

  const startMonitoring = useCallback((videoElement: HTMLVideoElement) => {
    if (isMonitoringRef.current) {
      logger.debug('🎧 Audio monitoring already active');
      return;
    }

    if (!videoElement || !videoElement.srcObject) {
      logger.debug('🚨 No video element or stream available for audio monitoring');
      return;
    }

    try {
      const stream = videoElement.srcObject as MediaStream;
      const audioTracks = stream.getAudioTracks();
      
      if (audioTracks.length === 0) {
        logger.debug('🚨 No audio tracks found in the stream');
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
      logger.debug(`🎧 Audio monitoring started - threshold: ${finalConfig.volumeThreshold}%, interval: ${finalConfig.checkInterval}ms`);
      
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

    logger.debug('🎧 Audio monitoring stopped');
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