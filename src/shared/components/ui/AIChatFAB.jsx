import { useLocation } from 'react-router-dom';
import { ChatBubbleLeftRightIcon } from '@heroicons/react/24/solid';
import { useAIChat } from '@/shared/contexts/AIChatContext';

const HIDDEN_PATHS = ['/login', '/register', '/reset-password'];
const HIDDEN_PREFIXES = ['/f/', '/quick/', '/group-invitation/'];

const AIChatFAB = () => {
  const { isChatOpen, toggleChat } = useAIChat();
  const { pathname } = useLocation();

  const isHidden =
    HIDDEN_PATHS.includes(pathname) ||
    HIDDEN_PREFIXES.some((p) => pathname.startsWith(p));

  if (isChatOpen || isHidden) return null;

  return (
    <button
      onClick={toggleChat}
      className="fixed bottom-6 left-6 z-[60] w-14 h-14 rounded-full bg-duotone-blue text-white shadow-lg hover:bg-[#008da6] hover:scale-105 active:scale-95 transition-all flex items-center justify-center ai-chat-fab-mobile"
      aria-label="Ask Kai"
      style={{ marginBottom: 'env(keyboard-inset-height, 0px)' }}
    >
      <ChatBubbleLeftRightIcon className="w-6 h-6" />
      <span className="absolute top-0 right-0 w-3.5 h-3.5 bg-white rounded-full border-2 border-duotone-blue flex items-center justify-center">
        <span className="w-1.5 h-1.5 bg-duotone-blue rounded-full" />
      </span>
    </button>
  );
};

export default AIChatFAB;
