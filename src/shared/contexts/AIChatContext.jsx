import { createContext, useContext, useState, useCallback, useRef } from 'react';
import { useAIAssistant } from '@/shared/hooks/useAIAssistant';

const AIChatContext = createContext(null);

export function AIChatProvider({ children }) {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const { messages, sending, send, greet } = useAIAssistant();
  const hasGreeted = useRef(false);

  const openChat = useCallback(() => {
    setIsChatOpen(true);
    if (!hasGreeted.current) {
      hasGreeted.current = true;
      greet();
    }
  }, [greet]);

  const closeChat = useCallback(() => setIsChatOpen(false), []);
  const toggleChat = useCallback(() => {
    setIsChatOpen((v) => {
      if (!v && !hasGreeted.current) {
        hasGreeted.current = true;
        greet();
      }
      return !v;
    });
  }, [greet]);

  return (
    <AIChatContext.Provider value={{ isChatOpen, openChat, closeChat, toggleChat, messages, sending, send }}>
      {children}
    </AIChatContext.Provider>
  );
}

export function useAIChat() {
  const ctx = useContext(AIChatContext);
  if (!ctx) throw new Error('useAIChat must be used within AIChatProvider');
  return ctx;
}
