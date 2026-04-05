/**
 * ChatSidebar Component
 * 
 * Modern, calm conversation list with subtle visual hierarchy
 * Design: Clean, professional, no flashy colors
 */

import { useState, useEffect, useMemo } from 'react';
import { Input, Spin, Badge, Button, Collapse, message as antdMessage } from 'antd';
import { SearchOutlined, PlusOutlined, UsergroupAddOutlined } from '@ant-design/icons';
import { format, isToday, isYesterday, isThisWeek } from 'date-fns';
import ChatApi from '../services/chatApi';

const { Panel } = Collapse;

const ChatSidebar = ({ 
  onSelectConversation, 
  selectedConversationId,
  onCreateConversation,
  conversations: externalConversations,
  loading: externalLoading
}) => {
  const [internalConversations, setInternalConversations] = useState([]);
  const [internalLoading, setInternalLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [availableChannels, setAvailableChannels] = useState([]);
  const [joiningChannel, setJoiningChannel] = useState(null);

  const conversations = externalConversations ?? internalConversations;
  const loading = externalLoading ?? internalLoading;

  useEffect(() => {
    if (!externalConversations) {
      loadConversations();
    }
    loadAvailableChannels();
  }, [externalConversations]);

  const loadConversations = async () => {
    try {
      setInternalLoading(true);
      const data = await ChatApi.getConversations();
      setInternalConversations(Array.isArray(data) ? data : []);
    } catch {
      setInternalConversations([]);
    } finally {
      setInternalLoading(false);
    }
  };

  const loadAvailableChannels = async () => {
    try {
      const data = await ChatApi.getAvailableChannels();
      setAvailableChannels(Array.isArray(data) ? data : []);
    } catch {
      setAvailableChannels([]);
    }
  };

  const handleJoinChannel = async (channelId) => {
    try {
      setJoiningChannel(channelId);
      await ChatApi.joinChannel(channelId);
      antdMessage.success('Joined channel successfully');
      loadConversations();
      loadAvailableChannels();
    } catch {
      antdMessage.error('Failed to join channel');
    } finally {
      setJoiningChannel(null);
    }
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    
    if (isToday(date)) return format(date, 'HH:mm');
    if (isYesterday(date)) return 'Yesterday';
    if (isThisWeek(date)) return format(date, 'EEE');
    return format(date, 'MMM d');
  };

  const getInitials = (conv) => {
    if (conv.type === 'direct') {
      return conv.name?.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() || '?';
    }
    return conv.name?.charAt(0)?.toUpperCase() || '#';
  };

  const filteredConversations = useMemo(() => {
    const safe = Array.isArray(conversations) ? conversations : [];
    if (!searchTerm.trim()) return safe;
    const term = searchTerm.toLowerCase();
    return safe.filter(c => 
      c.name?.toLowerCase().includes(term) ||
      c.last_message_content?.toLowerCase().includes(term)
    );
  }, [conversations, searchTerm]);

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-800 tracking-tight">Messages</h2>
          {onCreateConversation && (
            <button
              onClick={onCreateConversation}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
              title="New conversation"
            >
              <PlusOutlined className="text-sm" />
            </button>
          )}
        </div>
        
        <div className="relative">
          <SearchOutlined className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm" />
          <Input
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 bg-gray-50 border-gray-100 rounded-lg hover:border-gray-200 focus:border-slate-300"
            allowClear
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Spin />
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-400">
            <p className="text-sm">{searchTerm ? 'No results' : 'No conversations yet'}</p>
          </div>
        ) : (
          <div className="py-2">
            {filteredConversations.map((conv) => {
              const isSelected = conv.id === selectedConversationId;
              const hasUnread = conv.unread_count > 0;

              return (
                <div
                  key={conv.id}
                  onClick={() => onSelectConversation(conv)}
                  className={`mx-2 px-3 py-3 rounded-xl cursor-pointer transition-all duration-150
                    ${isSelected ? 'bg-slate-100' : 'hover:bg-gray-50'}`}
                >
                  <div className="flex items-start gap-3">
                    {/* Avatar */}
                    <div className="relative flex-shrink-0">
                      <div className={`w-11 h-11 rounded-full flex items-center justify-center text-sm font-medium
                        ${conv.type === 'direct' 
                          ? 'bg-slate-100 text-slate-600' 
                          : conv.type === 'group'
                            ? 'bg-emerald-50 text-emerald-600'
                            : 'bg-violet-50 text-violet-600'
                        }`}>
                        {getInitials(conv)}
                      </div>
                      {hasUnread && (
                        <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-blue-500 rounded-full border-2 border-white" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <span className={`font-medium text-sm truncate ${hasUnread ? 'text-gray-900' : 'text-gray-700'}`}>
                          {conv.name || 'Unnamed'}
                        </span>
                        <span className="text-xs text-gray-400 flex-shrink-0">
                          {formatTimestamp(conv.last_message_at)}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <p className={`text-sm truncate flex-1 ${hasUnread ? 'text-gray-700 font-medium' : 'text-gray-500'}`}>
                          {conv.last_message_content || 'Start a conversation...'}
                        </p>
                        {hasUnread && conv.unread_count > 1 && (
                          <Badge count={conv.unread_count} className="flex-shrink-0" style={{ backgroundColor: '#3b82f6' }} />
                        )}
                      </div>

                      {conv.type !== 'direct' && (
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className="text-[11px] text-gray-400 capitalize">{conv.type}</span>
                          {conv.participant_count > 0 && (
                            <span className="text-[11px] text-gray-400">· {conv.participant_count}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Available Channels Section */}
        {availableChannels.length > 0 && (
          <div className="border-t border-gray-100 mt-2">
            <Collapse ghost className="bg-transparent">
              <Panel 
                header={
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-600 px-3">
                    <UsergroupAddOutlined />
                    <span>Available Channels ({availableChannels.length})</span>
                  </div>
                } 
                key="1"
              >
                <div className="space-y-1 px-2">
                  {availableChannels.map(channel => (
                    <div
                      key={channel.id}
                      className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-gray-50"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-700 truncate">
                          #{channel.name}
                        </p>
                        <p className="text-xs text-gray-400">
                          {channel.member_count} members · by {channel.created_by_name}
                        </p>
                      </div>
                      <Button
                        size="small"
                        type="primary"
                        className="bg-slate-700 hover:bg-slate-800 flex-shrink-0"
                        onClick={() => handleJoinChannel(channel.id)}
                        loading={joiningChannel === channel.id}
                      >
                        Join
                      </Button>
                    </div>
                  ))}
                </div>
              </Panel>
            </Collapse>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatSidebar;
