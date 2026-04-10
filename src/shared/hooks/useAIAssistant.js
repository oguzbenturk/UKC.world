import { useState, useCallback, useRef } from 'react';
import apiClient from '@/shared/services/apiClient';
import { useAuth } from './useAuth';

const CACHE_KEY = 'kai_session_cache';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

function readCache(userId) {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (cached.userId !== userId) return null;
    if (Date.now() - cached.cachedAt > CACHE_TTL) return null;
    return cached.messages || [];
  } catch {
    return null;
  }
}

function writeCache(userId, messages) {
  try {
    // Strip image data to stay within localStorage limits
    const slim = messages.slice(-30).map(({ image, ...rest }) => rest);
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      userId,
      messages: slim,
      cachedAt: Date.now(),
    }));
  } catch { /* quota exceeded — ignore */ }
}

export function useAIAssistant() {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [sending, setSending] = useState(false);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [loadingSession, setLoadingSession] = useState(false);
  const loadedRef = useRef(false);

  const greet = useCallback(() => {
    setMessages((prev) => {
      if (prev.length > 0) return prev; // Don't greet if session was restored
      return [{
        role: 'assistant',
        content: "Hi! I'm Kai, your UKC assistant. How can I help you today?",
        timestamp: Date.now(),
      }];
    });
  }, []);

  const loadSession = useCallback(async () => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    setLoadingSession(true);

    const userId = user?.id;

    // 1. Instant-load from localStorage cache
    if (userId) {
      const cached = readCache(userId);
      if (cached && cached.length > 0) {
        setMessages(cached.map((m) => ({ ...m, _restored: true })));
      }
    }

    // 2. Fetch from backend (source of truth)
    try {
      if (userId) {
        const { data } = await apiClient.get('/assistant/session');
        if (data.messages && data.messages.length > 0) {
          const restored = data.messages.slice(-30).map((m) => ({
            role: m.role,
            content: m.content,
            timestamp: m.timestamp ? new Date(m.timestamp).getTime() : Date.now(),
            _restored: true,
          }));
          setMessages(restored);
          writeCache(userId, restored);
        }
      }
    } catch {
      // Cache is already displayed — fail silently
    } finally {
      setLoadingSession(false);
      setSessionLoaded(true);
    }
  }, [user]);

  const send = useCallback(async (text, imageBase64 = null) => {
    if ((!text?.trim() && !imageBase64) || sending) return;
    const userMsg = { role: 'user', content: text?.trim() || '', image: imageBase64 || null, timestamp: Date.now() };

    setMessages((prev) => {
      // Clear _restored flags on first new message
      const cleaned = prev.map(({ _restored, ...rest }) => rest);
      return [...cleaned, userMsg];
    });
    setSending(true);

    try {
      const payload = {
        message: text?.trim() || 'Analyze this image',
        conversationHistory: messages,
        userName: user?.name || user?.email || null,
      };
      if (imageBase64) payload.image = imageBase64;
      const { data } = await apiClient.post('/assistant', payload);
      const assistantMsg = { role: 'assistant', content: data.response, timestamp: Date.now() };
      setMessages((prev) => {
        const updated = [...prev, assistantMsg];
        if (user?.id) writeCache(user.id, updated);
        return updated;
      });
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
  }, [messages, sending, user]);

  return { messages, sending, send, greet, loadSession, sessionLoaded, loadingSession };
}
