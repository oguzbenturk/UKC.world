import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ChatBubbleLeftRightIcon, XMarkIcon, ChevronLeftIcon } from '@heroicons/react/24/outline';
import { useChatWidget } from '../hooks/useChatWidget.js';
import ConversationList from './widget/ConversationList.jsx';
import ChatThread from './widget/ChatThread.jsx';
import { initials, avatarColor } from '../utils/chatDisplay.js';

// Mirror the exact gates of the two bottom-right corner FABs so the chat launcher
// never overlaps them. GlobalFAB shows for staff (everyone except these) but not
// instructors; StudentQuickActions shows for these student-like roles.
const GLOBAL_FAB_NON_STAFF_ROLES = ['outsider', 'student', 'trusted_customer'];
const STUDENT_FAB_ROLES = ['student', 'trusted_customer'];

// Whether the user's bottom-right corner already holds a FAB we must dodge.
function roleHasCornerFab(role) {
  const r = (role || '').toLowerCase();
  const hasGlobalFab = !GLOBAL_FAB_NON_STAFF_ROLES.includes(r) && r !== 'instructor';
  const hasStudentFab = STUDENT_FAB_ROLES.includes(r);
  return hasGlobalFab || hasStudentFab;
}

// eslint-disable-next-line complexity
export default function FloatingChatWidget() {
  const { t } = useTranslation(['common']);
  const {
    isAuthenticated,
    me,
    isOpen,
    openConversationId,
    openConversationMeta,
    conversations,
    unreadTotal,
    preview,
    toggleOpen,
    closePanel,
    goToList,
    openConversation,
    dismissPreview,
  } = useChatWidget();

  // Auto-dismiss the incoming-message preview bubble after a few seconds.
  useEffect(() => {
    if (!preview) return undefined;
    const id = setTimeout(() => dismissPreview(), 6000);
    return () => clearTimeout(id);
  }, [preview, dismissPreview]);

  if (!isAuthenticated) return null;

  const sideClass = roleHasCornerFab(me?.role) ? 'right-24' : 'right-6';

  // Hide entirely until there's something to show (a conversation, an open panel,
  // or an incoming message), so members with no messages see no launcher.
  const shouldShow = conversations.length > 0 || isOpen || !!preview;
  if (!shouldShow) return null;

  const activeConv = openConversationId
    ? (conversations.find((c) => c.id === openConversationId) || openConversationMeta)
    : null;
  const headerTitle = openConversationId
    ? (activeConv?.name || t('common:chatFeature.directMessage', 'Direct message'))
    : t('common:chatFeature.title', 'Messages');

  return (
    <div className={`fixed bottom-6 ${sideClass} z-[55] flex flex-col items-end gap-3`}>
      {/* Panel */}
      {isOpen && (
        <div className="w-[360px] max-w-[calc(100vw-2rem)] h-[70vh] max-h-[560px] flex flex-col rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-150">
          <header className="flex items-center gap-2 px-3 py-2.5 bg-white border-b border-slate-100">
            {openConversationId ? (
              <button
                type="button"
                onClick={goToList}
                className="flex-shrink-0 h-7 w-7 rounded-full hover:bg-slate-100 flex items-center justify-center bg-transparent border-none cursor-pointer text-slate-500"
                aria-label={t('common:chatFeature.back', 'Back')}
              >
                <ChevronLeftIcon className="h-5 w-5" />
              </button>
            ) : (
              <span className="flex-shrink-0 h-7 w-7 rounded-full bg-sky-100 text-sky-600 flex items-center justify-center">
                <ChatBubbleLeftRightIcon className="h-4 w-4" />
              </span>
            )}
            {openConversationId && activeConv?.name && (
              <span className={`flex-shrink-0 h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-semibold ${avatarColor(activeConv.name)}`}>
                {initials(activeConv.name)}
              </span>
            )}
            <h3 className="flex-1 min-w-0 truncate text-sm font-semibold text-slate-800 m-0">{headerTitle}</h3>
            <button
              type="button"
              onClick={closePanel}
              className="flex-shrink-0 h-7 w-7 rounded-full hover:bg-slate-100 flex items-center justify-center bg-transparent border-none cursor-pointer text-slate-500"
              aria-label={t('common:chatFeature.close', 'Close')}
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </header>

          {openConversationId ? (
            <ChatThread conversationId={openConversationId} />
          ) : (
            <ConversationList />
          )}
        </div>
      )}

      {/* Incoming-message preview bubble (only when the panel is closed) */}
      {!isOpen && preview && (
        <button
          type="button"
          onClick={() => openConversation(preview.conversationId)}
          className="w-[300px] max-w-[calc(100vw-2rem)] text-left bg-white rounded-2xl shadow-2xl border border-slate-200 px-3 py-2.5 flex items-start gap-2.5 cursor-pointer hover:bg-slate-50 transition-colors animate-in fade-in slide-in-from-bottom-2 duration-150"
        >
          <span className={`flex-shrink-0 h-9 w-9 rounded-full flex items-center justify-center text-xs font-semibold ${avatarColor(preview.senderName)}`}>
            {initials(preview.senderName)}
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-semibold text-slate-800 truncate">{preview.senderName}</span>
            <span className="block text-xs text-slate-500 truncate">{preview.content}</span>
          </span>
        </button>
      )}

      {/* Launcher */}
      <button
        type="button"
        onClick={toggleOpen}
        className="relative h-14 w-14 rounded-full shadow-2xl bg-gradient-to-b from-sky-500 to-sky-600 text-white flex items-center justify-center hover:scale-105 active:scale-95 transition-transform border-none cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
        aria-label={t('common:chatFeature.title', 'Messages')}
      >
        {isOpen ? <XMarkIcon className="h-6 w-6" /> : <ChatBubbleLeftRightIcon className="h-6 w-6" />}
        {!isOpen && unreadTotal > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[20px] h-5 px-1 rounded-full bg-rose-500 text-white text-[11px] font-bold flex items-center justify-center ring-2 ring-white">
            {unreadTotal > 99 ? '99+' : unreadTotal}
          </span>
        )}
      </button>
    </div>
  );
}
