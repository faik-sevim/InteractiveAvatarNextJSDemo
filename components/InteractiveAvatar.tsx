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
      throw new Error(`Failed to list sessions: ${response.statusText}`);
    }

    const data = await response.json();
    console.log("Active sessions:", data);
    return data.sessions || [];
  } catch (error) {
    console.error("Error listing active sessions:", error);
    return [];
  }
}

async function closeSession(token: string, sessionId: string) {
  try {
    const response = await fetch("/api/close-session", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
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

async function closeAllActiveSessions(token: string) {
  try {
    const sessions = await listActiveSessions();
    console.log(`Found ${sessions.length} active sessions`);

    for (const session of sessions) {
      console.log(`Closing session ${session.session_id} (status: ${session.status})`);
      await closeSession(token, session.session_id);
    }

    console.log("All active sessions closed");
  } catch (error) {
    console.error("Error closing all active sessions:", error);
    throw error;
  }
}

function InteractiveAvatar() {
  const { initAvatar, startAvatar, stopAvatar, sessionState, stream } =
    useStreamingAvatarSession();
  const { startVoiceChat, muteInputAudio, unmuteInputAudio } = useVoiceChat();

  const [config, setConfig] = useState<StartAvatarRequest>(DEFAULT_CONFIG);
  const [isEnglish, setIsEnglish] = useState(false);
  const [lastAvatarMessageTime, setLastAvatarMessageTime] = useState<number>(0);
  const [isAvatarCurrentlyTalking, setIsAvatarCurrentlyTalking] = useState(false);

  const mediaStream = useRef<HTMLVideoElement>(null);
  const [lastClickTime, setLastClickTime] = useState<number>(0);
  const [middleClickTimer, setMiddleClickTimer] = useState<NodeJS.Timeout | null>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  async function fetchAccessToken() {
    try {
      const response = await fetch("/api/get-access-token", {
        method: "POST",
      });
      const token = await response.text();

      console.log("Access Token:", token); // Log the token to verify

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
      await closeAllActiveSessions(newToken);
      
      const avatar = initAvatar(newToken);

      avatar.on(StreamingEvents.AVATAR_START_TALKING, (e) => {
        console.log("Avatar started talking", e);
        setIsAvatarCurrentlyTalking(true);
        
        // Immediately mute microphone when avatar starts talking
        console.log("🎤 Muting microphone - avatar started talking");
        muteInputAudio();
        
        // Clear both debounce and countdown timers if avatar starts talking
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
        
        // CRITICAL: Clear any existing timers when avatar is actively talking
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
          console.log("✅ Timers cleared - avatar is actively talking");
        }
      });
      
      avatar.on(StreamingEvents.AVATAR_END_MESSAGE, (event) => {
        console.log(">>>>> Avatar end message:", event);
        setIsAvatarCurrentlyTalking(false);
        
        // DON'T unmute microphone here - let user manually start talking
        console.log("🎤 Avatar ended message - keeping microphone muted until user starts talking");
        
        console.log("Avatar finished complete response - starting countdown logic");
        
        // Start countdown immediately for AVATAR_END_MESSAGE
        startCountdownSequence("AVATAR_END_MESSAGE");
      });
      
      avatar.on(StreamingEvents.AVATAR_STOP_TALKING, (event) => {
        console.log(">>>>> Avatar stopped talking:", event);
        setIsAvatarCurrentlyTalking(false);
        
        // DON'T unmute microphone here - let user manually start talking
        console.log("🎤 Avatar stopped talking - keeping microphone muted until user starts talking");
        
        // Only use this as fallback - check if there was recent message activity
        const timeSinceLastMessage = Date.now() - lastAvatarMessageTime;
        if (timeSinceLastMessage > 500) { // Avatar was actually sending messages recently
          console.log("Using AVATAR_STOP_TALKING as fallback trigger for countdown");
          startCountdownSequence("AVATAR_STOP_TALKING fallback");
        } else {
          console.log("Ignoring AVATAR_STOP_TALKING - no recent message activity");
        }
      });
      
      avatar.on(StreamingEvents.STREAM_DISCONNECTED, () => {
        console.log("Stream disconnected");
        setLastAvatarMessageTime(0);
        setIsAvatarCurrentlyTalking(false);
        
        // Clear all timers on disconnect
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
          debounceTimerRef.current = null;
        }
        if (countdownTimerRef.current) {
          clearTimeout(countdownTimerRef.current);
          countdownTimerRef.current = null;
        }
        // Note: No need to clear unmute timer since we removed unmute timers
        console.log("Stream disconnected - all timers cleared");
      });
      avatar.on(StreamingEvents.STREAM_READY, (event) => {
        console.log(">>>>> Stream ready:", event.detail);
      });
      avatar.on(StreamingEvents.USER_START, (event) => {
        console.log(">>>>> User started talking:", event);
        
        // This is the ONLY place where we unmute the microphone automatically
        console.log("🎤 User started talking - unmuting microphone");
        unmuteInputAudio();
        
        // Clear both timers if user starts talking
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
      }
    } catch (error) {
      console.error("Error starting avatar session:", error);
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
    stopAvatar();
  });

  useEffect(() => {
    if (stream && mediaStream.current) {
      console.log('Assigning stream to video element:', mediaStream.current);
      mediaStream.current.srcObject = stream;
      mediaStream.current.onloadedmetadata = () => {
        console.log('Stream metadata loaded, playing video');
        mediaStream.current!.play();
      };
    } else {
      console.log('Stream or mediaStream.current not available:', { stream: !!stream, mediaStreamRef: !!mediaStream.current });
    }
  }, [mediaStream, stream]);

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
    
    // Start fresh debounce timer
    debounceTimerRef.current = setTimeout(() => {
      // Double check: ensure no recent avatar messages
      const timeSinceLastMessage = Date.now() - lastAvatarMessageTime;
      console.log(`Debounce timer fired: timeSinceLastMessage=${timeSinceLastMessage}ms`);
      
      if (timeSinceLastMessage < 2000) {
        console.log("Avatar still active, restarting debounce");
        return;
      }
      
      console.log("Avatar appears to be finished (3 seconds after message end). Starting countdown...");
      
      // Start the main countdown timer
      const timer = setTimeout(() => {
        console.log("10-second countdown completed - ending session and playing ending video");
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
      }, 10000);
      
      countdownTimerRef.current = timer;
      debounceTimerRef.current = null;
      console.log("Started 10-second countdown timer. Timer ID:", timer);
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
                Start Voice Chat
              </Button>
              <Button onClick={() => startSessionV2(true, true)}>
                Start Voice Chat -en
              </Button>
              <Button onClick={() => startSessionV2(false)}>
                Start Text Chat
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
