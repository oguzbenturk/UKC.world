import { createContext, useContext, useState, useCallback, useRef } from 'react';
import { useAIAssistant } from '@/shared/hooks/useAIAssistant';

const AIChatContext = createContext(null);

export function AIChatProvider({ children }) {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const { messages, sending, send, greet, loadSession, sessionLoaded, loadingSession } = useAIAssistant();
  const hasInitialized = useRef(false);

  const initChat = useCallback(async () => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;
    await loadSession();
    // Only greet if no previous messages were restored
    greet();
  }, [loadSession, greet]);

  const openChat = useCallback(() => {
    setIsChatOpen(true);
    initChat();
  }, [initChat]);

  const closeChat = useCallback(() => setIsChatOpen(false), []);

  const toggleChat = useCallback(() => {
    setIsChatOpen((v) => {
      if (!v) initChat();
      return !v;
    });
  }, [initChat]);

  return (
    <AIChatContext.Provider value={{
      isChatOpen, openChat, closeChat, toggleChat,
      messages, sending, send,
      sessionLoaded, loadingSession,
    }}>
      {children}
    </AIChatContext.Provider>
  );
}

export function useAIChat() {
  const ctx = useContext(AIChatContext);
  if (!ctx) throw new Error('useAIChat must be used within AIChatProvider');
  return ctx;
}
