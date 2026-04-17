import { useState, useRef } from 'react';
import apiClient from '@/shared/services/apiClient';
import { useAuth } from './useAuth';

const SESSION_KEY = 'kai_session_id';

const GREETINGS = {
  admin:            (name) => `Hey ${name || 'there'} — what do you need? I can pull bookings, check financials, or look up a customer.`,
  manager:          (name) => `Hi ${name || 'there'} — ready to help. Bookings, schedules, or customer data?`,
  instructor:       (name) => `Hey ${name || 'Coach'} — want to see your schedule or add a student note?`,
  student:          (name) => `Hey ${name || 'there'}! Ready to book your next session or check your package?`,
  trusted_customer: (name) => `Hey ${name || 'there'} — how can I help with your bookings today?`,
};

function getOrCreateSessionId() {
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

export function useAIAssistant() {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [sending, setSending] = useState(false);
  const sessionIdRef = useRef(getOrCreateSessionId());

  const greet = () => {
    const role = user?.role?.toLowerCase() || 'outsider';
    const greeting =
      GREETINGS[role]?.(user?.name) ??
      "Hi! I'm Kai, your Plannivo assistant. How can I help you today?";
    setMessages([{ role: 'assistant', content: greeting, timestamp: Date.now() }]);
  };

  const clearMessages = (newSession = false) => {
    setMessages([]);
    if (newSession) {
      const id = crypto.randomUUID();
      localStorage.setItem(SESSION_KEY, id);
      sessionIdRef.current = id;
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
        userName: user?.name || user?.email || null,
        sessionId: sessionIdRef.current,
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

  return { messages, sending, send, greet, clearMessages };
}
