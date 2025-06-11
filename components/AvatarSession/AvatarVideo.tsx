import React, { forwardRef, useState, useEffect, useRef } from "react";
import { ConnectionQuality } from "@heygen/streaming-avatar";

import { useConnectionQuality } from "../logic/useConnectionQuality";
import { useStreamingAvatarSession } from "../logic/useStreamingAvatarSession";
import { StreamingAvatarSessionState } from "../logic";
import { useVoiceChat } from "../logic/useVoiceChat";
import { CloseIcon } from "../Icons";
import { Button } from "../Button";

interface AvatarVideoProps {
  isEnglish?: boolean;
}

type VideoState = 'loop' | 'intro' | 'streaming' | 'ending' | 'error';

// Video control utility for centralized management
class VideoController {
  private activeVideo: HTMLVideoElement | null = null;
  private activeVideoType: VideoState | null = null;
  private debugMode: boolean = process.env.NODE_ENV === 'development';
  
  log(message: string, data?: any) {
    if (!this.debugMode) return;
    const timestamp = new Date().toLocaleTimeString();
    if (data) {
      console.log(`[VideoController ${timestamp}] ${message}`, data);
    } else {
      console.log(`[VideoController ${timestamp}] ${message}`);
    }
  }

  async stopAllVideos(videoRefs: {
    loop: React.RefObject<HTMLVideoElement | null>;
    intro: React.RefObject<HTMLVideoElement | null>;
    streaming: React.RefObject<HTMLVideoElement | null>;
    ending: React.RefObject<HTMLVideoElement | null>;
    error: React.RefObject<HTMLVideoElement | null>;
  }) {
    this.log('🛑 Stopping all videos');
    
    const stopPromises = Object.entries(videoRefs).map(async ([type, ref]) => {
      if (ref.current && !ref.current.paused) {
        ref.current.pause();
        ref.current.currentTime = 0;
      }
    });

    await Promise.all(stopPromises);
    this.activeVideo = null;
    this.activeVideoType = null;
  }

  async stopAllVideosExcept(exceptType: VideoState, videoRefs: {
    loop: React.RefObject<HTMLVideoElement | null>;
    intro: React.RefObject<HTMLVideoElement | null>;
    streaming: React.RefObject<HTMLVideoElement | null>;
    ending: React.RefObject<HTMLVideoElement | null>;
    error: React.RefObject<HTMLVideoElement | null>;
  }) {
    this.log(`🛑 Stopping all videos except ${exceptType}`);
    
    const stopPromises = Object.entries(videoRefs)
      .filter(([type]) => type !== exceptType)
      .map(async ([type, ref]) => {
        if (ref.current && !ref.current.paused) {
          ref.current.pause();
          ref.current.currentTime = 0;
        }
      });

    await Promise.all(stopPromises);
    
    if (videoRefs[exceptType].current) {
      this.activeVideo = videoRefs[exceptType].current;
    }
  }

  setActiveVideoType(type: VideoState | null) {
    this.activeVideoType = type;
    this.log(`🎯 Active video: ${type || 'NONE'}`);
  }

  async playVideo(
    videoRef: React.RefObject<HTMLVideoElement | null>, 
    videoType: VideoState,
    videoRefs: {
      loop: React.RefObject<HTMLVideoElement | null>;
      intro: React.RefObject<HTMLVideoElement | null>;
      streaming: React.RefObject<HTMLVideoElement | null>;
      ending: React.RefObject<HTMLVideoElement | null>;
      error: React.RefObject<HTMLVideoElement | null>;
    }
  ) {
    this.log(`🎬 Playing ${videoType} video`);
    
    await this.stopAllVideos(videoRefs);
    
    if (!videoRef.current) {
      this.log(`❌ ${videoType} video ref not available`);
      return false;
    }

    try {
      videoRef.current.currentTime = 0;
      
      if (videoType === 'ending') {
        videoRef.current.load();
        await new Promise<void>((resolve) => {
          if (videoRef.current) {
            videoRef.current.onloadeddata = () => resolve();
            setTimeout(resolve, 500);
          } else {
            resolve();
          }
        });
      }
      
      await videoRef.current.play();
      
      this.activeVideo = videoRef.current;
      this.activeVideoType = videoType;
      
      this.log(`✅ ${videoType} video playing`);
      return true;
    } catch (error) {
      this.log(`❌ Failed to play ${videoType} video:`, error);
      return false;
    }
  }

  getCurrentActiveVideo() {
    return {
      video: this.activeVideo,
      type: this.activeVideoType
    };
  }
}

export const AvatarVideo = forwardRef<HTMLVideoElement, AvatarVideoProps>(({ isEnglish = false }, ref) => {
  const { sessionState, stopAvatar } = useStreamingAvatarSession();
  const { connectionQuality } = useConnectionQuality();
  const { muteInputAudio } = useVoiceChat();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [videoState, setVideoState] = useState<VideoState>('loop');
  const [endingLanguage, setEndingLanguage] = useState<string>(isEnglish ? 'en' : 'tr');
  const [isEndingVideoPlaying, setIsEndingVideoPlaying] = useState(false);
  const [errorLanguage, setErrorLanguage] = useState<string>(isEnglish ? 'en' : 'tr');
  const [isErrorVideoPlaying, setIsErrorVideoPlaying] = useState(false);
  const [introLanguage, setIntroLanguage] = useState<string>(isEnglish ? 'en' : 'tr');
  
  // Video controller instance
  const videoController = useRef(new VideoController());
  
  // Single container ref for fullscreen stability
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Video refs for all video types
  const loopVideoRef = useRef<HTMLVideoElement>(null);
  const introVideoRef = useRef<HTMLVideoElement>(null);
  const streamingVideoRef = useRef<HTMLVideoElement>(null);
  const endingVideoRef = useRef<HTMLVideoElement>(null);
  const errorVideoRef = useRef<HTMLVideoElement>(null);

  // Centralized video refs object
  const videoRefs = {
    loop: loopVideoRef,
    intro: introVideoRef,
    streaming: streamingVideoRef,
    ending: endingVideoRef,
    error: errorVideoRef
  };

  const isLoaded = sessionState === StreamingAvatarSessionState.CONNECTED;

  // Enhanced video state change handler
  const handleVideoStateChange = async (newState: VideoState, reason: string) => {
    const controller = videoController.current;
    
    if (newState === videoState) return; // Prevent unnecessary state changes
    
    controller.log(`🔄 ${videoState} → ${newState} (${reason})`);
    
    setVideoState(newState);
    
    // Note: Microphone control is now handled in InteractiveAvatar.tsx
    
    // Special handling for streaming video - don't auto-play, just stop others
    if (newState === 'streaming') {
      await controller.stopAllVideosExcept('streaming', videoRefs);
      controller.setActiveVideoType('streaming');
    } else {
      // Give a moment for React to update, then play the appropriate video
      setTimeout(async () => {
        await controller.playVideo(videoRefs[newState], newState, videoRefs);
      }, 50);
    }
  };

  const handleIntroEnded = () => {
    const controller = videoController.current;
    controller.log('📹 Intro ended');
    
    if (sessionState === StreamingAvatarSessionState.CONNECTED && videoState === 'intro') {
      handleVideoStateChange('loop', 'Intro ended, waiting for avatar');
    } else if (sessionState === StreamingAvatarSessionState.CONNECTING) {
      handleVideoStateChange('loop', 'Intro ended, session connecting');
    }
  };

  const handleEndingEnded = () => {
    videoController.current.log('📹 Ending video finished');
    setIsEndingVideoPlaying(false);
    handleVideoStateChange('loop', 'Ending video finished');
  };

  const handleErrorEnded = () => {
    videoController.current.log('📹 Error video finished');
    setIsErrorVideoPlaying(false);
    handleVideoStateChange('loop', 'Error video finished');
  };

  const handleLoopEnded = () => {
    // Restart the loop video seamlessly
    if (loopVideoRef.current) {
      loopVideoRef.current.currentTime = 0;
      loopVideoRef.current.play().catch(() => {
        // Silently handle play errors
      });
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;

    if (!isFullscreen) {
      if (containerRef.current.requestFullscreen) {
        containerRef.current.requestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  // Fullscreen event listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Initial video setup
  useEffect(() => {
    const controller = videoController.current;
    controller.log('🚀 Component mounted, initializing videos');
    
    // Immediately start loop video when component mounts
    setTimeout(async () => {
      if (videoState === 'loop' && sessionState === StreamingAvatarSessionState.INACTIVE) {
        controller.log('🎬 Starting loop video on mount');
        await controller.playVideo(loopVideoRef, 'loop', videoRefs);
      }
    }, 100);
  }, []); // Only run on mount

  // Session state management
  useEffect(() => {
    const controller = videoController.current;
    controller.log(`📋 Session: ${sessionState}`);
    
    if (sessionState === StreamingAvatarSessionState.INACTIVE) {
      if (videoState !== 'ending' && !isEndingVideoPlaying) {
        setIsEndingVideoPlaying(false);
        handleVideoStateChange('loop', 'Session inactive');
      }
    } else if (sessionState === StreamingAvatarSessionState.CONNECTING) {
      if (isEndingVideoPlaying) {
        setIsEndingVideoPlaying(false);
      }
      // Note: Intro video is now triggered immediately by session-starting event
      // No need to trigger intro here since it's already playing from session start
      controller.log('📋 Session connecting - intro should already be playing from session-starting event');
    } else if (sessionState === StreamingAvatarSessionState.CONNECTED) {
      // 🚨 EMERGENCY FIX: Force switch to streaming when connected
      console.log(`🚨 EMERGENCY: Session connected, current video state: ${videoState}`);
      if (videoState !== 'streaming') {
        console.log("🚨 FORCING switch to streaming video - session is connected");
        handleVideoStateChange('streaming', 'Emergency: Force streaming on connected');
      }
    }
  }, [sessionState]);

  // Language change handling
  useEffect(() => {
    const controller = videoController.current;
    const newLanguage = isEnglish ? 'en' : 'tr';
    
    if (endingLanguage !== newLanguage) {
      controller.log(`🌐 Language: ${newLanguage}`);
      setEndingLanguage(newLanguage);
      
      // Only reload videos when session is inactive
      if (sessionState === StreamingAvatarSessionState.INACTIVE && videoState !== 'ending') {
        handleVideoStateChange('loop', 'Language change');
        
        // Reload intro and ending videos for new language
        setTimeout(() => {
          if (introVideoRef.current) {
            introVideoRef.current.load();
          }
          if (endingVideoRef.current) {
            endingVideoRef.current.load();
          }
        }, 100);
      }
    }
  }, [isEnglish, sessionState, endingLanguage, videoState]);

  // Event listeners for video transitions
  useEffect(() => {
    const controller = videoController.current;
    
    const handleSessionStarting = (event: CustomEvent) => {
      controller.log(`🎬 Session starting: ${event.detail.language}`);
      
      // Immediately play intro video when session starts
      setIntroLanguage(event.detail.language);
      setEndingLanguage(event.detail.language);
      setErrorLanguage(event.detail.language);
      
      // Reload intro video with new language
      setTimeout(() => {
        if (introVideoRef.current) {
          introVideoRef.current.load();
        }
      }, 50);
      
      handleVideoStateChange('intro', 'Session starting - immediate intro');
    };
    
    const handleAvatarStartTalking = () => {
      controller.log('🗣️ Avatar started talking');
      
      // Immediate cleanup of current video to prevent overlap
      if (videoState !== 'streaming') {
        const currentRef = videoRefs[videoState];
        if (currentRef.current && !currentRef.current.paused) {
          currentRef.current.pause();
          currentRef.current.currentTime = 0;
        }
        
        if (videoState === 'ending') {
          setIsEndingVideoPlaying(false);
        }
        
        handleVideoStateChange('streaming', 'Avatar started talking');
      }
    };

    const handleSessionEnding = (event: CustomEvent) => {
      controller.log(`🔚 Session ending: ${event.detail.language}`);
      
      if (videoState === 'ending' && isEndingVideoPlaying) {
        return; // Already handling ending
      }
      
      if (isEndingVideoPlaying && videoState !== 'ending') {
        setIsEndingVideoPlaying(false);
      }
      
      setEndingLanguage(event.detail.language);
      setIsEndingVideoPlaying(true);
      
      setTimeout(() => {
        if (endingVideoRef.current) {
          endingVideoRef.current.load();
          
          endingVideoRef.current.onloadeddata = () => {
            handleVideoStateChange('ending', `Session ending (${event.detail.language})`);
          };
          
          // Fallback
          setTimeout(() => {
            if (videoState !== 'ending') {
              handleVideoStateChange('ending', `Session ending fallback (${event.detail.language})`);
            }
          }, 200);
        } else {
          setIsEndingVideoPlaying(false);
          handleVideoStateChange('loop', 'Ending video unavailable');
        }
      }, 50);
    };

    const handleSessionError = (event: CustomEvent) => {
      controller.log(`🚨 Session error: ${event.detail.language} - ${event.detail.error}`);
      
      if (videoState === 'error' && isErrorVideoPlaying) {
        return; // Already handling error
      }
      
      // Stop any ongoing video processes
      if (isEndingVideoPlaying && videoState !== 'error') {
        setIsEndingVideoPlaying(false);
      }
      
      setErrorLanguage(event.detail.language);
      setIsErrorVideoPlaying(true);
      
      setTimeout(() => {
        if (errorVideoRef.current) {
          errorVideoRef.current.load();
          
          errorVideoRef.current.onloadeddata = () => {
            handleVideoStateChange('error', `Session error (${event.detail.language})`);
          };
          
          // Fallback
          setTimeout(() => {
            if (videoState !== 'error') {
              handleVideoStateChange('error', `Session error fallback (${event.detail.language})`);
            }
          }, 200);
        } else {
          setIsErrorVideoPlaying(false);
          handleVideoStateChange('loop', 'Error video unavailable');
        }
      }, 50);
    };

    window.addEventListener('session-starting', handleSessionStarting as EventListener);
    window.addEventListener('avatar-start-talking', handleAvatarStartTalking);
    window.addEventListener('session-ending', handleSessionEnding as EventListener);
    window.addEventListener('session-error', handleSessionError as EventListener);

    return () => {
      window.removeEventListener('session-starting', handleSessionStarting as EventListener);
      window.removeEventListener('avatar-start-talking', handleAvatarStartTalking);
      window.removeEventListener('session-ending', handleSessionEnding as EventListener);
      window.removeEventListener('session-error', handleSessionError as EventListener);
    };
  }, [videoState, isEndingVideoPlaying, isErrorVideoPlaying]);

  // Handle streaming video ref forwarding
  useEffect(() => {
    if (streamingVideoRef.current && ref) {
      if (typeof ref === 'function') {
        ref(streamingVideoRef.current);
      } else {
        ref.current = streamingVideoRef.current;
      }
    }
  }, [ref]);

  return (
    <div className="relative w-full h-full">
      <div 
        ref={containerRef} 
        className="relative w-full h-full bg-black" 
        style={{ aspectRatio: "16/9", maxWidth: "100%", maxHeight: "100%" }}
      >
        {connectionQuality !== ConnectionQuality.UNKNOWN && (
          <div className="absolute top-3 left-3 bg-black text-white rounded-lg px-3 py-2 z-20">
            Connection Quality: {connectionQuality}
          </div>
        )}
        
        <div className="absolute top-3 right-3 flex gap-2 z-20">
          {isLoaded && (
            <Button
              className="!p-2 bg-zinc-700 bg-opacity-50"
              onClick={stopAvatar}
            >
              <CloseIcon />
            </Button>
          )}
          <Button
            className="!p-2 bg-zinc-700 bg-opacity-50"
            onClick={toggleFullscreen}
          >
            {isFullscreen ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
              </svg>
            )}
          </Button>
        </div>

        {/* Unified video container - All videos exist in DOM simultaneously */}
        <div className="relative w-full h-full">
          {/* Loop Video */}
          <video
            ref={loopVideoRef}
            autoPlay={true}
            loop
            muted
            playsInline
            onEnded={handleLoopEnded}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
              position: "absolute",
              top: 0,
              left: 0,
              opacity: videoState === 'loop' ? 1 : 0,
              pointerEvents: videoState === 'loop' ? 'auto' : 'none',
            }}
          >
            <source src="/loop.webm" type="video/webm" />
            Your browser does not support the video tag.
          </video>

          {/* Intro Video */}
            <video
              ref={introVideoRef}
              autoPlay={false}
              muted={false}
              playsInline
              onEnded={handleIntroEnded}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
                position: "absolute",
                top: 0,
                left: 0,
              opacity: videoState === 'intro' ? 1 : 0,
              pointerEvents: videoState === 'intro' ? 'auto' : 'none',
              }}
            >
              <source src={`/intro_${introLanguage}.webm`} type="video/webm" />
              Your browser does not support the video tag.
            </video>

          {/* Streaming Video (Avatar Stream) */}
          <video
            ref={streamingVideoRef}
            autoPlay
            playsInline
            muted={false}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
              position: "absolute",
              top: 0,
              left: 0,
              opacity: videoState === 'streaming' ? 1 : 0,
              pointerEvents: videoState === 'streaming' ? 'auto' : 'none',
            }}
          >
            <track kind="captions" />
          </video>

          {/* Ending Video */}
          <video
            ref={endingVideoRef}
            autoPlay={false}
            muted={false}
            playsInline
            loop={false}
            onEnded={handleEndingEnded}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
              position: "absolute",
              top: 0,
              left: 0,
              opacity: videoState === 'ending' ? 1 : 0,
              pointerEvents: videoState === 'ending' ? 'auto' : 'none',
            }}
          >
            <source src={`/ending_${endingLanguage}.webm`} type="video/webm" />
            Your browser does not support the video tag.
          </video>

          {/* Error Video */}
          <video
            ref={errorVideoRef}
            autoPlay={false}
            muted={false}
            playsInline
            loop={false}
            onEnded={handleErrorEnded}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
              position: "absolute",
              top: 0,
              left: 0,
              opacity: videoState === 'error' ? 1 : 0,
              pointerEvents: videoState === 'error' ? 'auto' : 'none',
            }}
          >
            <source src={`/error_${errorLanguage}.webm`} type="video/webm" />
            Your browser does not support the video tag.
          </video>
        </div>
      </div>
    </div>
  );
});

AvatarVideo.displayName = "AvatarVideo";
