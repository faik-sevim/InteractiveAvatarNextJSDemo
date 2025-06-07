import React, { useEffect, useState, useRef } from "react";
import { Button } from "../Button";

interface AvatarConfigProps {
  onConfigChange: (config: any) => void;
  isEnglish?: boolean;
}

export const AvatarConfig: React.FC<AvatarConfigProps> = ({ onConfigChange, isEnglish = false }) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Only load config when isEnglish changes
    const configData = {
      knowledgeId: isEnglish 
        ? process.env.NEXT_PUBLIC_EN_KNOWLEDGE_BASE_ID 
        : process.env.NEXT_PUBLIC_TR_KNOWLEDGE_BASE_ID,
      avatarName: process.env.NEXT_PUBLIC_AVATAR_ID,
      language: isEnglish 
        ? process.env.NEXT_PUBLIC_EN_LANGUAGE 
        : process.env.NEXT_PUBLIC_TR_LANGUAGE,
      quality: process.env.NEXT_PUBLIC_AVATAR_QUALITY,
      voiceChatTransport: process.env.NEXT_PUBLIC_VOICE_CHAT_TRANSPORT,
      sttSettings: {
        provider: process.env.NEXT_PUBLIC_STT_PROVIDER,
      },
    };

    console.log('AvatarConfig - Loading configuration for:', isEnglish ? 'English' : 'Turkish', {
      knowledgeId: configData.knowledgeId,
      language: configData.language,
      avatarName: configData.avatarName,
      quality: configData.quality,
      voiceChatTransport: configData.voiceChatTransport,
      sttSettings: configData.sttSettings
    });

    onConfigChange(configData);
  }, [onConfigChange, isEnglish]);

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
    setIsFullscreen(!isFullscreen);
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="relative w-full h-full bg-black" style={{ aspectRatio: "16/9", maxWidth: "100%", maxHeight: "100%" }}>
        <div className="absolute top-3 right-3 z-20">
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
        <video
          autoPlay
          loop
          muted
          playsInline
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            position: "absolute",
            top: 0,
            left: 0,
          }}
        >
          <source src="/loop.webm" type="video/webm" />
          Your browser does not support the video tag.
        </video>
      </div>
    </div>
  );
};
