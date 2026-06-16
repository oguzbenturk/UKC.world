import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/shared/hooks/useAuth';
import { realTimeService } from '@/shared/services/realTimeService';
import ChatApi from '../services/chatApi.js';
import { ChatWidgetContext } from './chatWidgetContextInstance.js';
import { CONV_KEY, msgKey } from './chatWidgetKeys.js';

function messagePreview(message) {
  if (message.message_type && message.message_type !== 'text') {
    return `[${message.message_type}]`;
  }
  return message.content || '';
}

// Append a message to a thread cache, de-duplicating by id (the sender also
// receives its own message back over the socket).
function appendMessageToThread(old, message) {
  if (!Array.isArray(old)) return old; // thread not loaded yet — it will fetch fresh
  if (old.some((m) => m.id === message.id)) return old;
  return [...old, message];
}

// Bump a conversation row with a new message and move it to the top.
// Returns { list, found } so the caller can refetch when the conversation is new.
function applyMessageToConversations(list, conversationId, message, { isMine, isActive }) {
  if (!Array.isArray(list)) return { list, found: false };
  const idx = list.findIndex((c) => c.id === conversationId);
  if (idx === -1) return { list, found: false };

  const conv = list[idx];
  let unread = Number(conv.unread_count) || 0;
  if (isActive) unread = 0;
  else if (!isMine) unread += 1;

  const updated = {
    ...conv,
    unread_count: unread,
    last_message_content: messagePreview(message),
    last_message_at: message.created_at,
    updated_at: message.created_at,
    last_message: {
      id: message.id,
      content: message.content,
      message_type: message.message_type,
      sender_id: message.sender_id,
      sender_name: message.sender_name,
      created_at: message.created_at,
    },
  };
  const next = [updated, ...list.slice(0, idx), ...list.slice(idx + 1)];
  return { list: next, found: true };
}

export function ChatWidgetProvider({ children }) {
  const { user, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const myId = user?.id;

  const [isOpen, setIsOpen] = useState(false);
  const [openConversationId, setOpenConversationId] = useState(null);
  const [openConversationMeta, setOpenConversationMeta] = useState(null);
  const [preview, setPreview] = useState(null); // { conversationId, senderName, content }

  // Refs so the once-registered socket handler always sees current panel state.
  const isOpenRef = useRef(isOpen);
  const openIdRef = useRef(openConversationId);
  useEffect(() => { isOpenRef.current = isOpen; }, [isOpen]);
  useEffect(() => { openIdRef.current = openConversationId; }, [openConversationId]);

  const conversationsQuery = useQuery({
    queryKey: CONV_KEY,
    queryFn: () => ChatApi.getConversations(),
    enabled: !!isAuthenticated,
    staleTime: 30000,
    refetchInterval: 60000, // safety net in case a socket event is missed
    refetchOnWindowFocus: false, // the socket keeps this live; avoids a read-receipt race flash
  });
  const conversations = useMemo(() => conversationsQuery.data || [], [conversationsQuery.data]);

  const markReadInternal = useCallback((conversationId) => {
    if (!conversationId) return;
    ChatApi.markAsRead(conversationId).catch(() => {});
    queryClient.setQueryData(CONV_KEY, (old) =>
      Array.isArray(old)
        ? old.map((c) => (c.id === conversationId ? { ...c, unread_count: 0 } : c))
        : old
    );
  }, [queryClient]);

  // Single point of truth for folding a message into the caches. Used by both the
  // live socket and the local send mutation (which de-duplicates on id).
  const ingestMessage = useCallback((conversationId, message) => {
    if (!conversationId || !message) return;
    const isMine = String(message.sender_id) === String(myId);
    // Only treat the open thread as "being read" when the tab is actually visible,
    // so messages arriving to a backgrounded tab still count as unread.
    const isActive = isOpenRef.current
      && openIdRef.current === conversationId
      && (typeof document === 'undefined' || document.visibilityState === 'visible');

    queryClient.setQueryData(msgKey(conversationId), (old) => appendMessageToThread(old, message));

    const current = queryClient.getQueryData(CONV_KEY);
    const { list, found } = applyMessageToConversations(current, conversationId, message, { isMine, isActive });
    if (found) {
      queryClient.setQueryData(CONV_KEY, list);
    } else {
      // A conversation we don't have yet (e.g. staff just opened a new DM) — pull it.
      queryClient.invalidateQueries({ queryKey: CONV_KEY });
    }

    if (!isMine && !isActive) {
      setPreview({
        conversationId,
        senderName: message.sender_name || 'New message',
        content: messagePreview(message),
      });
    }
    if (isActive && !isMine) {
      markReadInternal(conversationId);
    }
  }, [myId, queryClient, markReadInternal]);

  // Subscribe to the shared, already-authenticated app socket. The backend fans
  // chat events out to our personal `user:<id>` room, so we just listen here.
  useEffect(() => {
    if (!isAuthenticated) return undefined;
    const onMessage = (payload) => {
      if (!payload?.conversationId || !payload?.message) return;
      ingestMessage(payload.conversationId, payload.message);
    };
    const onRead = (payload) => {
      if (!payload?.conversationId) return;
      queryClient.invalidateQueries({ queryKey: msgKey(payload.conversationId) });
    };
    realTimeService.on('chat:message_sent', onMessage);
    realTimeService.on('chat:message_read', onRead);
    return () => {
      realTimeService.off('chat:message_sent', onMessage);
      realTimeService.off('chat:message_read', onRead);
    };
  }, [isAuthenticated, ingestMessage, queryClient]);

  // When the user returns to a visible tab with a thread open, mark it read
  // (messages that arrived while hidden were intentionally left unread).
  useEffect(() => {
    if (!isAuthenticated) return undefined;
    const onVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      if (isOpenRef.current && openIdRef.current) {
        markReadInternal(openIdRef.current);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [isAuthenticated, markReadInternal]);

  // Recover anything missed during a socket (re)connect/auth window: the backend
  // only delivers to user:<id> after the socket (re)authenticates, so re-sync the
  // conversation list and the open thread whenever that happens.
  useEffect(() => {
    if (!isAuthenticated) return undefined;
    const onAuthenticated = () => {
      queryClient.invalidateQueries({ queryKey: CONV_KEY });
      if (openIdRef.current) {
        queryClient.invalidateQueries({ queryKey: msgKey(openIdRef.current) });
      }
    };
    realTimeService.on('authenticated', onAuthenticated);
    return () => realTimeService.off('authenticated', onAuthenticated);
  }, [isAuthenticated, queryClient]);

  const openConversation = useCallback((conversationId, meta = null) => {
    setOpenConversationId(conversationId);
    if (meta) setOpenConversationMeta(meta);
    setIsOpen(true);
    setPreview(null);
    markReadInternal(conversationId);
  }, [markReadInternal]);

  // Staff entry point: click a member → get/create the DM → open the thread.
  const openConversationWith = useCallback(async (otherUserId) => {
    const conv = await ChatApi.createDirectConversation(otherUserId);
    await queryClient.invalidateQueries({ queryKey: CONV_KEY });
    openConversation(conv.id, conv);
    return conv;
  }, [queryClient, openConversation]);

  const toggleOpen = useCallback(() => {
    setIsOpen((o) => {
      if (!o) setPreview(null);
      return !o;
    });
  }, []);

  const closePanel = useCallback(() => setIsOpen(false), []);
  const goToList = useCallback(() => {
    setOpenConversationId(null);
    setOpenConversationMeta(null);
  }, []);
  const dismissPreview = useCallback(() => setPreview(null), []);

  const unreadTotal = useMemo(
    () => conversations.reduce((sum, c) => sum + (Number(c.unread_count) || 0), 0),
    [conversations]
  );

  const value = useMemo(() => ({
    isAuthenticated,
    me: user,
    isOpen,
    openConversationId,
    openConversationMeta,
    conversations,
    conversationsLoading: conversationsQuery.isLoading,
    unreadTotal,
    preview,
    openConversation,
    openConversationWith,
    toggleOpen,
    closePanel,
    goToList,
    dismissPreview,
    markRead: markReadInternal,
    ingestMessage,
  }), [
    isAuthenticated, user, isOpen, openConversationId, openConversationMeta,
    conversations, conversationsQuery.isLoading, unreadTotal, preview,
    openConversation, openConversationWith, toggleOpen, closePanel, goToList,
    dismissPreview, markReadInternal, ingestMessage,
  ]);

  return <ChatWidgetContext.Provider value={value}>{children}</ChatWidgetContext.Provider>;
}

export default ChatWidgetProvider;
