import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { XMarkIcon, MicrophoneIcon, PaperClipIcon, XCircleIcon } from '@heroicons/react/24/outline';
import { PaperAirplaneIcon } from '@heroicons/react/24/solid';
import ReactMarkdown from 'react-markdown';
import { useAIChat } from '@/shared/contexts/AIChatContext';

const formatTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const hasVoiceSupport = typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

/** Parse <<quickreplies>>opt1|opt2|...<</quickreplies>> from message content */
const parseQuickReplies = (content) => {
  const match = content.match(/<<quickreplies>>([\s\S]*?)<<\/quickreplies>>/);
  if (!match) return { text: content, options: null };
  const text = content.replace(/<<quickreplies>>[\s\S]*?<<\/quickreplies>>/, '').trim();
  const options = match[1].split('|').map((o) => o.trim()).filter(Boolean);
  return { text, options };
};

const TypingIndicator = () => (
  <div className="flex items-end gap-2 mb-2">
    <div className="w-7 h-7 rounded-full bg-duotone-blue flex items-center justify-center text-white text-xs font-bold flex-shrink-0">K</div>
    <div className="bg-white/90 backdrop-blur-sm rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm border border-gray-100">
      <div className="flex gap-1.5 items-center">
        <span className="w-1.5 h-1.5 bg-duotone-blue rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-1.5 h-1.5 bg-duotone-blue rounded-full animate-bounce" style={{ animationDelay: '160ms' }} />
        <span className="w-1.5 h-1.5 bg-duotone-blue rounded-full animate-bounce" style={{ animationDelay: '320ms' }} />
      </div>
    </div>
  </div>
);

const WhatsAppChatModal = () => {
  const { isChatOpen, closeChat, messages, sending, send, loadingSession } = useAIChat();
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [attachment, setAttachment] = useState(null); // { file, preview, base64 }
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const recognitionRef = useRef(null);
  const fileInputRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (messages.length > 0 || sending) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, sending]);

  useEffect(() => {
    if (isChatOpen) setTimeout(() => inputRef.current?.focus(), 350);
  }, [isChatOpen]);

  useEffect(() => {
    if (!isChatOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') closeChat(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isChatOpen, closeChat]);

  const handleFileSelect = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    if (file.size > 5 * 1024 * 1024) return; // 5MB max
    const preview = URL.createObjectURL(file);
    const reader = new FileReader();
    reader.onload = () => setAttachment({ file, preview, base64: reader.result });
    reader.readAsDataURL(file);
    e.target.value = '';
  }, []);

  const clearAttachment = useCallback(() => {
    if (attachment?.preview) URL.revokeObjectURL(attachment.preview);
    setAttachment(null);
  }, [attachment]);

  const handleSend = useCallback((text) => {
    const msg = (text ?? input).trim();
    if (!msg && !attachment) return;
    send(msg || 'Analyze this image', attachment?.base64 || null);
    setInput('');
    clearAttachment();
  }, [input, send, attachment, clearAttachment]);

  const startListening = useCallback(() => {
    if (!hasVoiceSupport || isListening) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = 'en-US';
    rec.onresult = (e) => {
      const transcript = Array.from(e.results).map(r => r[0].transcript).join('');
      setInput(transcript);
    };
    rec.onend = () => {
      setIsListening(false);
      setInput((prev) => {
        if (prev.trim()) setTimeout(() => handleSend(prev), 50);
        return prev;
      });
    };
    rec.onerror = () => setIsListening(false);
    recognitionRef.current = rec;
    rec.start();
    setIsListening(true);
  }, [isListening, handleSend]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const MarkdownLink = ({ href, children }) => {
    if (href?.startsWith('/')) {
      return (
        <a href={href} className="underline text-duotone-blue font-medium hover:text-[#008da6]"
          onClick={(e) => { e.preventDefault(); navigate(href); closeChat(); }}>
          {children}
        </a>
      );
    }
    return <a href={href} target="_blank" rel="noopener noreferrer" className="underline text-duotone-blue">{children}</a>;
  };

  if (!isChatOpen) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-end justify-start">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={closeChat} />

      <div className="relative flex flex-col w-full h-full sm:w-[390px] sm:h-[580px] sm:ml-3 sm:mb-3 sm:rounded-2xl overflow-hidden shadow-2xl"
        style={{ animation: 'chatSlideUp 0.25s cubic-bezier(0.34,1.56,0.64,1) both' }}>

        {/* Header — Duotone brand gradient */}
        <div className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, #3b4b50 0%, #435458 50%, #4e5c62 100%)' }}>
          <div className="relative flex-shrink-0">
            <div className="w-10 h-10 rounded-full bg-duotone-blue flex items-center justify-center text-white font-bold text-base shadow-lg">
              K
            </div>
            <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-400 rounded-full border-2 border-antrasit" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-white font-semibold text-[15px] leading-tight font-gotham-medium">Kai</div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[11px] text-gray-300">UKC Assistant</span>
            </div>
          </div>
          <button onClick={closeChat}
            className="w-8 h-8 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Messages — clean light background */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5 bg-slate-50">

          {loadingSession && messages.length === 0 && (
            <div className="flex flex-col gap-3 py-4 animate-pulse">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-end gap-2">
                  <div className="w-7 h-7 rounded-full bg-gray-200" />
                  <div className="bg-gray-200 rounded-2xl rounded-bl-sm h-10 w-48" />
                </div>
              ))}
            </div>
          )}

          {messages.length > 0 && (
            <div className="flex justify-center mb-3">
              <span className="text-[11px] text-gray-500 bg-white rounded-full px-3 py-0.5 shadow-sm border border-gray-100">
                {messages[0]?._restored ? 'Previous conversation' : 'Today'}
              </span>
            </div>
          )}

          {messages.map((m, i) => {
            const isAssistant = m.role === 'assistant';
            const { text: msgText, options: quickReplies } = isAssistant
              ? parseQuickReplies(m.content)
              : { text: m.content, options: null };
            const isLastAssistant = isAssistant && i === messages.length - 1;

            // Show "New messages" separator at the boundary between restored and new messages
            const prevRestored = i > 0 && messages[i - 1]._restored;
            const showNewSeparator = prevRestored && !m._restored;

            return (
              <>
              {showNewSeparator && (
                <div key="new-sep" className="flex justify-center my-2">
                  <span className="text-[11px] text-gray-500 bg-white rounded-full px-3 py-0.5 shadow-sm border border-gray-100">Today</span>
                </div>
              )}
              <div key={i} className={`mb-1.5 ${m.role === 'user' ? '' : ''}`}
                style={{ animation: 'msgFadeIn 0.18s ease both' }}>

                <div className={`flex items-end gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {isAssistant && (
                    <div className="w-7 h-7 rounded-full bg-duotone-blue flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mb-0.5">K</div>
                  )}

                  <div className={`relative max-w-[78%] px-3 pt-2 pb-1.5 text-sm ${
                    m.role === 'user'
                      ? 'bg-duotone-blue text-white rounded-2xl rounded-br-sm shadow-sm'
                      : 'bg-white text-gray-800 rounded-2xl rounded-bl-sm shadow-sm border border-gray-100'
                  }`}>
                    {isAssistant ? (
                      <ReactMarkdown components={{
                        a: MarkdownLink,
                        p: ({ children }) => <p className="mb-1 last:mb-0 leading-relaxed">{children}</p>,
                        ul: ({ children }) => <ul className="list-disc pl-4 mb-1 space-y-0.5">{children}</ul>,
                        ol: ({ children }) => <ol className="list-decimal pl-4 mb-1 space-y-0.5">{children}</ol>,
                        li: ({ children }) => <li>{children}</li>,
                        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                      }}>
                        {msgText}
                      </ReactMarkdown>
                    ) : (
                      <>
                        {m.image && (
                          <img src={m.image} alt="Sent" className="rounded-lg max-w-full mb-1.5" style={{ maxHeight: 180 }} />
                        )}
                        {m.content && <span className="leading-relaxed">{m.content}</span>}
                      </>
                    )}
                    <div className={`flex items-center justify-end gap-1 mt-1 ${m.role === 'user' ? 'text-white/60' : 'text-gray-400'}`}>
                      <span className="text-[10px]">{m.timestamp ? formatTime(m.timestamp) : ''}</span>
                      {m.role === 'user' && (
                        <svg className="w-3.5 h-3 text-white/70" viewBox="0 0 16 11" fill="currentColor">
                          <path d="M11.071.653a.75.75 0 0 1 .048 1.06l-6.5 7a.75.75 0 0 1-1.128-.022l-2.5-3a.75.75 0 0 1 1.156-.964l1.946 2.335 5.918-6.361a.75.75 0 0 1 1.06-.048Z"/>
                          <path d="M14.071.653a.75.75 0 0 1 .048 1.06l-6.5 7a.75.75 0 0 1-1.06.048.75.75 0 0 1-.048-1.06l6.5-7a.75.75 0 0 1 1.06-.048Z"/>
                        </svg>
                      )}
                    </div>
                  </div>
                </div>

                {/* Quick-reply buttons — only on the last assistant message */}
                {quickReplies && isLastAssistant && !sending && (
                  <div className="flex flex-wrap gap-1.5 mt-2 ml-9" style={{ animation: 'msgFadeIn 0.25s ease both' }}>
                    {quickReplies.map((option) => (
                      <button
                        key={option}
                        onClick={() => handleSend(option)}
                        className="px-3.5 py-2 text-[13px] font-medium rounded-xl border border-duotone-blue/30 text-duotone-blue bg-white hover:bg-duotone-blue hover:text-white active:scale-95 transition-all shadow-sm"
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              </>
            );
          })}

          {sending && <TypingIndicator />}
          <div ref={messagesEndRef} />
        </div>

        {/* Listening indicator */}
        {isListening && (
          <div className="flex items-center justify-center gap-2 px-4 py-1.5 bg-red-50 border-t border-red-100 flex-shrink-0">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-xs text-red-600 font-medium">Listening... release to send</span>
          </div>
        )}

        {/* Attachment preview */}
        {attachment && (
          <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border-t border-gray-200 flex-shrink-0">
            <div className="relative">
              <img src={attachment.preview} alt="Attachment" className="w-16 h-16 rounded-lg object-cover border border-gray-200" />
              <button onClick={clearAttachment}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-gray-600 text-white flex items-center justify-center hover:bg-gray-700">
                <XCircleIcon className="w-4 h-4" />
              </button>
            </div>
            <span className="text-xs text-gray-500 truncate">{attachment.file.name}</span>
          </div>
        )}

        {/* Hidden file input */}
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />

        {/* Input bar — brand styled */}
        <div className="flex items-center gap-2 px-3 py-2.5 bg-white border-t border-gray-200 flex-shrink-0">
          <button onClick={() => fileInputRef.current?.click()}
            disabled={sending}
            className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-duotone-blue hover:bg-slate-100 transition-colors flex-shrink-0 disabled:opacity-40"
            title="Attach image">
            <PaperClipIcon className="w-5 h-5" />
          </button>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="Message Kai..."
            disabled={sending || isListening}
            className="flex-1 px-4 py-2 bg-slate-50 rounded-full text-sm text-gray-800 placeholder-gray-400 outline-none border border-gray-200 focus:border-duotone-blue/40 focus:ring-1 focus:ring-duotone-blue/20 transition-colors"
          />

          {(input.trim() || attachment) ? (
            <button onClick={() => handleSend()}
              disabled={sending}
              className="w-10 h-10 rounded-full bg-duotone-blue text-white flex items-center justify-center hover:bg-[#008da6] active:scale-90 transition-all disabled:opacity-40 flex-shrink-0 shadow-sm">
              <PaperAirplaneIcon className="w-4 h-4" />
            </button>
          ) : hasVoiceSupport ? (
            <button
              onPointerDown={startListening}
              onPointerUp={stopListening}
              onPointerCancel={stopListening}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all flex-shrink-0 shadow-sm select-none ${
                isListening
                  ? 'bg-red-500 text-white scale-110'
                  : 'bg-duotone-blue text-white hover:bg-[#008da6] active:scale-90'
              }`}
              title="Hold to speak"
            >
              <MicrophoneIcon className="w-5 h-5" />
            </button>
          ) : null}
        </div>
      </div>

      <style>{`
        @keyframes chatSlideUp {
          from { opacity: 0; transform: translateY(20px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)    scale(1); }
        }
        @keyframes msgFadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default WhatsAppChatModal;
