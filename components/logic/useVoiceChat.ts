import { useCallback } from "react";

import { useStreamingAvatarContext } from "./context";

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
    console.log('🎤 muteInputAudio called');
    console.log('🎤 avatarRef.current exists:', !!avatarRef.current);
    
    if (!avatarRef.current) {
      console.log('❌ avatarRef.current is null - cannot mute');
      return;
    }
    
    console.log('🎤 Calling avatarRef.current.muteInputAudio()');
    avatarRef.current?.muteInputAudio();
    setIsMuted(true);
    console.log('🎤 setIsMuted(true) completed, new isMuted state should be true');
  }, [avatarRef, setIsMuted]);

  const unmuteInputAudio = useCallback(() => {
    console.log('🎤 unmuteInputAudio called');
    console.log('🎤 avatarRef.current exists:', !!avatarRef.current);
    
    if (!avatarRef.current) {
      console.log('❌ avatarRef.current is null - cannot unmute');
      return;
    }
    
    console.log('🎤 Calling avatarRef.current.unmuteInputAudio()');
    avatarRef.current?.unmuteInputAudio();
    setIsMuted(false);
    console.log('🎤 setIsMuted(false) completed, new isMuted state should be false');
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
