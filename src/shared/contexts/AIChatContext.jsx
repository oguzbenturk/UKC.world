import { createContext, useContext, useState, useCallback } from 'react';
import { useAIAssistant } from '@/shared/hooks/useAIAssistant';

const AIChatContext = createContext(null);

export function AIChatProvider({ children }) {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const { messages, sending, send } = useAIAssistant();

  const openChat = useCallback(() => setIsChatOpen(true), []);
  const closeChat = useCallback(() => setIsChatOpen(false), []);
  const toggleChat = useCallback(() => setIsChatOpen((v) => !v), []);

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
