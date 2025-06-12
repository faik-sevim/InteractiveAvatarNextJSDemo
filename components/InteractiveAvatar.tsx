import {
  AvatarQuality,
  StreamingEvents,
  VoiceChatTransport,
  VoiceEmotion,
  StartAvatarRequest,
  STTProvider,
  ElevenLabsModel,
} from "@heygen/streaming-avatar";
import { useEffect, useRef, useState } from "react";
import { useMemoizedFn, useUnmount } from "ahooks";

import { Button } from "./Button";
import { AvatarVideo } from "./AvatarSession/AvatarVideo";
import { useStreamingAvatarSession } from "./logic/useStreamingAvatarSession";
import { AvatarControls } from "./AvatarSession/AvatarControls";
import { useVoiceChat } from "./logic/useVoiceChat";
import { useAudioMonitor } from "./logic/useAudioMonitor";
import { StreamingAvatarProvider, StreamingAvatarSessionState } from "./logic";
import { LoadingIcon } from "./Icons";
import { MessageHistory } from "./AvatarSession/MessageHistory";

import { AVATARS } from "@/app/lib/constants";

// ========================================
// 🚀 SMART LOGGING UTILITY
// ========================================
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

const DEFAULT_CONFIG: StartAvatarRequest = {
  quality: (process.env.NEXT_PUBLIC_AVATAR_QUALITY as AvatarQuality) || AvatarQuality.Low,
  avatarName: process.env.NEXT_PUBLIC_AVATAR_ID || AVATARS[0].avatar_id,
  knowledgeId: undefined,
  voice: {
    rate: 1.0,
    emotion: (process.env.NEXT_PUBLIC_VOICE_EMOTION as VoiceEmotion) || VoiceEmotion.EXCITED,
    model: (process.env.NEXT_PUBLIC_ELEVENLABS_MODEL as ElevenLabsModel) || ElevenLabsModel.eleven_flash_v2_5,
  },
  language: "en",
  voiceChatTransport: (process.env.NEXT_PUBLIC_VOICE_CHAT_TRANSPORT as VoiceChatTransport) || VoiceChatTransport.WEBSOCKET,
  sttSettings: {
    provider: (process.env.NEXT_PUBLIC_STT_PROVIDER as STTProvider) || STTProvider.DEEPGRAM,
  },
};

async function listActiveSessions() {
  try {
    const response = await fetch("/api/list-sessions", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      if (response.status === 408) {
        logger.warn("Session list request timed out - continuing with session start");
        return [];
      } else if (response.status === 503) {
        logger.warn("Network connection failed for session list - continuing with session start");
        return [];
      } else {
        throw new Error(`Failed to list sessions: ${response.statusText}`);
      }
    }

    const data = await response.json();
    logger.info("Active sessions:", data);
    
    // Handle HeyGen API response structure: {code: 100, data: {sessions: []}, message: 'success'}
    if (data.data && data.data.sessions) {
      logger.debug(`API Response: Found ${data.data.sessions.length} sessions in data.data.sessions`);
      return data.data.sessions;
    } else if (data.sessions) {
      logger.debug(`API Response: Found ${data.sessions.length} sessions in data.sessions`);
      return data.sessions;
    } else {
      logger.debug("API Response: No sessions found in expected structure");
      logger.trace("Full response structure:", data);
      return [];
    }
  } catch (error) {
    logger.error("Error listing active sessions:", error);
    logger.warn("Continuing with session start despite session list error");
    return [];
  }
}

async function closeSession(sessionId: string) {
  try {
    const response = await fetch("/api/close-session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ session_id: sessionId }),
    });

    if (!response.ok) {
      throw new Error(`Failed to close session: ${response.statusText}`);
    }

    const data = await response.json();
    logger.debug(`Session ${sessionId} closed:`, data);
    return data;
  } catch (error) {
    console.error(`Error closing session ${sessionId}:`, error);
    throw error;
  }
}

async function closeAllActiveSessions() {
  logger.debug("🔍 ======= ROBUST SESSION CLEANUP START =======");
  
  try {
    // Step 1: List all active sessions
    const sessions = await listActiveSessions();
    logger.debug(`📋 Found ${sessions.length} active sessions`);
    
    if (sessions.length === 0) {
      logger.debug("✅ No active sessions found - cleanup complete");
      return;
    }

    // Step 2: Display all sessions in console
    logger.debug("📝 Active Sessions Details:");
    sessions.forEach((session: any, index: number) => {
      logger.debug(`  [${index + 1}] Session ID: ${session.session_id}`);
      logger.debug(`      Status: ${session.status}`);
      logger.debug(`      Created: ${new Date(session.created_at * 1000).toLocaleString()}`);
      logger.debug(`      Age: ${Math.floor((Date.now() / 1000 - session.created_at) / 60)} minutes`);
    });

    // Step 3: Close all sessions with regular close
    logger.debug("🔄 Attempting to close all sessions...");
    const closeResults = [];
    
    for (const session of sessions) {
      try {
        logger.debug(`⏳ Closing session ${session.session_id} (status: ${session.status})`);
        await closeSession(session.session_id);
        closeResults.push({ sessionId: session.session_id, result: 'success' });
        logger.debug(`✅ Successfully closed session ${session.session_id}`);
      } catch (error) {
        console.error(`❌ Failed to close session ${session.session_id}:`, error);
        closeResults.push({ sessionId: session.session_id, result: 'failed', error });
      }
    }

    // Step 4: Wait a moment for sessions to actually close
    logger.debug("⏳ Waiting 2 seconds for sessions to close...");
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Step 5: Check for remaining sessions
    logger.debug("🔍 Checking for remaining sessions...");
    const remainingSessions = await listActiveSessions();
    
    if (remainingSessions.length === 0) {
      logger.debug("✅ All sessions successfully closed!");
      logger.debug("🔍 ======= ROBUST SESSION CLEANUP COMPLETE =======");
      return;
    }

    // Step 6: HARDCLOSE remaining sessions
    logger.debug(`⚠️  Found ${remainingSessions.length} remaining sessions - initiating HARDCLOSE`);
    logger.debug("💀 HARDCLOSE Sessions Details:");
    remainingSessions.forEach((session: any, index: number) => {
      logger.debug(`  [${index + 1}] REMAINING Session ID: ${session.session_id}`);
      logger.debug(`      Status: ${session.status}`);
      logger.debug(`      Created: ${new Date(session.created_at * 1000).toLocaleString()}`);
    });

    // Step 7: Force close remaining sessions
    const hardCloseResults = [];
    
    for (const session of remainingSessions) {
      try {
        logger.debug(`💀 HARDCLOSE attempt for session ${session.session_id}`);
        await hardCloseSession(session.session_id);
        hardCloseResults.push({ sessionId: session.session_id, result: 'hardclose-success' });
        logger.debug(`💀✅ HARDCLOSE successful for session ${session.session_id}`);
      } catch (error) {
        console.error(`💀❌ HARDCLOSE failed for session ${session.session_id}:`, error);
        hardCloseResults.push({ sessionId: session.session_id, result: 'hardclose-failed', error });
      }
    }

    // Step 8: Final verification
    logger.debug("⏳ Waiting 3 seconds after HARDCLOSE...");
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const finalCheck = await listActiveSessions();
    
    if (finalCheck.length === 0) {
      logger.debug("💀✅ HARDCLOSE successful - all sessions terminated!");
    } else {
      logger.debug(`💀⚠️  WARNING: ${finalCheck.length} sessions still remain after HARDCLOSE`);
      finalCheck.forEach((session: any, index: number) => {
        logger.debug(`  [${index + 1}] STUBBORN Session ID: ${session.session_id} (status: ${session.status})`);
      });
    }

    // Step 9: Summary report
    logger.debug("📊 SESSION CLEANUP SUMMARY:");
    logger.debug(`  📋 Initial sessions found: ${sessions.length}`);
    logger.debug(`  ✅ Regular close successful: ${closeResults.filter(r => r.result === 'success').length}`);
    logger.debug(`  ❌ Regular close failed: ${closeResults.filter(r => r.result === 'failed').length}`);
    logger.debug(`  💀 HARDCLOSE attempted: ${remainingSessions.length}`);
    logger.debug(`  💀✅ HARDCLOSE successful: ${hardCloseResults.filter(r => r.result === 'hardclose-success').length}`);
    logger.debug(`  💀❌ HARDCLOSE failed: ${hardCloseResults.filter(r => r.result === 'hardclose-failed').length}`);
    logger.debug(`  🔍 Final remaining sessions: ${finalCheck.length}`);
    
    logger.debug("🔍 ======= ROBUST SESSION CLEANUP COMPLETE =======");

  } catch (error) {
    console.error("🚨 CRITICAL ERROR in robust session cleanup:", error);
    logger.debug("🔍 ======= ROBUST SESSION CLEANUP FAILED =======");
    throw error;
  }
}

async function hardCloseSession(sessionId: string) {
  try {
    // First try the regular close endpoint with force parameter
    const response = await fetch("/api/hardclose-session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ 
        session_id: sessionId,
        force: true 
      }),
    });

    if (!response.ok) {
      throw new Error(`HARDCLOSE failed: ${response.statusText}`);
    }

    const data = await response.json();
    logger.debug(`💀 HARDCLOSE result for ${sessionId}:`, data);
    return data;
    
  } catch (error) {
    console.error(`💀 HARDCLOSE error for session ${sessionId}:`, error);
    throw error;
  }
}

function InteractiveAvatar() {
  const { initAvatar, startAvatar, stopAvatar, avatarRef, sessionState, stream } =
    useStreamingAvatarSession();
  const { startVoiceChat, unmuteInputAudio } = useVoiceChat();
  const { startMonitoring, stopMonitoring } = useAudioMonitor();

  const [config, setConfig] = useState<StartAvatarRequest>(DEFAULT_CONFIG);
  const [isEnglish, setIsEnglish] = useState(false);
  const [lastAvatarMessageTime, setLastAvatarMessageTime] = useState<number>(0);
  const [shouldUnmuteOnFirstStop, setShouldUnmuteOnFirstStop] = useState(false);
  const shouldUnmuteOnFirstStopRef = useRef(false);

  const mediaStream = useRef<HTMLVideoElement>(null);
  const [middleClickTimer, setMiddleClickTimer] = useState<NodeJS.Timeout | null>(null);
  const [isSessionStarting, setIsSessionStarting] = useState(false);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  async function fetchAccessToken() {
    try {
      logger.debug("Fetching access token...");
      const response = await fetch("/api/get-access-token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("Access Token Error:", errorText);
        if (response.status === 401) {
          throw new Error("Authentication failed - please check your API key");
        } else if (response.status === 403) {
          throw new Error("Access forbidden - please check your permissions");
        } else if (response.status === 503) {
          throw new Error("Network connection failed - please check your internet connection");
        } else {
          throw new Error(`Failed to get access token: ${errorText}`);
        }
      }
      
      const token = await response.text();

      if (!token || token.includes("Failed")) {
        console.error("Access Token: Failed to retrieve access token");
        throw new Error("Invalid access token received");
      }

      logger.debug("Access Token:", "Success"); // Don't log the actual token for security

      return token;
    } catch (error) {
      console.error("Error fetching access token:", error);
      throw error;
    }
  }

  const startSessionV2 = useMemoizedFn(async (isVoiceChat: boolean, isEnglish: boolean = false) => {
    try {
      logger.info(`START SESSION: isVoiceChat=${isVoiceChat}, isEnglish=${isEnglish}`);
      
      // GÜVENLİK: Session başlatırken middle click timer'ını temizle
      if (middleClickTimer) {
        logger.debug('Clearing middle click timer on session start');
        clearTimeout(middleClickTimer);
        setMiddleClickTimer(null);
      }
      
      setIsEnglish(isEnglish);

      logger.debug(`Language state set: isEnglish=${isEnglish} (${isEnglish ? 'English' : 'Turkish'})`);
      
      // 🎬 INTRO VIDEO: Immediately trigger intro video when session starts
      logger.info('Triggering intro video immediately on session start');
      window.dispatchEvent(new CustomEvent('session-starting', { 
        detail: { language: isEnglish ? 'en' : 'tr' }
      }));
      
      const newToken = await fetchAccessToken();
      
      logger.debug('DEFAULT_CONFIG loaded from environment:', {
        quality: DEFAULT_CONFIG.quality,
        avatarName: DEFAULT_CONFIG.avatarName,
        voiceChatTransport: DEFAULT_CONFIG.voiceChatTransport,
        voice: DEFAULT_CONFIG.voice,
        sttSettings: DEFAULT_CONFIG.sttSettings
      });
      
      // Close all active sessions before starting a new one
      logger.debug("Checking for active sessions before starting new session...");
      await closeAllActiveSessions();
      
      const avatar = initAvatar(newToken);

      avatar.on(StreamingEvents.AVATAR_START_TALKING, (e) => {
        const timestamp = new Date().toLocaleTimeString();
        logger.debug(`[${timestamp}] 🗣️ Avatar started talking`, e);
        
        // FALLBACK: Set lastAvatarMessageTime when avatar starts talking (for EN knowledge base)
        setLastAvatarMessageTime(Date.now());
        logger.debug(`🔄 FALLBACK: Set lastAvatarMessageTime on AVATAR_START_TALKING for EN compatibility`);
        
        // Clear session ending timers if avatar starts talking
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
          debounceTimerRef.current = null;
          logger.debug("Debounce timer cleared - avatar started talking");
        }
        if (countdownTimerRef.current) {
          clearTimeout(countdownTimerRef.current);
          countdownTimerRef.current = null;
          logger.debug("Countdown timer cleared - avatar started talking");
        }
        
        // Dispatch custom event for video transition
        window.dispatchEvent(new Event('avatar-start-talking'));
      });
      
      avatar.on(StreamingEvents.AVATAR_TALKING_MESSAGE, (event) => {
        logger.debug(">>>>> Avatar talking message:", event);
        setLastAvatarMessageTime(Date.now());
        logger.debug(`🔄 NORMAL: Set lastAvatarMessageTime on AVATAR_TALKING_MESSAGE`);
        
        // CRITICAL: Clear any existing session ending timers when avatar is actively talking
        let clearedTimers = false;
        if (debounceTimerRef.current) {
          logger.debug(`CLEARING debounce timer ${debounceTimerRef.current} - avatar actively talking`);
          clearTimeout(debounceTimerRef.current);
          debounceTimerRef.current = null;
          clearedTimers = true;
        }
        if (countdownTimerRef.current) {
          logger.debug(`CLEARING countdown timer ${countdownTimerRef.current} - avatar actively talking`);
          clearTimeout(countdownTimerRef.current);
          countdownTimerRef.current = null;
          clearedTimers = true;
        }
        
        if (clearedTimers) {
          logger.debug("✅ Session ending timers cleared - avatar is actively talking");
        }
      });
      
      avatar.on(StreamingEvents.AVATAR_STOP_TALKING, (event) => {
        const timestamp = new Date().toLocaleTimeString();
        logger.debug(`[${timestamp}] 🛑 Avatar stopped talking:`, event);
        
        // DEBUG: Flag durumunu kontrol et
        logger.debug(`🔍 DEBUG: shouldUnmuteOnFirstStop flag durumu: ${shouldUnmuteOnFirstStop}`);
        logger.debug(`🔍 DEBUG: shouldUnmuteOnFirstStopRef.current durumu: ${shouldUnmuteOnFirstStopRef.current}`);
        
        // İlk defa avatar stopped talking geldiğinde mikrofonu unmute et
        if (shouldUnmuteOnFirstStopRef.current) {
          logger.debug("🎤 İlk avatar stopped talking - mikrofonu unmute ediliyor");
          unmuteInputAudio();
          setShouldUnmuteOnFirstStop(false);
          shouldUnmuteOnFirstStopRef.current = false;
          logger.debug("🎤 Mikrofon unmute edildi ve flag kapatıldı");
        } else {
          logger.debug("🔍 DEBUG: shouldUnmuteOnFirstStop flag false olduğu için unmute edilmedi");
        }
        
        // FALLBACK: Update lastAvatarMessageTime when avatar stops talking (for EN knowledge base)
        setLastAvatarMessageTime(Date.now());
        logger.debug(`🔄 FALLBACK: Updated lastAvatarMessageTime on AVATAR_STOP_TALKING for EN compatibility`);
        
        // Session ending logic - start countdown when avatar stops talking
        logger.debug(`🔚 Avatar stopped talking - starting countdown sequence`);
        const timeSinceLastMessage = Date.now() - lastAvatarMessageTime;
        logger.debug(`🔚 Time since last message: ${timeSinceLastMessage}ms`);
        
        // Start countdown since avatar has truly stopped talking
        logger.debug("✅ Avatar confirmed stopped - starting countdown sequence");
        startCountdownSequence("AVATAR_STOP_TALKING");
      });
      
      avatar.on(StreamingEvents.AVATAR_END_MESSAGE, (event) => {
        logger.debug(">>>>> Avatar end message:", event);
        logger.debug("🚫 NOT starting countdown - waiting for AVATAR_STOP_TALKING to confirm avatar stopped");
      });
      
      avatar.on(StreamingEvents.STREAM_DISCONNECTED, () => {
        logger.debug("🔌 Stream disconnected");
        logger.debug("🔌 Session state before cleanup:", sessionState);
        setLastAvatarMessageTime(0);
        
        // Reset unmute flag on disconnect
        setShouldUnmuteOnFirstStop(false);
        shouldUnmuteOnFirstStopRef.current = false;
        
        // Clear all timers on disconnect
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
          debounceTimerRef.current = null;
        }
        if (countdownTimerRef.current) {
          clearTimeout(countdownTimerRef.current);
          countdownTimerRef.current = null;
        }
        
        // Stop audio monitoring when stream disconnects
        stopMonitoring();
        
        logger.debug("🔌 Stream disconnected - all timers cleared and audio monitoring stopped");
      });
      
      avatar.on(StreamingEvents.STREAM_READY, (event) => {
        logger.debug(">>>>> Stream ready:", event.detail);
      });
      
      avatar.on(StreamingEvents.USER_START, (event) => {
        logger.debug(">>>>> User started talking:", event);
        
        // Clear session ending timers if user starts talking
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
          debounceTimerRef.current = null;
          logger.debug("Debounce timer cleared - user started talking");
        }
        if (countdownTimerRef.current) {
          logger.debug("Clearing countdown timer. Timer ID:", countdownTimerRef.current);
          clearTimeout(countdownTimerRef.current);
          countdownTimerRef.current = null;
          logger.debug("Countdown timer cleared - user started talking");
        } else {
          logger.debug("No countdown timer to clear");
        }
      });
      
      avatar.on(StreamingEvents.USER_STOP, (event) => {
        logger.debug(">>>>> User stopped talking:", event);
      });
      avatar.on(StreamingEvents.USER_END_MESSAGE, (event) => {
        logger.debug(">>>>> User end message:", event);
      });
      avatar.on(StreamingEvents.USER_TALKING_MESSAGE, (event) => {
        logger.debug(">>>>> User talking message:", event);
      });

      const updatedConfig = {
        ...config,
        knowledgeId: isEnglish 
          ? process.env.NEXT_PUBLIC_EN_KNOWLEDGE_BASE_ID 
          : process.env.NEXT_PUBLIC_TR_KNOWLEDGE_BASE_ID,
        language: isEnglish 
          ? process.env.NEXT_PUBLIC_EN_LANGUAGE 
          : process.env.NEXT_PUBLIC_TR_LANGUAGE,
        voice: {
          ...config.voice,
          // Türkçe için biraz daha yavaş, İngilizce için biraz daha hızlı
          rate: isEnglish ? 0.95 : 1.05
        }
      };

      logger.debug('InteractiveAvatar - Starting session with config:', {
        isEnglish,
        knowledgeId: updatedConfig.knowledgeId,
        language: updatedConfig.language,
        avatarName: updatedConfig.avatarName,
        quality: updatedConfig.quality,
        voiceChatTransport: updatedConfig.voiceChatTransport,
        voice: updatedConfig.voice,
        sttSettings: updatedConfig.sttSettings
      });

      // Log the actual environment variables for debugging
      logger.debug('Environment variables:', {
        NEXT_PUBLIC_EN_KNOWLEDGE_BASE_ID: process.env.NEXT_PUBLIC_EN_KNOWLEDGE_BASE_ID,
        NEXT_PUBLIC_TR_KNOWLEDGE_BASE_ID: process.env.NEXT_PUBLIC_TR_KNOWLEDGE_BASE_ID,
        NEXT_PUBLIC_EN_LANGUAGE: process.env.NEXT_PUBLIC_EN_LANGUAGE,
        NEXT_PUBLIC_TR_LANGUAGE: process.env.NEXT_PUBLIC_TR_LANGUAGE,
      });

      await startAvatar(updatedConfig);

      if (isVoiceChat) {
        await startVoiceChat();
        
        // Start audio monitoring after voice chat is started
        if (mediaStream.current) {
          logger.debug("🎧 Starting audio monitoring for automatic microphone control");
          startMonitoring(mediaStream.current);
          
          // 🚨 CRITICAL FIX: Force video to switch to streaming state
          logger.debug("🎬 FORCING video switch to streaming state - stream is ready");
          setTimeout(() => {
            window.dispatchEvent(new Event('avatar-start-talking'));
          }, 500); // Small delay to ensure video is playing
        }
      }
      
      // GÜVENLİK: Session başarıyla başlatıldı, flag'i reset et
      setIsSessionStarting(false);
      logger.debug('🔒 Session başarıyla başlatıldı, isSessionStarting flag reset edildi');
      
    } catch (error) {
      console.error("Error starting avatar session:", error);
      
      // GÜVENLİK: Hata durumunda da flag'i reset et
      setIsSessionStarting(false);
      logger.debug('🔒 Session başlatma hatası, isSessionStarting flag reset edildi');
      
      // 🚨 ERROR VIDEO: Dispatch error event to play error video
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.debug('🚨 Dispatching session-error event for error video');
      window.dispatchEvent(new CustomEvent('session-error', { 
        detail: { 
          language: isEnglish ? 'en' : 'tr',
          error: errorMessage
        }
      }));
    }
  });

  const handleMiddleClick = async (event: React.MouseEvent) => {
    if (event.button !== 1) return;
    event.preventDefault();

    // GÜVENLİK: Session aktifken veya başlatma sürecindeyken middle click'leri ignore et
    if (sessionState !== StreamingAvatarSessionState.INACTIVE || isSessionStarting) {
      logger.debug(`Middle click ignored - session state: ${sessionState}, isSessionStarting: ${isSessionStarting}`);
      return;
    }

    // GÜVENLİK: Zaten bir middle click timer varsa ve yeni click geliyorsa, sadece double click kontrolü yap
    if (middleClickTimer) {
      // Double click detected within 3 seconds
      clearTimeout(middleClickTimer);
      setMiddleClickTimer(null);
      setIsSessionStarting(true); // GÜVENLİK: Hemen flag set et
      logger.debug('Double middle click detected: Starting English session.');
      await startSessionV2(true, true);
      return;
    }

    // First click: start timer
    logger.debug('Single middle click detected, waiting for potential double click...');
    const timer = setTimeout(async () => {
      setMiddleClickTimer(null);
      // ÇİFTE KONTROL: Timer tetiklenirken bile session state'ini kontrol et
      if (sessionState !== StreamingAvatarSessionState.INACTIVE || isSessionStarting) {
        logger.debug(`Timer fired but session state changed to: ${sessionState} or isSessionStarting: ${isSessionStarting}. Ignoring timer.`);
        return;
      }
      setIsSessionStarting(true); // GÜVENLİK: Timer tetiklendiğinde de flag set et
      logger.debug('No double click detected: Starting Turkish session.');
      await startSessionV2(true, false);
    }, 3000);
    setMiddleClickTimer(timer);
  };

  useUnmount(() => {
    setLastAvatarMessageTime(0);
    setShouldUnmuteOnFirstStop(false);
    shouldUnmuteOnFirstStopRef.current = false;
    setIsSessionStarting(false);
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    if (countdownTimerRef.current) {
      clearTimeout(countdownTimerRef.current);
    }
    if (middleClickTimer) {
      clearTimeout(middleClickTimer);
    }
    stopMonitoring();
    stopAvatar();
  });

  // Debug session state changes
  useEffect(() => {
    logger.debug(`🔄 SESSION STATE CHANGED: ${sessionState}`);
    
    // Session CONNECTED olduğunda flag'i set et
    if (sessionState === StreamingAvatarSessionState.CONNECTED && !shouldUnmuteOnFirstStopRef.current) {
      setShouldUnmuteOnFirstStop(true);
      shouldUnmuteOnFirstStopRef.current = true;
      logger.debug("🎧 Session CONNECTED - mikrofon ilk avatar stop talking'de unmute edilecek");
      logger.debug("🔍 DEBUG: shouldUnmuteOnFirstStop flag TRUE olarak set edildi (via session state)");
    }
  }, [sessionState]);

  useEffect(() => {
    if (stream && mediaStream.current) {
      logger.debug('Assigning stream to video element:', mediaStream.current);
      mediaStream.current.srcObject = stream;
      mediaStream.current.onloadedmetadata = () => {
        logger.debug('Stream metadata loaded, playing video');
        mediaStream.current!.play();
        
        // Start audio monitoring when stream is ready and playing
        logger.debug("🎧 Starting audio monitoring after stream is ready");
        startMonitoring(mediaStream.current!);
      };
    } else {
      logger.debug('Stream or mediaStream.current not available:', { stream: !!stream, mediaStreamRef: !!mediaStream.current });
    }
  }, [mediaStream, stream, startMonitoring]);

  // Centralized countdown function
  const startCountdownSequence = (triggerSource: string) => {
    logger.debug(`Starting countdown sequence from: ${triggerSource}`);
    
    // CRITICAL: Clear ALL existing timers first to prevent conflicts
    if (debounceTimerRef.current) {
      logger.debug(`Clearing existing debounce timer: ${debounceTimerRef.current}`);
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (countdownTimerRef.current) {
      logger.debug(`Clearing existing countdown timer: ${countdownTimerRef.current}`);
      clearTimeout(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    
    logger.debug(`✅ Starting countdown from ${triggerSource}`);
    
    // Start fresh debounce timer
    debounceTimerRef.current = setTimeout(() => {
      // Double check: ensure no recent avatar messages
      const currentTime = Date.now();
      const timeSinceLastMessage = currentTime - lastAvatarMessageTime;
      logger.debug(`Debounce timer fired: timeSinceLastMessage=${timeSinceLastMessage}ms`);
      logger.debug(`Debug: currentTime=${currentTime}, lastAvatarMessageTime=${lastAvatarMessageTime}`);
      
      // IMPROVED: Handle case where lastAvatarMessageTime is 0 or unreliable
      const isReliableTimestamp = lastAvatarMessageTime > 0 && lastAvatarMessageTime < currentTime;
      
      if (isReliableTimestamp && timeSinceLastMessage < 2000) {
        logger.debug("Avatar still active based on reliable timestamp, restarting debounce");
        return;
      } else if (!isReliableTimestamp) {
        logger.debug(`⚠️ Unreliable timestamp detected (lastAvatarMessageTime=${lastAvatarMessageTime}), proceeding with countdown`);
      }
      
      logger.debug("Avatar appears to be finished (3 seconds after message end). Starting countdown...");
      
      // Start the main countdown timer
      const timer = setTimeout(() => {
        logger.debug("5-second countdown completed - ending session and playing ending video");
        logger.debug(`🔍 DEBUG: isEnglish=${isEnglish}, sending language=${isEnglish ? 'en' : 'tr'}`);
        
        // First: Stop the avatar session
        stopAvatar();
        
        // Then: Immediately play ending video (don't wait for session state change)
        setTimeout(() => {
          const eventData = { language: isEnglish ? 'en' : 'tr' };
          logger.debug(`🎬 Dispatching session-ending event with:`, eventData);
          window.dispatchEvent(new CustomEvent('session-ending', { 
            detail: eventData
          }));
        }, 100); // Small delay to ensure session is stopped
        
        countdownTimerRef.current = null;
      }, 5000);
      
      countdownTimerRef.current = timer;
      debounceTimerRef.current = null;
      logger.debug("Started 5-second countdown timer. Timer ID:", timer);
    }, 3000);
    
    logger.debug(`Started 3-second debounce timer from ${triggerSource}. Timer ID:`, debounceTimerRef.current);
  };

  return (
    <div className="w-full flex flex-col gap-4">
      <div className="flex flex-col rounded-xl bg-zinc-900 overflow-hidden">
        <div 
          className="relative w-full aspect-video overflow-hidden flex flex-col items-center justify-center"
          onMouseDown={(e) => {
            if (e.button === 1) { // Middle click
              handleMiddleClick(e);
            }
          }}
        >
            <AvatarVideo ref={mediaStream} isEnglish={isEnglish} />
        </div>
        <div className="flex flex-col gap-3 items-center justify-center p-4 border-t border-zinc-700 w-full">
          {sessionState === StreamingAvatarSessionState.CONNECTED ? (
            <AvatarControls />
          ) : sessionState === StreamingAvatarSessionState.INACTIVE ? (
            <div className="flex flex-row gap-4">
              <Button onClick={() => startSessionV2(true, false)}>
                Start Voice Chat (TR)
              </Button>
              <Button onClick={() => startSessionV2(true, true)}>
                Start Voice Chat (EN)
              </Button>
            </div>
          ) : (
            <LoadingIcon />
          )}
        </div>
      </div>
      {sessionState === StreamingAvatarSessionState.CONNECTED && (
        <MessageHistory />
      )}
    </div>
  );
}

export default function InteractiveAvatarWrapper() {
  return (
    <StreamingAvatarProvider basePath={process.env.NEXT_PUBLIC_BASE_API_URL}>
      <InteractiveAvatar />
    </StreamingAvatarProvider>
  );
}
