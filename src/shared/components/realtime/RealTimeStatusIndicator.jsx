// Minimal Real Time Status Indicator (now polls backend stats)
import { useState, useEffect, useRef, useContext } from 'react';
import { Popover } from 'antd';
import { useTranslation } from 'react-i18next';
import { ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline';
import apiClient from '@/shared/services/apiClient';
import { useAuth } from '@/shared/hooks/useAuth';
import { ChatWidgetContext } from '@/features/chat/context/chatWidgetContextInstance';

const RealTimeStatusIndicator = () => {
  const { t } = useTranslation(['common']);
  const { user } = useAuth();
  // Read the chat controller directly so this always-on presence widget still
  // works (just without click-to-chat) if ever rendered outside the provider.
  const chatWidget = useContext(ChatWidgetContext);
  const openConversationWith = chatWidget?.openConversationWith;
  const [isConnected, setIsConnected] = useState(true);
  const [activeUsers, setActiveUsers] = useState(1);
  const [connectedUserList, setConnectedUserList] = useState([]);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [startingChatId, setStartingChatId] = useState(null);
  const timerRef = useRef(null);

  const handleStartChat = async (u) => {
    if (!openConversationWith || !u?.id || u.id === user?.id || startingChatId) return;
    setStartingChatId(u.id);
    try {
      await openConversationWith(u.id);
      setPopoverOpen(false);
    } catch {
      // Opening a chat is best-effort; leave the popover open on failure.
    } finally {
      setStartingChatId(null);
    }
  };

  const fetchStats = async () => {
    try {
      const { data } = await apiClient.get('/socket/stats');
      const total = data?.stats?.totalConnections ?? data?.stats?.connectedUsers ?? 0;
      setActiveUsers(Number(total) || 0);
      setIsConnected(true);
      if (data?.stats?.users && Array.isArray(data.stats.users)) {
        setConnectedUserList(data.stats.users);
      }
    } catch {
      setIsConnected(false);
    }
  };

  useEffect(() => {
    // initial fetch
    fetchStats();
    // poll every 20s
    timerRef.current = setInterval(fetchStats, 20000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const handleClick = () => {
    fetchStats();
    setPopoverOpen(!popoverOpen);
  };

  const popoverContent = (
    <div style={{ maxHeight: 300, overflowY: 'auto', minWidth: 200 }}>
      <div className="text-xs font-semibold text-slate-500 mb-2">
        {t('common:realtime.usersOnline', { count: activeUsers })}
      </div>
      {connectedUserList.length > 0 ? (
        <ul className="space-y-0.5 list-none p-0 m-0">
          {connectedUserList.map((u, i) => {
            const isSelf = u.id && u.id === user?.id;
            const canChat = !!u.id && !isSelf && !!openConversationWith;
            return (
              <li key={u.id || i}>
                <button
                  type="button"
                  disabled={!canChat}
                  onClick={() => handleStartChat(u)}
                  title={canChat ? t('common:chatFeature.messageUser', 'Send a message') : undefined}
                  className={`group w-full flex items-center gap-2 text-sm rounded-md px-2 py-1.5 bg-transparent border-none text-left ${canChat ? 'cursor-pointer hover:bg-sky-50' : 'cursor-default'}`}
                >
                  <div className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                  <span className="text-slate-700 dark:text-slate-200 truncate">
                    {u.name || u.email || `User ${i + 1}`}
                    {isSelf && <span className="text-slate-400"> ({t('common:chatFeature.you', 'you')})</span>}
                  </span>
                  {u.role && (
                    <span className="text-xs text-slate-400 ml-auto group-hover:hidden">{u.role}</span>
                  )}
                  {canChat && (
                    <ChatBubbleLeftRightIcon className="h-4 w-4 text-sky-500 ml-auto hidden group-hover:block flex-shrink-0" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-xs text-slate-400 m-0">
          {isConnected ? t('common:realtime.noDetails') : t('common:realtime.connectionLost')}
        </p>
      )}
    </div>
  );

  return (
    <Popover
      content={popoverContent}
      title={t('common:realtime.activeUsers')}
      trigger="click"
      open={popoverOpen}
      onOpenChange={setPopoverOpen}
      placement="bottomRight"
    >
      <button
        type="button"
        onClick={handleClick}
        className="flex items-center space-x-2 text-sm cursor-pointer bg-transparent border-none p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors"
      >
        <div className="flex items-center space-x-1.5">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="font-semibold text-slate-600 dark:text-slate-200">{isConnected ? t('common:realtime.live') : t('common:realtime.offline')}</span>
          <span
            className="text-slate-500 text-xs"
            title={`${activeUsers} ${isConnected ? 'online' : 'offline'}`}
          >
            {activeUsers}
          </span>
        </div>
      </button>
    </Popover>
  );
};

export default RealTimeStatusIndicator;
