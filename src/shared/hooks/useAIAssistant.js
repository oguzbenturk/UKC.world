import { useState } from 'react';
import apiClient from '@/shared/services/apiClient';

export function useAIAssistant() {
  const [messages, setMessages] = useState([]);
  const [sending, setSending] = useState(false);

  const greet = async () => {
    setSending(true);
    try {
      const { data } = await apiClient.post('/assistant', {
        message: 'hello',
        conversationHistory: [],
      });
      setMessages([{ role: 'assistant', content: data.response, timestamp: Date.now() }]);
    } catch {
      // silent fail — chat stays empty
    } finally {
      setSending(false);
    }
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
