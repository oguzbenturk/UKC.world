/**
 * ChatWindow Component
 * 
 * Modern, calm chat interface with subtle role indicators
 * Design: Professional, clean typography, soft contrasts
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Spin, Tooltip, Modal, message as antdMessage } from 'antd';
import { PhoneOutlined, VideoCameraOutlined, DeleteOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import MessageBubble from './MessageBubble';
import MessageInput from './MessageInput';
import ChatApi from '../services/chatApi';
import { useAuth } from '@/shared/hooks/useAuth';

// eslint-disable-next-line complexity
const ChatWindow = ({ 
  conversation, 
  socket,
  onTyping,
  onStopTyping,
  hideMobileHeader = false,
  onConversationDeleted
}) => {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [typingUsers, setTypingUsers] = useState([]);
  const [deleting, setDeleting] = useState(false);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);

  // Check if user can delete this conversation
  const canDelete = useCallback(() => {
    if (!conversation || conversation.type === 'direct') return false;
    const role = user?.role?.toLowerCase();
    return role === 'admin' || role === 'manager' || conversation.created_by === user?.id;
  }, [conversation, user]);

  const handleDelete = async () => {
    Modal.confirm({
      title: 'Delete Conversation',
      icon: <ExclamationCircleOutlined />,
      content: `Are you sure you want to delete "${conversation.name}"? This action cannot be undone and all messages will be permanently deleted.`,
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          setDeleting(true);
          await ChatApi.deleteConversation(conversation.id);
          antdMessage.success('Conversation deleted');
          if (onConversationDeleted) {
            onConversationDeleted(conversation.id);
          }
        } catch (error) {
          antdMessage.error(error.response?.data?.error || 'Failed to delete conversation');
        } finally {
          setDeleting(false);
        }
      }
    });
  };

  const loadMessages = useCallback(async () => {
    try {
      setLoading(true);
      const data = await ChatApi.getMessages(conversation.id);
      setMessages(Array.isArray(data) ? data : []);
    } catch {
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [conversation?.id]);

  const markAsRead = useCallback(async () => {
    try {
      await ChatApi.markAsRead(conversation.id);
    } catch {
      // Silent fail
    }
  }, [conversation?.id]);

  useEffect(() => {
    if (conversation?.id) {
      loadMessages();
      markAsRead();
    }
  }, [conversation?.id, loadMessages, markAsRead]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (!socket || !conversation?.id) return;

    const handleNewMessage = (message) => {
      if (message.conversation_id === conversation.id) {
        setMessages(prev => [...prev, message]);
        markAsRead();
      }
    };

    const handleTyping = (data) => {
      if (data.conversationId === conversation.id && data.userId !== user?.id) {
        setTypingUsers(prev => {
          if (!prev.find(u => u.userId === data.userId)) {
            return [...prev, data];
          }
          return prev;
        });
        setTimeout(() => {
          setTypingUsers(prev => prev.filter(u => u.userId !== data.userId));
        }, 3000);
      }
    };

    socket.on('message', handleNewMessage);
    socket.on('typing', handleTyping);

    return () => {
      socket.off('message', handleNewMessage);
      socket.off('typing', handleTyping);
    };
  }, [socket, conversation?.id, user?.id, markAsRead]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleMessageSent = (newMessage) => {
    setMessages(prev => [...prev, newMessage]);
  };

  const getInitials = (name) => {
    return name?.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() || '?';
  };

  if (!conversation) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-100 flex items-center justify-center">
            <span className="text-2xl">💬</span>
          </div>
          <p className="text-gray-500 text-sm">Select a conversation to start chatting</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header - Clean, minimal - Hidden on mobile if hideMobileHeader is true */}
      <div className={`border-b border-gray-100 px-4 sm:px-6 py-3 sm:py-4 bg-white ${hideMobileHeader ? 'hidden md:block' : ''}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium
              ${conversation.type === 'direct' 
                ? 'bg-slate-100 text-slate-600' 
                : conversation.type === 'group'
                  ? 'bg-emerald-50 text-emerald-600'
                  : 'bg-violet-50 text-violet-600'
              }`}>
              {getInitials(conversation.name)}
            </div>
            
            <div>
              <h3 className="text-base font-semibold text-gray-800">
                {conversation.name || 'Unnamed'}
              </h3>
              <p className="text-xs text-gray-400">
                {conversation.type === 'direct' ? 'Direct message' : 
                 `${conversation.participant_count || 0} members`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <Tooltip title="Voice call">
              <button className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors">
                <PhoneOutlined />
              </button>
            </Tooltip>
            <Tooltip title="Video call">
              <button className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors">
                <VideoCameraOutlined />
              </button>
            </Tooltip>
            {canDelete() && (
              <Tooltip title="Delete conversation">
                <button 
                  onClick={handleDelete}
                  disabled={deleting}
                  className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                >
                  <DeleteOutlined />
                </button>
              </Tooltip>
            )}
          </div>
        </div>
      </div>

      {/* Messages Area - Subtle background */}
      <div 
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto px-3 sm:px-6 py-3 sm:py-4 bg-slate-50/50"
      >
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Spin />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-14 h-14 rounded-full bg-white shadow-sm flex items-center justify-center mb-3">
              <span className="text-xl">👋</span>
            </div>
            <p className="text-gray-500 text-sm">No messages yet</p>
            <p className="text-gray-400 text-xs mt-1">Start the conversation!</p>
          </div>
        ) : (
          <>
            {messages.map((message, index) => {
              const prevMessage = messages[index - 1];
              const showAvatar = index === 0 || prevMessage?.sender_id !== message.sender_id;
              const timeDiff = index > 0 ? new Date(message.created_at) - new Date(prevMessage?.created_at) : Infinity;
              const showTimestamp = timeDiff > 300000; // 5 minutes gap

              return (
                <MessageBubble
                  key={message.id}
                  message={message}
                  isOwn={message.sender_id === user?.id}
                  showAvatar={showAvatar}
                  showTimestamp={showTimestamp}
                />
              );
            })}

            {/* Typing indicator */}
            {typingUsers.length > 0 && (
              <div className="flex items-center gap-2 py-2 px-3">
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <span className="text-xs text-gray-400">
                  {typingUsers.map(u => u.userName).join(', ')} typing...
                </span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Message Input */}
      <MessageInput
        conversationId={conversation.id}
        onMessageSent={handleMessageSent}
        onTyping={onTyping}
        onStopTyping={onStopTyping}
      />
    </div>
  );
};

export default ChatWindow;
