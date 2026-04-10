import { useNavigate } from 'react-router-dom';
import {
  FormOutlined,
  MailOutlined,
  WhatsAppOutlined,
  MessageOutlined,
  RobotOutlined,
} from '@ant-design/icons';
import { useAIChat } from '@/shared/contexts/AIChatContext';

const channels = [
  {
    key: 'ticket',
    label: 'New Ticket',
    description: 'Open a support request',
    icon: FormOutlined,
    color: 'text-sky-600 bg-sky-50',
  },
  {
    key: 'email',
    label: 'Email Us',
    description: 'hello@plannivo.com',
    icon: MailOutlined,
    color: 'text-indigo-600 bg-indigo-50',
  },
  {
    key: 'whatsapp',
    label: 'WhatsApp',
    description: 'Chat on WhatsApp',
    icon: WhatsAppOutlined,
    color: 'text-emerald-600 bg-emerald-50',
  },
  {
    key: 'chat',
    label: 'Live Chat',
    description: 'Chat with the team',
    icon: MessageOutlined,
    color: 'text-amber-600 bg-amber-50',
  },
  {
    key: 'kai',
    label: 'Ask Kai',
    description: 'Get instant AI answers',
    icon: RobotOutlined,
    color: 'text-violet-600 bg-violet-50',
  },
];

const SupportChannelPicker = ({ onOpenTicketForm }) => {
  const navigate = useNavigate();
  const { openChat } = useAIChat();

  const handleClick = (key) => {
    switch (key) {
      case 'ticket':
        onOpenTicketForm?.();
        break;
      case 'email':
        window.open('mailto:hello@plannivo.com', '_self');
        break;
      case 'whatsapp':
        window.open('https://wa.me/905071389196', '_blank');
        break;
      case 'chat':
        navigate('/chat');
        break;
      case 'kai':
        openChat();
        break;
    }
  };

  return (
    <section>
      <h3 className="mb-3 font-duotone-bold text-sm uppercase tracking-[0.12em] text-antrasit">
        Get help
      </h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {channels.map(({ key, label, description, icon: Icon, color }) => (
          <button
            key={key}
            type="button"
            onClick={() => handleClick(key)}
            className="flex flex-col items-center gap-2 rounded-2xl border border-slate-100 bg-white px-3 py-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${color}`}>
              <Icon className="text-lg" />
            </span>
            <span className="font-gotham-medium text-[11px] text-slate-700">{label}</span>
            <span className="text-[10px] text-slate-400 leading-tight text-center">{description}</span>
          </button>
        ))}
      </div>
    </section>
  );
};

export default SupportChannelPicker;
