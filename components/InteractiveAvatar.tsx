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
        console.warn("Session list request timed out - continuing with session start");
        return [];
      } else if (response.status === 503) {
        console.warn("Network connection failed for session list - continuing with session start");
        return [];
      } else {
        throw new Error(`Failed to list sessions: ${response.statusText}`);
      }
    }

    const data = await response.json();
    console.log("Active sessions:", data);
    
    // Handle HeyGen API response structure: {code: 100, data: {sessions: []}, message: 'success'}
    if (data.data && data.data.sessions) {
      console.log(`🔍 API Response: Found ${data.data.sessions.length} sessions in data.data.sessions`);
      return data.data.sessions;
    } else if (data.sessions) {
      console.log(`🔍 API Response: Found ${data.sessions.length} sessions in data.sessions`);
      return data.sessions;
    } else {
      console.log("🔍 API Response: No sessions found in expected structure");
      console.log("🔍 Full response structure:", JSON.stringify(data, null, 2));
      return [];
    }
  } catch (error) {
    console.error("Error listing active sessions:", error);
    console.warn("Continuing with session start despite session list error");
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
    console.log(`Session ${sessionId} closed:`, data);
    return data;
  } catch (error) {
    console.error(`Error closing session ${sessionId}:`, error);
    throw error;
  }
}

async function closeAllActiveSessions() {
  console.log("🔍 ======= ROBUST SESSION CLEANUP START =======");
  
  try {
    // Step 1: List all active sessions
    const sessions = await listActiveSessions();
    console.log(`📋 Found ${sessions.length} active sessions`);
    
    if (sessions.length === 0) {
      console.log("✅ No active sessions found - cleanup complete");
      return;
    }

    // Step 2: Display all sessions in console
    console.log("📝 Active Sessions Details:");
    sessions.forEach((session: any, index: number) => {
      console.log(`  [${index + 1}] Session ID: ${session.session_id}`);
      console.log(`      Status: ${session.status}`);
      console.log(`      Created: ${new Date(session.created_at * 1000).toLocaleString()}`);
      console.log(`      Age: ${Math.floor((Date.now() / 1000 - session.created_at) / 60)} minutes`);
    });

    // Step 3: Close all sessions with regular close
    console.log("🔄 Attempting to close all sessions...");
    const closeResults = [];
    
    for (const session of sessions) {
      try {
        console.log(`⏳ Closing session ${session.session_id} (status: ${session.status})`);
        await closeSession(session.session_id);
        closeResults.push({ sessionId: session.session_id, result: 'success' });
        console.log(`✅ Successfully closed session ${session.session_id}`);
      } catch (error) {
        console.error(`❌ Failed to close session ${session.session_id}:`, error);
        closeResults.push({ sessionId: session.session_id, result: 'failed', error });
      }
    }

    // Step 4: Wait a moment for sessions to actually close
    console.log("⏳ Waiting 2 seconds for sessions to close...");
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Step 5: Check for remaining sessions
    console.log("🔍 Checking for remaining sessions...");
    const remainingSessions = await listActiveSessions();
    
    if (remainingSessions.length === 0) {
      console.log("✅ All sessions successfully closed!");
      console.log("🔍 ======= ROBUST SESSION CLEANUP COMPLETE =======");
      return;
    }

    // Step 6: HARDCLOSE remaining sessions
    console.log(`⚠️  Found ${remainingSessions.length} remaining sessions - initiating HARDCLOSE`);
    console.log("💀 HARDCLOSE Sessions Details:");
    remainingSessions.forEach((session: any, index: number) => {
      console.log(`  [${index + 1}] REMAINING Session ID: ${session.session_id}`);
      console.log(`      Status: ${session.status}`);
      console.log(`      Created: ${new Date(session.created_at * 1000).toLocaleString()}`);
    });

    // Step 7: Force close remaining sessions
    const hardCloseResults = [];
    
    for (const session of remainingSessions) {
      try {
        console.log(`💀 HARDCLOSE attempt for session ${session.session_id}`);
        await hardCloseSession(session.session_id);
        hardCloseResults.push({ sessionId: session.session_id, result: 'hardclose-success' });
        console.log(`💀✅ HARDCLOSE successful for session ${session.session_id}`);
      } catch (error) {
        console.error(`💀❌ HARDCLOSE failed for session ${session.session_id}:`, error);
        hardCloseResults.push({ sessionId: session.session_id, result: 'hardclose-failed', error });
      }
    }

    // Step 8: Final verification
    console.log("⏳ Waiting 3 seconds after HARDCLOSE...");
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const finalCheck = await listActiveSessions();
    
    if (finalCheck.length === 0) {
      console.log("💀✅ HARDCLOSE successful - all sessions terminated!");
    } else {
      console.log(`💀⚠️  WARNING: ${finalCheck.length} sessions still remain after HARDCLOSE`);
      finalCheck.forEach((session: any, index: number) => {
        console.log(`  [${index + 1}] STUBBORN Session ID: ${session.session_id} (status: ${session.status})`);
      });
    }

    // Step 9: Summary report
    console.log("📊 SESSION CLEANUP SUMMARY:");
    console.log(`  📋 Initial sessions found: ${sessions.length}`);
    console.log(`  ✅ Regular close successful: ${closeResults.filter(r => r.result === 'success').length}`);
    console.log(`  ❌ Regular close failed: ${closeResults.filter(r => r.result === 'failed').length}`);
    console.log(`  💀 HARDCLOSE attempted: ${remainingSessions.length}`);
    console.log(`  💀✅ HARDCLOSE successful: ${hardCloseResults.filter(r => r.result === 'hardclose-success').length}`);
    console.log(`  💀❌ HARDCLOSE failed: ${hardCloseResults.filter(r => r.result === 'hardclose-failed').length}`);
    console.log(`  🔍 Final remaining sessions: ${finalCheck.length}`);
    
    console.log("🔍 ======= ROBUST SESSION CLEANUP COMPLETE =======");

  } catch (error) {
    console.error("🚨 CRITICAL ERROR in robust session cleanup:", error);
    console.log("🔍 ======= ROBUST SESSION CLEANUP FAILED =======");
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
    console.log(`💀 HARDCLOSE result for ${sessionId}:`, data);
    return data;
    
  } catch (error) {
    console.error(`💀 HARDCLOSE error for session ${sessionId}:`, error);
    throw error;
  }
}

function InteractiveAvatar() {
  const { initAvatar, startAvatar, stopAvatar, avatarRef, sessionState, stream } =
    useStreamingAvatarSession();
  const { startVoiceChat } = useVoiceChat();
  const { startMonitoring, stopMonitoring } = useAudioMonitor();

  const [config, setConfig] = useState<StartAvatarRequest>(DEFAULT_CONFIG);
  const [isEnglish, setIsEnglish] = useState(false);
  const [lastAvatarMessageTime, setLastAvatarMessageTime] = useState<number>(0);

  const mediaStream = useRef<HTMLVideoElement>(null);
  const [middleClickTimer, setMiddleClickTimer] = useState<NodeJS.Timeout | null>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  async function fetchAccessToken() {
    try {
      console.log("Fetching access token...");
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

      console.log("Access Token:", "Success"); // Don't log the actual token for security

      return token;
    } catch (error) {
      console.error("Error fetching access token:", error);
      throw error;
    }
  }

  const startSessionV2 = useMemoizedFn(async (isVoiceChat: boolean, isEnglish: boolean = false) => {
    try {
      console.log(`🌐 START SESSION: isVoiceChat=${isVoiceChat}, isEnglish=${isEnglish}`);
      setIsEnglish(isEnglish);

      console.log(`🔍 Language state set: isEnglish=${isEnglish} (${isEnglish ? 'English' : 'Turkish'})`);
      
      // 🎬 INTRO VIDEO: Immediately trigger intro video when session starts
      console.log('🎬 Triggering intro video immediately on session start');
      window.dispatchEvent(new CustomEvent('session-starting', { 
        detail: { language: isEnglish ? 'en' : 'tr' }
      }));
      
      const newToken = await fetchAccessToken();
      
      console.log('DEFAULT_CONFIG loaded from environment:', {
        quality: DEFAULT_CONFIG.quality,
        avatarName: DEFAULT_CONFIG.avatarName,
        voiceChatTransport: DEFAULT_CONFIG.voiceChatTransport,
        voice: DEFAULT_CONFIG.voice,
        sttSettings: DEFAULT_CONFIG.sttSettings
      });
      
      // Close all active sessions before starting a new one
      console.log("Checking for active sessions before starting new session...");
      await closeAllActiveSessions();
      
      const avatar = initAvatar(newToken);

      avatar.on(StreamingEvents.AVATAR_START_TALKING, (e) => {
        const timestamp = new Date().toLocaleTimeString();
        console.log(`[${timestamp}] 🗣️ Avatar started talking`, e);
        
        // FALLBACK: Set lastAvatarMessageTime when avatar starts talking (for EN knowledge base)
        setLastAvatarMessageTime(Date.now());
        console.log(`🔄 FALLBACK: Set lastAvatarMessageTime on AVATAR_START_TALKING for EN compatibility`);
        
        // Clear session ending timers if avatar starts talking
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
          debounceTimerRef.current = null;
          console.log("Debounce timer cleared - avatar started talking");
        }
        if (countdownTimerRef.current) {
          clearTimeout(countdownTimerRef.current);
          countdownTimerRef.current = null;
          console.log("Countdown timer cleared - avatar started talking");
        }
        
        // Dispatch custom event for video transition
        window.dispatchEvent(new Event('avatar-start-talking'));
      });
      
      avatar.on(StreamingEvents.AVATAR_TALKING_MESSAGE, (event) => {
        console.log(">>>>> Avatar talking message:", event);
        setLastAvatarMessageTime(Date.now());
        console.log(`🔄 NORMAL: Set lastAvatarMessageTime on AVATAR_TALKING_MESSAGE`);
        
        // CRITICAL: Clear any existing session ending timers when avatar is actively talking
        let clearedTimers = false;
        if (debounceTimerRef.current) {
          console.log(`CLEARING debounce timer ${debounceTimerRef.current} - avatar actively talking`);
          clearTimeout(debounceTimerRef.current);
          debounceTimerRef.current = null;
          clearedTimers = true;
        }
        if (countdownTimerRef.current) {
          console.log(`CLEARING countdown timer ${countdownTimerRef.current} - avatar actively talking`);
          clearTimeout(countdownTimerRef.current);
          countdownTimerRef.current = null;
          clearedTimers = true;
        }
        
        if (clearedTimers) {
          console.log("✅ Session ending timers cleared - avatar is actively talking");
        }
      });
      
      avatar.on(StreamingEvents.AVATAR_STOP_TALKING, (event) => {
        const timestamp = new Date().toLocaleTimeString();
        console.log(`[${timestamp}] 🛑 Avatar stopped talking:`, event);
        
        // FALLBACK: Update lastAvatarMessageTime when avatar stops talking (for EN knowledge base)
        setLastAvatarMessageTime(Date.now());
        console.log(`🔄 FALLBACK: Updated lastAvatarMessageTime on AVATAR_STOP_TALKING for EN compatibility`);
        
        // Session ending logic - start countdown when avatar stops talking
        console.log(`🔚 Avatar stopped talking - starting countdown sequence`);
        const timeSinceLastMessage = Date.now() - lastAvatarMessageTime;
        console.log(`🔚 Time since last message: ${timeSinceLastMessage}ms`);
        
        // Start countdown since avatar has truly stopped talking
        console.log("✅ Avatar confirmed stopped - starting countdown sequence");
        startCountdownSequence("AVATAR_STOP_TALKING");
      });
      
      avatar.on(StreamingEvents.AVATAR_END_MESSAGE, (event) => {
        console.log(">>>>> Avatar end message:", event);
        console.log("🚫 NOT starting countdown - waiting for AVATAR_STOP_TALKING to confirm avatar stopped");
      });
      
      avatar.on(StreamingEvents.STREAM_DISCONNECTED, () => {
        console.log("🔌 Stream disconnected");
        console.log("🔌 Session state before cleanup:", sessionState);
        setLastAvatarMessageTime(0);
        
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
        
        console.log("🔌 Stream disconnected - all timers cleared and audio monitoring stopped");
      });
      
      avatar.on(StreamingEvents.STREAM_READY, (event) => {
        console.log(">>>>> Stream ready:", event.detail);
      });
      
      avatar.on(StreamingEvents.USER_START, (event) => {
        console.log(">>>>> User started talking:", event);
        
        // Clear session ending timers if user starts talking
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
          debounceTimerRef.current = null;
          console.log("Debounce timer cleared - user started talking");
        }
        if (countdownTimerRef.current) {
          console.log("Clearing countdown timer. Timer ID:", countdownTimerRef.current);
          clearTimeout(countdownTimerRef.current);
          countdownTimerRef.current = null;
          console.log("Countdown timer cleared - user started talking");
        } else {
          console.log("No countdown timer to clear");
        }
      });
      
      avatar.on(StreamingEvents.USER_STOP, (event) => {
        console.log(">>>>> User stopped talking:", event);
      });
      avatar.on(StreamingEvents.USER_END_MESSAGE, (event) => {
        console.log(">>>>> User end message:", event);
      });
      avatar.on(StreamingEvents.USER_TALKING_MESSAGE, (event) => {
        console.log(">>>>> User talking message:", event);
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

      console.log('InteractiveAvatar - Starting session with config:', {
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
      console.log('Environment variables:', {
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
          console.log("🎧 Starting audio monitoring for automatic microphone control");
          startMonitoring(mediaStream.current);
        }
      }
    } catch (error) {
      console.error("Error starting avatar session:", error);
      
      // 🚨 ERROR VIDEO: Dispatch error event to play error video
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.log('🚨 Dispatching session-error event for error video');
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

    if (middleClickTimer) {
      // Double click detected within 3 seconds
      clearTimeout(middleClickTimer);
      setMiddleClickTimer(null);
      console.log('Double middle click detected: Starting English session.');
      await startSessionV2(true, true);
      return;
    }

    // First click: start timer
    console.log('Single middle click detected, waiting for potential double click...');
    const timer = setTimeout(async () => {
      setMiddleClickTimer(null);
      console.log('No double click detected: Starting Turkish session.');
      await startSessionV2(true, false);
    }, 3000);
    setMiddleClickTimer(timer);
  };

  useUnmount(() => {
    setLastAvatarMessageTime(0);
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
    console.log(`🔄 SESSION STATE CHANGED: ${sessionState}`);
  }, [sessionState]);

  useEffect(() => {
    if (stream && mediaStream.current) {
      console.log('Assigning stream to video element:', mediaStream.current);
      mediaStream.current.srcObject = stream;
      mediaStream.current.onloadedmetadata = () => {
        console.log('Stream metadata loaded, playing video');
        mediaStream.current!.play();
        
        // Start audio monitoring when stream is ready and playing
        console.log("🎧 Starting audio monitoring after stream is ready");
        startMonitoring(mediaStream.current!);
        
        // 🚨 CRITICAL FIX: Force video to switch to streaming state
        console.log("🎬 FORCING video switch to streaming state - stream is ready");
        setTimeout(() => {
          window.dispatchEvent(new Event('avatar-start-talking'));
        }, 500); // Small delay to ensure video is playing
      };
    } else {
      console.log('Stream or mediaStream.current not available:', { stream: !!stream, mediaStreamRef: !!mediaStream.current });
    }
  }, [mediaStream, stream, startMonitoring]);

  // Centralized countdown function
  const startCountdownSequence = (triggerSource: string) => {
    console.log(`Starting countdown sequence from: ${triggerSource}`);
    
    // CRITICAL: Clear ALL existing timers first to prevent conflicts
    if (debounceTimerRef.current) {
      console.log(`Clearing existing debounce timer: ${debounceTimerRef.current}`);
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (countdownTimerRef.current) {
      console.log(`Clearing existing countdown timer: ${countdownTimerRef.current}`);
      clearTimeout(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    
    console.log(`✅ Starting countdown from ${triggerSource}`);
    
    // Start fresh debounce timer
    debounceTimerRef.current = setTimeout(() => {
      // Double check: ensure no recent avatar messages
      const currentTime = Date.now();
      const timeSinceLastMessage = currentTime - lastAvatarMessageTime;
      console.log(`Debounce timer fired: timeSinceLastMessage=${timeSinceLastMessage}ms`);
      console.log(`Debug: currentTime=${currentTime}, lastAvatarMessageTime=${lastAvatarMessageTime}`);
      
      // IMPROVED: Handle case where lastAvatarMessageTime is 0 or unreliable
      const isReliableTimestamp = lastAvatarMessageTime > 0 && lastAvatarMessageTime < currentTime;
      
      if (isReliableTimestamp && timeSinceLastMessage < 2000) {
        console.log("Avatar still active based on reliable timestamp, restarting debounce");
        return;
      } else if (!isReliableTimestamp) {
        console.log(`⚠️ Unreliable timestamp detected (lastAvatarMessageTime=${lastAvatarMessageTime}), proceeding with countdown`);
      }
      
      console.log("Avatar appears to be finished (3 seconds after message end). Starting countdown...");
      
      // Start the main countdown timer
      const timer = setTimeout(() => {
        console.log("5-second countdown completed - ending session and playing ending video");
        console.log(`🔍 DEBUG: isEnglish=${isEnglish}, sending language=${isEnglish ? 'en' : 'tr'}`);
        
        // First: Stop the avatar session
        stopAvatar();
        
        // Then: Immediately play ending video (don't wait for session state change)
        setTimeout(() => {
          const eventData = { language: isEnglish ? 'en' : 'tr' };
          console.log(`🎬 Dispatching session-ending event with:`, eventData);
          window.dispatchEvent(new CustomEvent('session-ending', { 
            detail: eventData
          }));
        }, 100); // Small delay to ensure session is stopped
        
        countdownTimerRef.current = null;
      }, 5000);
      
      countdownTimerRef.current = timer;
      debounceTimerRef.current = null;
      console.log("Started 5-second countdown timer. Timer ID:", timer);
    }, 3000);
    
    console.log(`Started 3-second debounce timer from ${triggerSource}. Timer ID:`, debounceTimerRef.current);
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
