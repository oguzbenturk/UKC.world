/**
 * useChat Hook
 * 
 * Real-time chat functionality with Socket.IO
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import io from 'socket.io-client';
import { useAuth } from '@/shared/hooks/useAuth';
import { message } from '@/shared/utils/antdStatic';

const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export const useChat = () => {
  const { user } = useAuth();
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [onlineUsers] = useState(new Set());
  const messageHandlers = useRef(new Map());
  const typingTimeouts = useRef(new Map());

  // Initialize socket connection
  useEffect(() => {
    if (!user?.id) return;

    const newSocket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });

    newSocket.on('connect', () => {
      setConnected(true);
      
      // Authenticate with server
      newSocket.emit('authenticate', {
        id: user.id,
        role: user.role
      });
    });

    newSocket.on('disconnect', () => {
      setConnected(false);
    });

    newSocket.on('authenticated', () => {
      // Successfully authenticated
    });

    newSocket.on('auth_error', () => {
      message.error('Failed to connect to chat service');
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, [user?.id, user?.role]);

  // Join conversation room
  const joinConversation = useCallback((conversationId) => {
    if (socket && connected) {
      socket.emit('chat:join_conversation', conversationId);
    }
  }, [socket, connected]);

  // Leave conversation room
  const leaveConversation = useCallback((conversationId) => {
    if (socket && connected) {
      socket.emit('chat:leave_conversation', conversationId);
    }
  }, [socket, connected]);

  // Send typing indicator
  const sendTyping = useCallback((conversationId) => {
    if (socket && connected) {
      socket.emit('chat:typing', { conversationId });
      
      // Auto-stop typing after 3 seconds
      if (typingTimeouts.current.has(conversationId)) {
        clearTimeout(typingTimeouts.current.get(conversationId));
      }
      
      const timeout = setTimeout(() => {
        socket.emit('chat:stop_typing', { conversationId });
        typingTimeouts.current.delete(conversationId);
      }, 3000);
      
      typingTimeouts.current.set(conversationId, timeout);
    }
  }, [socket, connected]);

  // Stop typing indicator
  const stopTyping = useCallback((conversationId) => {
    if (socket && connected) {
      socket.emit('chat:stop_typing', { conversationId });
      
      if (typingTimeouts.current.has(conversationId)) {
        clearTimeout(typingTimeouts.current.get(conversationId));
        typingTimeouts.current.delete(conversationId);
      }
    }
  }, [socket, connected]);

  // Subscribe to message events
  const onMessage = useCallback((conversationId, handler) => {
    if (!socket) return () => {};

    const wrappedHandler = (message) => {
      if (message.conversation_id === conversationId) {
        handler(message);
      }
    };

    socket.on('chat:message_sent', wrappedHandler);
    messageHandlers.current.set(conversationId, wrappedHandler);

    return () => {
      socket.off('chat:message_sent', wrappedHandler);
      messageHandlers.current.delete(conversationId);
    };
  }, [socket]);

  // Subscribe to read receipt events
  const onReadReceipt = useCallback((conversationId, handler) => {
    if (!socket) return () => {};

    const wrappedHandler = (data) => {
      if (data.conversationId === conversationId) {
        handler(data);
      }
    };

    socket.on('chat:message_read', wrappedHandler);

    return () => {
      socket.off('chat:message_read', wrappedHandler);
    };
  }, [socket]);

  // Subscribe to typing events
  const onTyping = useCallback((conversationId, handler) => {
    if (!socket) return () => {};

    const wrappedHandler = (data) => {
      if (data.conversationId === conversationId) {
        handler(data);
      }
    };

    socket.on('chat:user_typing', wrappedHandler);

    return () => {
      socket.off('chat:user_typing', wrappedHandler);
    };
  }, [socket]);

  // Subscribe to stop typing events
  const onStopTyping = useCallback((conversationId, handler) => {
    if (!socket) return () => {};

    const wrappedHandler = (data) => {
      if (data.conversationId === conversationId) {
        handler(data);
      }
    };

    socket.on('chat:user_stop_typing', wrappedHandler);

    return () => {
      socket.off('chat:user_stop_typing', wrappedHandler);
    };
  }, [socket]);

  // Subscribe to user joined events
  const onUserJoined = useCallback((conversationId, handler) => {
    if (!socket) return () => {};

    const wrappedHandler = (data) => {
      if (data.conversationId === conversationId) {
        handler(data);
      }
    };

    socket.on('chat:user_joined', wrappedHandler);

    return () => {
      socket.off('chat:user_joined', wrappedHandler);
    };
  }, [socket]);

  // Subscribe to user left events
  const onUserLeft = useCallback((conversationId, handler) => {
    if (!socket) return () => {};

    const wrappedHandler = (data) => {
      if (data.conversationId === conversationId) {
        handler(data);
      }
    };

    socket.on('chat:user_left', wrappedHandler);

    return () => {
      socket.off('chat:user_left', wrappedHandler);
    };
  }, [socket]);

  return {
    socket,
    connected,
    onlineUsers,
    joinConversation,
    leaveConversation,
    sendTyping,
    stopTyping,
    onMessage,
    onReadReceipt,
    onTyping,
    onStopTyping,
    onUserJoined,
    onUserLeft
  };
};
