import { useState } from 'react';
import { Card, Input, Button, Tooltip, Tag } from 'antd';
import { SendOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import apiClient from '@/shared/services/apiClient';

const starterPrompts = [
  'How do I book a kite lesson?',
  'Where can I check my wallet balance?',
  'What rental equipment is available?',
  'How do I contact support?',
  'Tell me about accommodation options',
  'How do group bookings work?',
];

const AIAssistantPanel = () => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content:
        "Hi! I'm your Plannivo assistant. Ask me anything about lessons, bookings, rentals, accommodation, or how to use the platform. I can guide you to the right page!",
    },
  ]);
  const [sending, setSending] = useState(false);
  const navigate = useNavigate();

  const send = async (text) => {
    if (!text?.trim()) return;
    const userMsg = { role: 'user', content: text.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setSending(true);
    try {
      const { data } = await apiClient.post('/assistant', {
        message: text.trim(),
        conversationHistory: messages,
      });
      setMessages((prev) => [...prev, { role: 'assistant', content: data.response }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content:
            "Sorry, I couldn't process your request right now. Please try again or contact support via WhatsApp at **+90 507 138 91 96**.",
        },
      ]);
    } finally {
      setSending(false);
    }
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

  return (
    <Card title="Plannivo Assistant" size="small" className="h-full">
      <div className="flex items-center gap-2 mb-3 text-slate-600">
        <InfoCircleOutlined />
        <span className="text-sm">Ask a question or pick a topic below.</span>
      </div>

      <div className="flex flex-wrap gap-1 mb-3">
        {starterPrompts.map((p) => (
          <Tag key={p} color="blue" onClick={() => send(p)} className="cursor-pointer">
            {p}
          </Tag>
        ))}
      </div>

      <div className="border rounded-md h-64 overflow-y-auto p-3 bg-white mb-3">
        {messages.map((m, i) => (
          <div key={i} className={`mb-2 ${m.role === 'user' ? 'text-right' : 'text-left'}`}>
            <div
              className={`inline-block px-3 py-2 rounded-lg text-sm max-w-[85%] text-left ${
                m.role === 'user' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-800'
              }`}
            >
              {m.role === 'assistant' ? (
                <ReactMarkdown
                  components={{
                    a: MarkdownLink,
                    p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
                    ul: ({ children }) => <ul className="list-disc pl-4 mb-1">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal pl-4 mb-1">{children}</ol>,
                    li: ({ children }) => <li className="mb-0.5">{children}</li>,
                  }}
                >
                  {m.content}
                </ReactMarkdown>
              ) : (
                m.content
              )}
            </div>
          </div>
        ))}
        {sending && (
          <div className="text-left mb-2">
            <div className="inline-block px-3 py-2 rounded-lg text-sm bg-slate-100 text-slate-500">
              Thinking...
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="Ask me anything..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onPressEnter={() => send(input)}
          disabled={sending}
        />
        <Tooltip title="Send">
          <Button type="primary" icon={<SendOutlined />} onClick={() => send(input)} loading={sending} />
        </Tooltip>
      </div>
    </Card>
  );
};

export default AIAssistantPanel;
