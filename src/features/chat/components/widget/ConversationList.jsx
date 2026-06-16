import { useTranslation } from 'react-i18next';
import { useChatWidget } from '../../hooks/useChatWidget.js';
import { initials, avatarColor, shortTime } from '../../utils/chatDisplay.js';

export default function ConversationList() {
  const { t } = useTranslation(['common']);
  const { conversations, conversationsLoading, openConversation } = useChatWidget();

  if (conversationsLoading && conversations.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-slate-400">
        <div className="animate-spin rounded-full h-6 w-6 border-2 border-slate-200 border-t-sky-500" />
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-1 px-6 text-center">
        <p className="text-sm font-medium text-slate-600">
          {t('common:chatFeature.noConversations', 'No conversations yet')}
        </p>
        <p className="text-xs text-slate-400">
          {t('common:chatFeature.noConversationsDesc', 'Messages from the team will appear here.')}
        </p>
      </div>
    );
  }

  return (
    <ul className="flex-1 overflow-y-auto list-none p-0 m-0 divide-y divide-slate-100">
      {conversations.map((c) => {
        const name = c.name || t('common:chatFeature.directMessage', 'Direct message');
        const unread = Number(c.unread_count) || 0;
        return (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => openConversation(c.id, c)}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50 transition-colors bg-transparent border-none cursor-pointer"
            >
              <span
                className={`flex-shrink-0 h-9 w-9 rounded-full flex items-center justify-center text-xs font-semibold ${avatarColor(name)}`}
              >
                {initials(name)}
              </span>
              <span className="flex-1 min-w-0">
                <span className="flex items-center justify-between gap-2">
                  <span className={`truncate text-sm ${unread > 0 ? 'font-semibold text-slate-900' : 'font-medium text-slate-700'}`}>
                    {name}
                  </span>
                  {c.last_message_at && (
                    <span className="text-[11px] text-slate-400 flex-shrink-0">{shortTime(c.last_message_at)}</span>
                  )}
                </span>
                <span className="flex items-center justify-between gap-2 mt-0.5">
                  <span className={`truncate text-xs ${unread > 0 ? 'text-slate-600' : 'text-slate-400'}`}>
                    {c.last_message_content || ''}
                  </span>
                  {unread > 0 && (
                    <span className="flex-shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-sky-500 text-white text-[11px] font-semibold flex items-center justify-center">
                      {unread > 99 ? '99+' : unread}
                    </span>
                  )}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
