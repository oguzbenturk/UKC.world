import { useState } from 'react';
import { Card, Input, Button, Tooltip, Tag } from 'antd';
import { SendOutlined, InfoCircleOutlined } from '@ant-design/icons';

const starterPrompts = [
  'Show me how to set booking defaults and durations',
  'Create a new popup that shows on first login only',
  'Explain cash vs accrual settings and where they apply',
  'Import customers from CSV and map the columns',
  'Why did my payment fee not calculate? Diagnose and fix',
  'Set up roles so instructors can view bookings only',
];

const AIAssistantPanel = () => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content:
        "Hi! I'm your in-app assistant. Ask me anything about Plannivo — I can guide you through tasks, explain settings, or generate step-by-step actions.",
    },
  ]);
  const [sending, setSending] = useState(false);

  const send = async (text) => {
    if (!text?.trim()) return;
    const userMsg = { role: 'user', content: text.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setSending(true);
    try {
      // Placeholder AI behavior; integrate with your backend later
      // e.g., POST /api/assistant { messages }
      await new Promise((r) => setTimeout(r, 500));
      const reply = {
        role: 'assistant',
        content:
          'Thanks! I will analyze your request and propose steps. (Demo mode) — Connect me to your backend to action this automatically.',
      };
      setMessages((prev) => [...prev, reply]);
    } finally {
      setSending(false);
    }
  };

  return (
    <Card title="Plannivo Assistant (AI)" size="small" className="h-full">
      <div className="flex items-center gap-2 mb-3 text-slate-600">
        <InfoCircleOutlined />
        <span className="text-sm">Type a question or pick a prompt to get started.</span>
      </div>

      <div className="flex flex-wrap gap-1 mb-3">
        {starterPrompts.map((p) => (
          <Tag key={p} color="blue" onClick={() => send(p)} className="cursor-pointer">
            {p}
          </Tag>
        ))}
      </div>

      <div className="border rounded-md h-56 overflow-y-auto p-3 bg-white mb-3">
        {messages.map((m) => (
          <div key={`${m.role}-${m.content.slice(0, 24)}-${m.content.length}`} className={`mb-2 ${m.role === 'user' ? 'text-right' : 'text-left'}`}>
            <div
              className={`inline-block px-3 py-2 rounded-lg text-sm ${
                m.role === 'user' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-800'
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="Ask me anything…"
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
