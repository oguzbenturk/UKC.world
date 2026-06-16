import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PaperAirplaneIcon } from '@heroicons/react/24/solid';
import ChatApi from '../../services/chatApi.js';
import { useChatWidget } from '../../hooks/useChatWidget.js';
import { msgKey } from '../../context/chatWidgetKeys.js';
import { shortTime } from '../../utils/chatDisplay.js';

export default function ChatThread({ conversationId }) {
  const { t } = useTranslation(['common']);
  const { me, ingestMessage } = useChatWidget();
  const [text, setText] = useState('');
  const scrollRef = useRef(null);

  const messagesQuery = useQuery({
    queryKey: msgKey(conversationId),
    queryFn: () => ChatApi.getMessages(conversationId),
    enabled: !!conversationId,
  });
  const messages = messagesQuery.data || [];

  const sendMutation = useMutation({
    mutationFn: (content) => ChatApi.sendTextMessage(conversationId, content),
    onSuccess: (message) => {
      ingestMessage(conversationId, message);
      setText('');
    },
  });

  // Keep the latest message in view.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, conversationId]);

  const handleSend = (e) => {
    e?.preventDefault?.();
    const content = text.trim();
    if (!content || sendMutation.isPending) return;
    sendMutation.mutate(content);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2 bg-slate-50">
        {messagesQuery.isLoading && messages.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-slate-200 border-t-sky-500" />
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-slate-400 text-center px-4">
            {t('common:chatFeature.startConversation', 'Say hello to start the conversation.')}
          </div>
        ) : (
          messages.map((m) => {
            const mine = String(m.sender_id) === String(me?.id);
            const isSystem = m.message_type === 'system';
            if (isSystem) {
              return (
                <div key={m.id} className="flex justify-center">
                  <span className="text-[11px] text-slate-400 bg-slate-100 rounded-full px-3 py-1">
                    {m.content}
                  </span>
                </div>
              );
            }
            return (
              <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[78%] rounded-2xl px-3 py-2 ${mine ? 'bg-sky-500 text-white rounded-br-sm' : 'bg-white text-slate-800 border border-slate-100 rounded-bl-sm'}`}>
                  {!mine && (
                    <div className="text-[11px] font-semibold text-sky-600 mb-0.5">{m.sender_name}</div>
                  )}
                  <div className="text-sm whitespace-pre-wrap break-words">{m.content}</div>
                  <div className={`text-[10px] mt-0.5 text-right ${mine ? 'text-sky-100' : 'text-slate-400'}`}>
                    {shortTime(m.created_at)}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <form onSubmit={handleSend} className="flex items-end gap-2 p-2 border-t border-slate-100 bg-white">
        <textarea
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('common:chatFeature.typeMessage', 'Type a message...')}
          className="flex-1 resize-none max-h-24 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-300"
        />
        <button
          type="submit"
          disabled={!text.trim() || sendMutation.isPending}
          className="flex-shrink-0 h-9 w-9 rounded-full bg-sky-500 text-white flex items-center justify-center hover:bg-sky-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors border-none cursor-pointer"
          aria-label={t('common:chatFeature.send', 'Send')}
        >
          <PaperAirplaneIcon className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
