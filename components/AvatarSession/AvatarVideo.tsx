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

type VideoState = 'loop' | 'intro' | 'streaming' | 'ending';

// Video control utility for centralized management
class VideoController {
  private activeVideo: HTMLVideoElement | null = null;
  private activeVideoType: VideoState | null = null;
  
  log(message: string, data?: any) {
    const timestamp = new Date().toISOString();
    console.log(`[VideoController ${timestamp}] ${message}`, data || '');
  }

  async stopAllVideos(videoRefs: {
    loop: React.RefObject<HTMLVideoElement | null>;
    intro: React.RefObject<HTMLVideoElement | null>;
    streaming: React.RefObject<HTMLVideoElement | null>;
    ending: React.RefObject<HTMLVideoElement | null>;
  }) {
    this.log('🛑 STOPPING ALL VIDEOS');
    
    const stopPromises = Object.entries(videoRefs).map(async ([type, ref]) => {
      if (ref.current && !ref.current.paused) {
        this.log(`Stopping ${type} video`);
        ref.current.pause();
        ref.current.currentTime = 0;
        return new Promise<void>(resolve => {
          if (ref.current) {
            ref.current.onpause = () => {
              this.log(`✅ ${type} video stopped`);
              resolve();
            };
          } else {
            resolve();
          }
        });
      }
    });

    await Promise.all(stopPromises);
    this.activeVideo = null;
    this.activeVideoType = null;
    this.log('✅ ALL VIDEOS STOPPED');
  }

  async stopAllVideosExcept(exceptType: VideoState, videoRefs: {
    loop: React.RefObject<HTMLVideoElement | null>;
    intro: React.RefObject<HTMLVideoElement | null>;
    streaming: React.RefObject<HTMLVideoElement | null>;
    ending: React.RefObject<HTMLVideoElement | null>;
  }) {
    this.log(`🛑 STOPPING ALL VIDEOS EXCEPT ${exceptType.toUpperCase()}`);
    
    const stopPromises = Object.entries(videoRefs)
      .filter(([type]) => type !== exceptType)
      .map(async ([type, ref]) => {
        if (ref.current && !ref.current.paused) {
          this.log(`Stopping ${type} video`);
          ref.current.pause();
          ref.current.currentTime = 0;
          return new Promise<void>(resolve => {
            if (ref.current) {
              ref.current.onpause = () => {
                this.log(`✅ ${type} video stopped`);
                resolve();
              };
            } else {
              resolve();
            }
          });
        }
      });

    await Promise.all(stopPromises);
    
    // Keep track of the active video if it exists
    if (videoRefs[exceptType].current) {
      this.activeVideo = videoRefs[exceptType].current;
    }
    this.log(`✅ ALL VIDEOS STOPPED EXCEPT ${exceptType.toUpperCase()}`);
  }

  setActiveVideoType(type: VideoState | null) {
    this.activeVideoType = type;
    this.log(`🎯 Active video type set to: ${type || 'NONE'}`);
  }

  async playVideo(
    videoRef: React.RefObject<HTMLVideoElement | null>, 
    videoType: VideoState,
    videoRefs: {
      loop: React.RefObject<HTMLVideoElement | null>;
      intro: React.RefObject<HTMLVideoElement | null>;
      streaming: React.RefObject<HTMLVideoElement | null>;
      ending: React.RefObject<HTMLVideoElement | null>;
    }
  ) {
    this.log(`🎬 ATTEMPTING TO PLAY ${videoType.toUpperCase()} VIDEO`);
    
    // First stop all other videos
    await this.stopAllVideos(videoRefs);
    
    if (!videoRef.current) {
      this.log(`❌ ${videoType} video ref not available`);
      return false;
    }

    try {
      this.log(`Starting ${videoType} video playback`);
      videoRef.current.currentTime = 0;
      
      // Special handling for ending video - ensure it's properly loaded
      if (videoType === 'ending') {
        this.log('🎭 Special ending video handling');
        // Force reload to ensure correct language source
        videoRef.current.load();
        await new Promise<void>((resolve) => {
          if (videoRef.current) {
            videoRef.current.onloadeddata = () => {
              this.log('📹 Ending video reloaded and ready');
              resolve();
            };
            // Fallback timeout
            setTimeout(resolve, 500);
          } else {
            resolve();
          }
        });
      }
      
      await videoRef.current.play();
      
      this.activeVideo = videoRef.current;
      this.activeVideoType = videoType;
      
      this.log(`✅ ${videoType.toUpperCase()} VIDEO NOW PLAYING`);
      this.logCurrentVideoStates(videoRefs);
      
      return true;
    } catch (error) {
      this.log(`❌ Failed to play ${videoType} video:`, error);
      return false;
    }
  }

  logCurrentVideoStates(videoRefs: {
    loop: React.RefObject<HTMLVideoElement | null>;
    intro: React.RefObject<HTMLVideoElement | null>;
    streaming: React.RefObject<HTMLVideoElement | null>;
    ending: React.RefObject<HTMLVideoElement | null>;
  }) {
    const states = Object.entries(videoRefs).map(([type, ref]) => ({
      type,
      exists: !!ref.current,
      paused: ref.current?.paused ?? true,
      currentTime: ref.current?.currentTime ?? 0,
      src: ref.current?.currentSrc ?? 'none'
    }));

    this.log('📊 CURRENT VIDEO STATES:', states);
    this.log(`🎯 ACTIVE VIDEO: ${this.activeVideoType || 'NONE'}`);
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
  
  // Video controller instance
  const videoController = useRef(new VideoController());
  
  console.log('AvatarVideo rendered with isEnglish:', isEnglish, 'sessionState:', sessionState, 'videoState:', videoState);
  console.log(`🔍 Language sync: isEnglish=${isEnglish}, endingLanguage=${endingLanguage}`);
  
  // Single container ref for fullscreen stability
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Video refs for all video types
  const loopVideoRef = useRef<HTMLVideoElement>(null);
  const introVideoRef = useRef<HTMLVideoElement>(null);
  const streamingVideoRef = useRef<HTMLVideoElement>(null);
  const endingVideoRef = useRef<HTMLVideoElement>(null);

  // Centralized video refs object
  const videoRefs = {
    loop: loopVideoRef,
    intro: introVideoRef,
    streaming: streamingVideoRef,
    ending: endingVideoRef
  };

  const isLoaded = sessionState === StreamingAvatarSessionState.CONNECTED;

  // Enhanced video state change handler
  const handleVideoStateChange = async (newState: VideoState, reason: string) => {
    const controller = videoController.current;
    
    controller.log(`🔄 VIDEO STATE CHANGE: ${videoState} → ${newState} (Reason: ${reason})`);
    
    // Log current state before change
    controller.logCurrentVideoStates(videoRefs);
    
    // Log opacity states before change
    controller.log('🎨 Current video opacities:', {
      loop: videoState === 'loop' ? 1 : 0,
      intro: videoState === 'intro' ? 1 : 0,
      streaming: videoState === 'streaming' ? 1 : 0,
      ending: videoState === 'ending' ? 1 : 0
    });
    
    setVideoState(newState);
    
    // Log what opacities will be after change
    controller.log('🎨 New video opacities will be:', {
      loop: newState === 'loop' ? 1 : 0,
      intro: newState === 'intro' ? 1 : 0,
      streaming: newState === 'streaming' ? 1 : 0,
      ending: newState === 'ending' ? 1 : 0
    });
    
    // Ensure microphone is muted when switching to loop state
    if (newState === 'loop') {
      controller.log('🎤 Muting microphone for loop state');
      muteInputAudio();
    }
    
    // Special handling for streaming video - don't auto-play, just stop others
    if (newState === 'streaming') {
      controller.log('🎥 Streaming mode - stopping all videos except streaming');
      await controller.stopAllVideosExcept('streaming', videoRefs);
      controller.setActiveVideoType('streaming');
      controller.log('✅ Streaming video is now active (stream controlled externally)');
    } else {
      // Give a moment for React to update, then play the appropriate video
      setTimeout(async () => {
        await controller.playVideo(videoRefs[newState], newState, videoRefs);
      }, 50); // Reduced from 100ms
    }
  };

  // Ensure loop video starts when component mounts
  useEffect(() => {
    console.log('Component mounted, starting loop video');
    if (videoState === 'loop') {
      handleVideoStateChange('loop', 'Component mount');
    }
  }, []);

  const handleIntroEnded = () => {
    const controller = videoController.current;
    controller.log('📹 Intro video ended naturally');
    
    // Best practice: If intro ends but avatar hasn't started talking yet,
    // switch to loop as a waiting/buffer state
    if (sessionState === StreamingAvatarSessionState.CONNECTED && videoState === 'intro') {
      controller.log('🔄 Intro finished but avatar not talking yet - switching to loop (waiting mode)');
      handleVideoStateChange('loop', 'Intro ended, waiting for avatar to start talking');
    } else if (sessionState === StreamingAvatarSessionState.CONNECTING) {
      controller.log('🔄 Intro finished but session still connecting - switching to loop (waiting mode)');
      handleVideoStateChange('loop', 'Intro ended, session still connecting');
    } else {
      controller.log('📹 Intro ended in unexpected state:', { sessionState, videoState });
    }
  };

  const handleEndingEnded = () => {
    console.log('Ending video finished, returning to loop state...');
    videoController.current.log('📹 Ending video finished, returning to loop');
    
    // Keep microphone muted when returning to loop - user must manually start talking
    videoController.current.log('🎤 Keeping microphone muted when returning to loop');
    muteInputAudio();
    
    setIsEndingVideoPlaying(false);
    handleVideoStateChange('loop', 'Ending video finished');
  };

  const handleLoopEnded = () => {
    // Restart the loop video seamlessly
    videoController.current.log('📹 Loop video ended, restarting seamlessly');
    if (loopVideoRef.current) {
      loopVideoRef.current.currentTime = 0;
      loopVideoRef.current.play().catch(error => {
        videoController.current.log('❌ Failed to restart loop video:', error);
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

  // Fullscreen event listener - stays consistent because container doesn't change
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Session state management - Best Practice Implementation
  useEffect(() => {
    const controller = videoController.current;
    controller.log('📋 Session state changed:', sessionState);
    
    if (sessionState === StreamingAvatarSessionState.INACTIVE) {
      // Ensure microphone is muted when session becomes inactive
      controller.log('🎤 Session INACTIVE - muting microphone');
      muteInputAudio();
      
      // Don't interrupt ending video - let it complete naturally
      if (videoState === 'ending' || isEndingVideoPlaying) {
        controller.log('🎬 Session INACTIVE but ending video playing - letting it complete');
        return; // Don't force loop when ending video is playing
      }
      
      controller.log('🔄 Session INACTIVE - returning to loop');
      setIsEndingVideoPlaying(false); // Reset ending state
      handleVideoStateChange('loop', 'Session became INACTIVE');
    } else if (sessionState === StreamingAvatarSessionState.CONNECTING) {
      // Reset ending state when starting new session
      if (isEndingVideoPlaying) {
        controller.log('🔄 New session starting - resetting ending video state');
        setIsEndingVideoPlaying(false);
      }
      controller.log('🔄 Session CONNECTING - immediately showing intro');
      // Immediately show intro as buffer/waiting video
      handleVideoStateChange('intro', 'Session CONNECTING - showing intro buffer');
    } else if (sessionState === StreamingAvatarSessionState.CONNECTED) {
      controller.log('📡 Session CONNECTED - waiting for stream or avatar to start talking');
      // Keep current video state, let stream ready or avatar talking handle the transition
      // Don't force any video changes here - let the natural flow handle it
      
      // If we were in loop state for some reason, go to intro briefly
      if (videoState === 'loop') {
        controller.log('🔄 Connected but in loop - brief intro transition');
        handleVideoStateChange('intro', 'Session CONNECTED - brief intro before stream');
      }
      // If already in intro, let it continue until stream ready or avatar talks
    }
  }, [sessionState]);

  // Reset state when language changes - Optimized
  useEffect(() => {
    const controller = videoController.current;
    controller.log('🌐 Language changed to:', isEnglish ? 'English' : 'Turkish');
    
    // Only reload videos when session is inactive to prevent disruption
    if (sessionState === StreamingAvatarSessionState.INACTIVE) {
      // Don't interrupt ending video even on language change
      if (videoState === 'ending' || isEndingVideoPlaying) {
        controller.log('🎬 Language change: Session inactive but ending video playing - letting it complete');
        return; // Don't force loop when ending video is playing
      }
      
      handleVideoStateChange('loop', 'Language change while INACTIVE');
      
      // Reload intro and ending videos for new language
      if (introVideoRef.current) {
        introVideoRef.current.load();
        controller.log('🔄 Intro video reloaded for language change (inactive)');
      }
      if (endingVideoRef.current) {
        endingVideoRef.current.load();
        controller.log('🔄 Ending video reloaded for language change (inactive)');
      }
    } else {
      // During active session, just log the change - don't disrupt
      controller.log('🔄 Language change during active session - videos will reload when appropriate');
    }
  }, [isEnglish, sessionState]);

  // Event listeners for video transitions
  useEffect(() => {
    const controller = videoController.current;
    
    const handleAvatarStartTalking = () => {
      controller.log('🗣️ Avatar started talking');
      
      // Best practice: Switch to streaming from ANY state when avatar starts talking
      const currentState = videoState;
      controller.log(`🔄 Switching from ${currentState} to streaming (avatar started talking)`);
      
      // Immediate cleanup of current video to prevent overlap
      switch (currentState) {
        case 'intro':
          if (introVideoRef.current && !introVideoRef.current.paused) {
            controller.log('🛑 Immediately stopping intro video');
            introVideoRef.current.pause();
            introVideoRef.current.currentTime = 0;
          }
          break;
        case 'loop':
          if (loopVideoRef.current && !loopVideoRef.current.paused) {
            controller.log('🛑 Immediately stopping loop video');
            loopVideoRef.current.pause();
            loopVideoRef.current.currentTime = 0;
          }
          break;
        case 'ending':
          if (endingVideoRef.current && !endingVideoRef.current.paused) {
            controller.log('🛑 Immediately stopping ending video');
            endingVideoRef.current.pause();
            endingVideoRef.current.currentTime = 0;
            setIsEndingVideoPlaying(false);
          }
          break;
        case 'streaming':
          controller.log('✅ Already in streaming state');
          return; // Already streaming, no need to switch
      }
      
      // Always transition to streaming when avatar starts talking
      handleVideoStateChange('streaming', `Avatar started talking (from ${currentState})`);
    };

    const handleSessionEnding = (event: CustomEvent) => {
      controller.log('🔚 Session ending event received:', event.detail);
      controller.log(`🔍 Current endingLanguage: ${endingLanguage}, incoming language: ${event.detail.language}`);
      controller.log(`🔍 Current isEnglish prop: ${isEnglish}`);
      
      // CRITICAL: Mute microphone when ending video starts
      controller.log('🎤 Muting microphone for ending video');
      muteInputAudio();
      
      // Allow ending video if videoState is not already ending
      if (videoState === 'ending' && isEndingVideoPlaying) {
        controller.log('⚠️ Ending video already in ending state and playing, ignoring...');
        return;
      }
      
      // Reset state and allow new ending video
      if (isEndingVideoPlaying && videoState !== 'ending') {
        controller.log('🔄 Resetting ending video state for new ending event');
        setIsEndingVideoPlaying(false);
      }
      
      controller.log('✅ Proceeding with ending video setup');
      controller.log('Setting endingLanguage to:', event.detail.language);
      setEndingLanguage(event.detail.language);
      setIsEndingVideoPlaying(true);
      
      // Log the expected video file
      controller.log(`🎬 Expected ending video file: /ending_${event.detail.language}.webm`);
      
      // First set the language and reload video
      setTimeout(() => {
        if (endingVideoRef.current) {
          controller.log('🔄 Reloading ending video for language:', event.detail.language);
          endingVideoRef.current.load();
          
          // Wait for video to load, then use centralized control
          endingVideoRef.current.onloadeddata = () => {
            controller.log('📹 Ending video loaded, switching to ending state');
            // Use the centralized video control system - this will handle opacity and play
            handleVideoStateChange('ending', `Session ending (language: ${event.detail.language})`);
          };
          
          // Fallback in case onloadeddata doesn't fire
          setTimeout(() => {
            if (!['ending'].includes(videoState)) {
              controller.log('⚠️ Fallback: forcing ending state');
              handleVideoStateChange('ending', `Session ending fallback (language: ${event.detail.language})`);
            }
          }, 200);
        } else {
          controller.log('❌ Ending video ref not available');
          setIsEndingVideoPlaying(false);
          handleVideoStateChange('loop', 'Ending video ref unavailable');
        }
      }, 50);
    };

    window.addEventListener('avatar-start-talking', handleAvatarStartTalking);
    window.addEventListener('session-ending', handleSessionEnding as EventListener);

    return () => {
      window.removeEventListener('avatar-start-talking', handleAvatarStartTalking);
      window.removeEventListener('session-ending', handleSessionEnding as EventListener);
    };
  }, [isEndingVideoPlaying, videoState]);

  // Monitoring useEffect - logs every state change
  useEffect(() => {
    const controller = videoController.current;
    controller.log('📊 COMPREHENSIVE VIDEO STATE REPORT');
    controller.log(`Current videoState: ${videoState}`);
    controller.log(`Session state: ${sessionState}`);
    controller.log(`Language: ${isEnglish ? 'English' : 'Turkish'}`);
    controller.log(`Ending video playing: ${isEndingVideoPlaying}`);
    controller.log(`Ending language: ${endingLanguage}`);
    
    // Log all video element states
    controller.logCurrentVideoStates(videoRefs);
    
    // Set a timer to check for multiple videos playing - Best Practice Monitoring
    const checkTimer = setTimeout(() => {
      const playingVideos = Object.entries(videoRefs)
        .filter(([_, ref]) => ref.current && !ref.current.paused)
        .map(([type]) => type);
      
      if (playingVideos.length > 1) {
        controller.log('🚨 MULTIPLE VIDEOS PLAYING DETECTED:', playingVideos);
        
        // Smart handling: Check if streaming video is one of the playing videos
        if (playingVideos.includes('streaming') && 
            sessionState === StreamingAvatarSessionState.CONNECTED &&
            (videoState === 'intro' || videoState === 'loop')) {
          controller.log('🎥 Stream ready detected with multiple videos - switching to streaming');
          // This is stream ready scenario - switch to streaming instead of replaying intro
          handleVideoStateChange('streaming', 'Stream ready with multiple videos');
          return;
        }
        
        // Force stop all and play only the current state
        if (videoState === 'streaming') {
          controller.stopAllVideosExcept('streaming', videoRefs).then(() => {
            controller.setActiveVideoType('streaming');
          });
        } else {
          controller.stopAllVideos(videoRefs).then(() => {
            controller.playVideo(videoRefs[videoState], videoState, videoRefs);
          });
        }
      } else if (playingVideos.length === 1) {
        const playingVideo = playingVideos[0];
        controller.log(`✅ Single video playing: ${playingVideo}`);
        
        // Check if this is actually a mismatch that needs fixing
        if (playingVideo !== videoState) {
          // Special case: Streaming video starts before avatar talks (stream ready)
          if (playingVideo === 'streaming' && 
              sessionState === StreamingAvatarSessionState.CONNECTED && 
              (videoState === 'intro' || videoState === 'loop')) {
            controller.log('🎥 Stream ready - auto-switching to streaming state');
            handleVideoStateChange('streaming', 'Stream ready before avatar talking');
            return; // Don't fix this, it's expected behavior
          }
          
          controller.log(`⚠️ Video state mismatch: playing ${playingVideo} but state is ${videoState}`);
          
          // Handle other mismatch cases - but NOT when streaming is playing correctly
          if (playingVideo === 'streaming') {
            // Streaming video is playing - this is generally correct
            // Only fix if videoState should definitely not be streaming
            if (sessionState === StreamingAvatarSessionState.INACTIVE) {
              controller.log('🔧 Fixing: stopping streaming for inactive session');
              controller.stopAllVideos(videoRefs).then(() => {
                handleVideoStateChange('loop', 'Monitoring fix: inactive session');
              });
            } else {
              // Session is active/connected and streaming video is playing - this is correct
              controller.log('✅ Streaming video playing during active session - keeping as is');
              // Just update the state to match reality
              if (videoState !== 'streaming') {
                handleVideoStateChange('streaming', 'Stream playing - syncing state');
              }
            }
          } else if (videoState === 'streaming' && playingVideo !== 'streaming') {
            controller.log('🔧 Fixing: stopping non-streaming video for streaming state');
            controller.stopAllVideosExcept('streaming', videoRefs).then(() => {
              controller.setActiveVideoType('streaming');
            });
          } else if (videoState !== 'streaming' && playingVideo !== 'streaming') {
            controller.log('🔧 Fixing: correcting video to match state');
            controller.playVideo(videoRefs[videoState], videoState, videoRefs);
          }
        }
      } else if (playingVideos.length === 0) {
        if (videoState === 'streaming') {
          controller.log('📺 Streaming video expected (controlled externally)');
          controller.setActiveVideoType('streaming');
        } else {
          controller.log(`⚠️ No videos playing, should be playing: ${videoState}`);
          
          // Best practice: ensure video plays according to session state
          if (sessionState === StreamingAvatarSessionState.CONNECTING && videoState !== 'intro') {
            controller.log('🔧 Session connecting but not showing intro - fixing');
            handleVideoStateChange('intro', 'Monitoring fix: session connecting');
          } else if (sessionState === StreamingAvatarSessionState.INACTIVE && videoState !== 'loop') {
            // Don't interrupt ending video even in monitoring
            if (videoState === 'ending' || isEndingVideoPlaying) {
              controller.log('🎬 Monitoring: Session inactive but ending video playing - letting it complete');
              return;
            }
            controller.log('🔧 Session inactive but not showing loop - fixing');
            handleVideoStateChange('loop', 'Monitoring fix: session inactive');
          } else {
            controller.playVideo(videoRefs[videoState], videoState, videoRefs);
          }
        }
      }
    }, 500);

    return () => clearTimeout(checkTimer);
  }, [videoState, sessionState, isEnglish, isEndingVideoPlaying, endingLanguage]);

  // Handle streaming video ref forwarding - Always forward to streaming video
  useEffect(() => {
    if (streamingVideoRef.current && ref) {
      if (typeof ref === 'function') {
        ref(streamingVideoRef.current);
      } else {
        ref.current = streamingVideoRef.current;
      }
      videoController.current.log('🔗 Streaming video ref forwarded');
    }
  }, [ref]);

  // Handle video stream assignment for streaming video
  useEffect(() => {
    const controller = videoController.current;
    if (videoState === 'streaming' && streamingVideoRef.current) {
      controller.log('📺 Streaming video is now active and ready for stream');
      // Note: The actual stream is assigned by the parent component via ref
      // We just need to ensure the video element is visible
    }
  }, [videoState]);

  // Sync endingLanguage with isEnglish prop changes
  useEffect(() => {
    const controller = videoController.current;
    const newLanguage = isEnglish ? 'en' : 'tr';
    if (endingLanguage !== newLanguage) {
      controller.log(`🔄 Syncing language: isEnglish=${isEnglish} -> endingLanguage=${newLanguage}`);
      setEndingLanguage(newLanguage);
    }
  }, [isEnglish, endingLanguage]);

  // Monitor endingLanguage changes and reload ending video
  useEffect(() => {
    const controller = videoController.current;
    if (endingLanguage && endingVideoRef.current) {
      controller.log('🌐 endingLanguage changed to:', endingLanguage);
      endingVideoRef.current.load();
      controller.log('🔄 Ending video reloaded for language:', endingLanguage);
    }
  }, [endingLanguage]);

  // Add video event listeners for better monitoring
  useEffect(() => {
    const controller = videoController.current;
    const videos = [
      { ref: loopVideoRef, name: 'loop' },
      { ref: introVideoRef, name: 'intro' },
      { ref: streamingVideoRef, name: 'streaming' },
      { ref: endingVideoRef, name: 'ending' }
    ];

    const listeners: Array<() => void> = [];

    videos.forEach(({ ref, name }) => {
      if (ref.current) {
        const onPlay = () => controller.log(`🎬 ${name} video PLAY event`);
        const onPause = () => controller.log(`⏸️ ${name} video PAUSE event`);
        const onEnded = () => controller.log(`🏁 ${name} video ENDED event`);
        const onError = (e: Event) => controller.log(`❌ ${name} video ERROR:`, e);

        ref.current.addEventListener('play', onPlay);
        ref.current.addEventListener('pause', onPause);
        ref.current.addEventListener('ended', onEnded);
        ref.current.addEventListener('error', onError);

        listeners.push(() => {
          if (ref.current) {
            ref.current.removeEventListener('play', onPlay);
            ref.current.removeEventListener('pause', onPause);
            ref.current.removeEventListener('ended', onEnded);
            ref.current.removeEventListener('error', onError);
          }
        });
      }
    });

    return () => {
      listeners.forEach(cleanup => cleanup());
    };
  }, []);

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
            autoPlay={false}
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
              transition: "opacity 0.3s ease-in-out",
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
              transition: "opacity 0.3s ease-in-out",
              pointerEvents: videoState === 'intro' ? 'auto' : 'none',
            }}
          >
            <source src={isEnglish ? "/intro_en.webm" : "/intro_tr.webm"} type="video/webm" />
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
              transition: "opacity 0.3s ease-in-out",
              pointerEvents: videoState === 'streaming' ? 'auto' : 'none',
            }}
          >
            <track kind="captions" />
          </video>

          {/* Ending Video */}
          <video
            ref={endingVideoRef}
            autoPlay={false}
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
              transition: "opacity 0.3s ease-in-out",
              pointerEvents: videoState === 'ending' ? 'auto' : 'none',
            }}
          >
            <source src={`/ending_${endingLanguage}.webm`} type="video/webm" />
            Your browser does not support the video tag.
          </video>
        </div>
      </div>
    </div>
  );
});

AvatarVideo.displayName = "AvatarVideo";
