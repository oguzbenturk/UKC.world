import { useState } from 'react';
import apiClient from '@/shared/services/apiClient';
import { useAuth } from './useAuth';

export function useAIAssistant() {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [sending, setSending] = useState(false);

  const greet = () => {
    setMessages([{
      role: 'assistant',
      content: "Hi! I'm Kai, your UKC assistant. How can I help you today?",
      timestamp: Date.now(),
    }]);
  };

  const send = async (text, imageBase64 = null) => {
    if ((!text?.trim() && !imageBase64) || sending) return;
    const userMsg = { role: 'user', content: text?.trim() || '', image: imageBase64 || null, timestamp: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    setSending(true);
    try {
      const payload = {
        message: text?.trim() || 'Analyze this image',
        conversationHistory: messages,
        userName: user?.name || user?.email || null,
      };
      if (imageBase64) payload.image = imageBase64;
      const { data } = await apiClient.post('/assistant', payload);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: data.response, timestamp: Date.now() },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: "Sorry, I couldn't reach the support system. Try WhatsApp at **+90 507 138 91 96**.",
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  return { messages, sending, send, greet };
}
