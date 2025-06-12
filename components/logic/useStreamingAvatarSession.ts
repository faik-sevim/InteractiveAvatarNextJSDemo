import StreamingAvatar, {
  ConnectionQuality,
  StartAvatarRequest,
  StreamingEvents,
} from "@heygen/streaming-avatar";
import { useCallback } from "react";

import {
  StreamingAvatarSessionState,
  useStreamingAvatarContext,
} from "./context";
import { useVoiceChat } from "./useVoiceChat";
import { useMessageHistory } from "./useMessageHistory";

export const useStreamingAvatarSession = () => {
  const {
    avatarRef,
    basePath,
    sessionState,
    setSessionState,
    stream,
    setStream,
    setIsListening,
    setIsUserTalking,
    setIsAvatarTalking,
    setConnectionQuality,
    handleUserTalkingMessage,
    handleStreamingTalkingMessage,
    handleEndMessage,
    clearMessages,
  } = useStreamingAvatarContext();
  const { stopVoiceChat } = useVoiceChat();

  useMessageHistory();

  const init = useCallback(
    (token: string) => {
      avatarRef.current = new StreamingAvatar({
        token,
        basePath: basePath,
      });

      return avatarRef.current;
    },
    [basePath, avatarRef],
  );
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
  const handleStream = useCallback(
    ({ detail }: { detail: MediaStream }) => {
      logger.debug("🟢 STREAM_READY - Setting session state to CONNECTED");
      setStream(detail);
      setSessionState(StreamingAvatarSessionState.CONNECTED);
    },
    [setSessionState, setStream],
  );

  const stop = useCallback(async () => {
    logger.debug("🔌 useStreamingAvatarSession.stop() called");
    logger.debug("🔌 Current session state before stop:", sessionState);
    
    avatarRef.current?.off(StreamingEvents.STREAM_READY, handleStream);
    // Note: handleStreamDisconnected is defined locally in start function
    clearMessages();
    stopVoiceChat();
    setIsListening(false);
    setIsUserTalking(false);
    setIsAvatarTalking(false);
    setStream(null);
    await avatarRef.current?.stopAvatar();
    setSessionState(StreamingAvatarSessionState.INACTIVE);
    logger.debug("🔌 Session state set to INACTIVE");
  }, [
    handleStream,
    setSessionState,
    setStream,
    avatarRef,
    setIsListening,
    stopVoiceChat,
    clearMessages,
    setIsUserTalking,
    setIsAvatarTalking,
  ]);

  const start = useCallback(
    async (config: StartAvatarRequest, token?: string) => {
      if (sessionState !== StreamingAvatarSessionState.INACTIVE) {
        throw new Error("There is already an active session");
      }

      if (!avatarRef.current) {
        if (!token) {
          throw new Error("Token is required");
        }
        init(token);
      }

      if (!avatarRef.current) {
        throw new Error("Avatar is not initialized");
      }

      setSessionState(StreamingAvatarSessionState.CONNECTING);
      logger.debug("🟡 Setting session state to CONNECTING");
      
      avatarRef.current.on(StreamingEvents.STREAM_READY, handleStream);
      const handleStreamDisconnected = () => {
        logger.debug("🔴 STREAM_DISCONNECTED event received");
        
        // Check if this is a premature disconnection during avatar talking
        const avatarStillTalking = document.body.getAttribute('data-avatar-talking') === 'true';
        if (avatarStillTalking) {
          logger.debug("⚠️  STREAM_DISCONNECTED while avatar still talking - delaying stop()");
          // Delay the stop to allow avatar to finish current speech
          setTimeout(() => {
            logger.debug("🔴 Delayed stop() execution after avatar talking check");
            // Double check avatar is no longer talking before stopping
            const stillTalking = document.body.getAttribute('data-avatar-talking') === 'true';
            if (!stillTalking) {
              stop();
            } else {
              logger.debug("🔴 Avatar still talking after delay - forcing stop()");
              document.body.removeAttribute('data-avatar-talking');
              stop();
            }
          }, 3000);
        } else {
          logger.debug("🔴 Normal STREAM_DISCONNECTED - calling stop() immediately");
          stop();
        }
      };
      
      avatarRef.current.on(StreamingEvents.STREAM_DISCONNECTED, handleStreamDisconnected);
      avatarRef.current.on(
        StreamingEvents.CONNECTION_QUALITY_CHANGED,
        ({ detail }: { detail: ConnectionQuality }) =>
          setConnectionQuality(detail),
      );
      avatarRef.current.on(StreamingEvents.USER_START, () => {
        setIsUserTalking(true);
      });
      avatarRef.current.on(StreamingEvents.USER_STOP, () => {
        setIsUserTalking(false);
      });
      avatarRef.current.on(StreamingEvents.AVATAR_START_TALKING, () => {
        setIsAvatarTalking(true);
      });
      avatarRef.current.on(StreamingEvents.AVATAR_STOP_TALKING, () => {
        setIsAvatarTalking(false);
      });
      avatarRef.current.on(
        StreamingEvents.USER_TALKING_MESSAGE,
        handleUserTalkingMessage,
      );
      avatarRef.current.on(
        StreamingEvents.AVATAR_TALKING_MESSAGE,
        handleStreamingTalkingMessage,
      );
      avatarRef.current.on(StreamingEvents.USER_END_MESSAGE, handleEndMessage);
      avatarRef.current.on(
        StreamingEvents.AVATAR_END_MESSAGE,
        handleEndMessage,
      );

      await avatarRef.current.createStartAvatar(config);

      return avatarRef.current;
    },
    [
      init,
      handleStream,
      stop,
      setSessionState,
      avatarRef,
      sessionState,
      setConnectionQuality,
      setIsUserTalking,
      handleUserTalkingMessage,
      handleStreamingTalkingMessage,
      handleEndMessage,
      setIsAvatarTalking,
    ],
  );

  return {
    avatarRef,
    sessionState,
    stream,
    initAvatar: init,
    startAvatar: start,
    stopAvatar: stop,
  };
};
