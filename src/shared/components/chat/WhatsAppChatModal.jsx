import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { SendOutlined } from '@ant-design/icons';
import { XMarkIcon } from '@heroicons/react/24/outline';
import ReactMarkdown from 'react-markdown';
import { useAIChat } from '@/shared/contexts/AIChatContext';
import { STARTER_PROMPTS } from '@/shared/hooks/useAIAssistant';

const formatTime = (ts) => {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const TypingIndicator = () => (
  <div className="flex items-start mb-3">
    <div className="bg-white rounded-2xl rounded-tl-none px-4 py-2.5 shadow-sm">
      <div className="flex gap-1 items-center h-5">
        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  </div>
);

const WhatsAppChatModal = () => {
  const { isChatOpen, closeChat, messages, sending, send } = useAIChat();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  // Focus input when chat opens
  useEffect(() => {
    if (isChatOpen) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isChatOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isChatOpen) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') closeChat();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isChatOpen, closeChat]);

  const handleSend = () => {
    if (!input.trim()) return;
    send(input);
    setInput('');
  };

  const MarkdownLink = ({ href, children }) => {
    if (href?.startsWith('/')) {
      return (
        <a
          href={href}
          className="text-blue-600 underline hover:text-blue-800"
          onClick={(e) => {
            e.preventDefault();
            navigate(href);
            closeChat();
          }}
        >
          {children}
        </a>
      );
    }
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
        {children}
      </a>
    );
  };

  if (!isChatOpen) return null;

  const showStarters = messages.length <= 1;

  return (
    <div className="fixed inset-0 z-[1000] flex items-end sm:items-end justify-start sm:justify-start p-0 sm:p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={closeChat} />

      {/* Chat window */}
      <div
        className="relative flex flex-col w-full h-full sm:w-[400px] sm:h-[550px] sm:ml-2 sm:mb-2 rounded-none sm:rounded-2xl overflow-hidden shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-300"
        style={{ animationFillMode: 'both' }}
      >
        {/* Header - WhatsApp green */}
        <div className="flex items-center px-4 py-3 bg-[#075E54] text-white flex-shrink-0">
          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-[#25D366] flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
              </svg>
            </div>
            {/* Online dot */}
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-400 rounded-full border-2 border-[#075E54]" />
          </div>
          <div className="ml-3 flex-1 min-w-0">
            <div className="font-semibold text-[15px] leading-tight">Plannivo Support</div>
            <div className="text-[12px] text-green-200 leading-tight mt-0.5">Online</div>
          </div>
          <button
            onClick={closeChat}
            className="p-1.5 rounded-full hover:bg-white/15 transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Messages area - WhatsApp background */}
        <div
          className="flex-1 overflow-y-auto px-3 py-3 space-y-1"
          style={{ backgroundColor: '#ECE5DD' }}
        >
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} mb-1`}>
              <div
                className={`relative max-w-[85%] px-3 py-2 text-sm shadow-sm ${
                  m.role === 'user'
                    ? 'bg-[#DCF8C6] rounded-2xl rounded-tr-none text-gray-900'
                    : 'bg-white rounded-2xl rounded-tl-none text-gray-800'
                }`}
              >
                {m.role === 'assistant' ? (
                  <ReactMarkdown
                    components={{
                      a: MarkdownLink,
                      p: ({ children }) => <p className="mb-1 last:mb-0 leading-relaxed">{children}</p>,
                      ul: ({ children }) => <ul className="list-disc pl-4 mb-1">{children}</ul>,
                      ol: ({ children }) => <ol className="list-decimal pl-4 mb-1">{children}</ol>,
                      li: ({ children }) => <li className="mb-0.5">{children}</li>,
                      strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                    }}
                  >
                    {m.content}
                  </ReactMarkdown>
                ) : (
                  <span className="leading-relaxed">{m.content}</span>
                )}
                {m.timestamp && (
                  <div className={`text-[10px] mt-1 text-right ${m.role === 'user' ? 'text-gray-500' : 'text-gray-400'}`}>
                    {formatTime(m.timestamp)}
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Starter prompts */}
          {showStarters && (
            <div className="flex flex-wrap gap-1.5 mt-2 mb-1">
              {STARTER_PROMPTS.map((p) => (
                <button
                  key={p}
                  onClick={() => send(p)}
                  className="px-3 py-1.5 text-xs bg-white rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors shadow-sm"
                >
                  {p}
                </button>
              ))}
            </div>
          )}

          {sending && <TypingIndicator />}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="flex items-center gap-2 px-3 py-2.5 bg-[#F0F0F0] flex-shrink-0">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="Type a message..."
            disabled={sending}
            className="flex-1 px-4 py-2.5 bg-white rounded-full text-sm text-gray-800 placeholder-gray-400 outline-none border-none focus:ring-1 focus:ring-[#075E54]/30"
          />
          <button
            onClick={handleSend}
            disabled={sending || !input.trim()}
            className="w-10 h-10 rounded-full bg-[#075E54] text-white flex items-center justify-center hover:bg-[#064E46] transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
          >
            <SendOutlined style={{ fontSize: 16 }} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default WhatsAppChatModal;
