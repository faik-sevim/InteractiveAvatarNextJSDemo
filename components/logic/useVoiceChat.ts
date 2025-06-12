import { useCallback } from "react";

import { useStreamingAvatarContext } from "./context";
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
export const useVoiceChat = () => {
  const {
    avatarRef,
    isMuted,
    setIsMuted,
    isVoiceChatActive,
    setIsVoiceChatActive,
    isVoiceChatLoading,
    setIsVoiceChatLoading,
  } = useStreamingAvatarContext();

  const startVoiceChat = useCallback(
    async (isInputAudioMuted?: boolean) => {
      if (!avatarRef.current) return;
      setIsVoiceChatLoading(true);
      await avatarRef.current?.startVoiceChat({
        isInputAudioMuted,
      });
      setIsVoiceChatLoading(false);
      setIsVoiceChatActive(true);
      setIsMuted(!!isInputAudioMuted);
    },
    [avatarRef, setIsMuted, setIsVoiceChatActive, setIsVoiceChatLoading],
  );

  const stopVoiceChat = useCallback(() => {
    if (!avatarRef.current) return;
    avatarRef.current?.closeVoiceChat();
    setIsVoiceChatActive(false);
    setIsMuted(true);
  }, [avatarRef, setIsMuted, setIsVoiceChatActive]);

  const muteInputAudio = useCallback(() => {
    logger.debug('🎤 muteInputAudio called');
    logger.debug('🎤 avatarRef.current exists:', !!avatarRef.current);
    
    if (!avatarRef.current) {
      logger.debug('❌ avatarRef.current is null - cannot mute');
      return;
    }
    
    logger.debug('🎤 Calling avatarRef.current.muteInputAudio()');
    avatarRef.current?.muteInputAudio();
    setIsMuted(true);
    logger.debug('🎤 setIsMuted(true) completed, new isMuted state should be true');
  }, [avatarRef, setIsMuted]);

  const unmuteInputAudio = useCallback(() => {
    logger.debug('🎤 unmuteInputAudio called');
    logger.debug('🎤 avatarRef.current exists:', !!avatarRef.current);
    
    if (!avatarRef.current) {
      logger.debug('❌ avatarRef.current is null - cannot unmute');
      return;
    }
    
    logger.debug('🎤 Calling avatarRef.current.unmuteInputAudio()');
    avatarRef.current?.unmuteInputAudio();
    setIsMuted(false);
    logger.debug('🎤 setIsMuted(false) completed, new isMuted state should be false');
  }, [avatarRef, setIsMuted]);

  return {
    startVoiceChat,
    stopVoiceChat,
    muteInputAudio,
    unmuteInputAudio,
    isMuted,
    isVoiceChatActive,
    isVoiceChatLoading,
  };
};
