import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  FormOutlined,
  MailOutlined,
  WhatsAppOutlined,
  MessageOutlined,
  RobotOutlined,
} from '@ant-design/icons';
import { useAIChat } from '@/shared/contexts/AIChatContext';

const SupportChannelPicker = ({ onOpenTicketForm }) => {
  const navigate = useNavigate();
  const { t } = useTranslation(['student']);
  const { openChat } = useAIChat();

  const channels = [
    {
      key: 'ticket',
      label: t('student:support.channelPicker.channels.ticket.label'),
      description: t('student:support.channelPicker.channels.ticket.description'),
      icon: FormOutlined,
      color: 'text-sky-600 bg-sky-50',
    },
    {
      key: 'email',
      label: t('student:support.channelPicker.channels.email.label'),
      description: t('student:support.channelPicker.channels.email.description'),
      icon: MailOutlined,
      color: 'text-indigo-600 bg-indigo-50',
    },
    {
      key: 'whatsapp',
      label: t('student:support.channelPicker.channels.whatsapp.label'),
      description: t('student:support.channelPicker.channels.whatsapp.description'),
      icon: WhatsAppOutlined,
      color: 'text-emerald-600 bg-emerald-50',
    },
    {
      key: 'chat',
      label: t('student:support.channelPicker.channels.chat.label'),
      description: t('student:support.channelPicker.channels.chat.description'),
      icon: MessageOutlined,
      color: 'text-amber-600 bg-amber-50',
    },
    {
      key: 'kai',
      label: t('student:support.channelPicker.channels.kai.label'),
      description: t('student:support.channelPicker.channels.kai.description'),
      icon: RobotOutlined,
      color: 'text-violet-600 bg-violet-50',
    },
  ];

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
        {t('student:support.channelPicker.heading')}
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
