import { useContext } from 'react';
import { ChatWidgetContext } from '../context/chatWidgetContextInstance.js';

/**
 * Access the app-wide floating chat widget controller.
 * Must be used inside <ChatWidgetProvider>.
 */
export function useChatWidget() {
  const ctx = useContext(ChatWidgetContext);
  if (!ctx) {
    throw new Error('useChatWidget must be used within a ChatWidgetProvider');
  }
  return ctx;
}

export default useChatWidget;
