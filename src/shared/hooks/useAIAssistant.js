import { useState } from 'react';
import apiClient from '@/shared/services/apiClient';

const WELCOME_MESSAGE = {
  role: 'assistant',
  content: "Hey! I'm here to help. Ask me anything about lessons, bookings, rentals, or how to use the platform.",
  timestamp: Date.now(),
};

export const STARTER_PROMPTS = [
  'How do I book a kite lesson?',
  'Where can I check my wallet balance?',
  'What rental equipment is available?',
  'How do I contact support?',
  'Tell me about accommodation options',
  'How do group bookings work?',
];

export function useAIAssistant() {
  const [messages, setMessages] = useState([WELCOME_MESSAGE]);
  const [sending, setSending] = useState(false);

  const send = async (text) => {
    if (!text?.trim() || sending) return;
    const userMsg = { role: 'user', content: text.trim(), timestamp: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    setSending(true);
    try {
      const { data } = await apiClient.post('/assistant', {
        message: text.trim(),
        conversationHistory: messages,
      });
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: data.response, timestamp: Date.now() },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: "Sorry, I couldn't process your request right now. Please try again or contact support via WhatsApp at **+90 507 138 91 96**.",
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  return { messages, sending, send };
}
