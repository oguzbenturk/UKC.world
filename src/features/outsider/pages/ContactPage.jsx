import { Button } from 'antd';
import {
  MailOutlined,
  EnvironmentOutlined,
  InstagramOutlined,
  WhatsAppOutlined,
  PhoneOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { usePageSEO } from '@/shared/utils/seo';

const CONTACT_CHANNELS = [
  {
    key: 'whatsapp',
    icon: <WhatsAppOutlined className="text-3xl" />,
    label: 'WhatsApp',
    value: '+90 530 000 00 00',
    description: 'Fastest response. Message us any time.',
    href: 'https://wa.me/905300000000',
    color: 'text-green-400',
    bg: 'bg-green-500/10 border-green-500/20 hover:border-green-400/50',
    btnClass: '!bg-green-600 !border-none hover:!bg-green-500',
    btnLabel: 'Open WhatsApp',
  },
  {
    key: 'email',
    icon: <MailOutlined className="text-3xl" />,
    label: 'Email',
    value: 'info@ukc.world',
    description: 'For detailed enquiries, bookings, and partnerships.',
    href: 'mailto:info@ukc.world',
    color: 'text-sky-400',
    bg: 'bg-sky-500/10 border-sky-500/20 hover:border-sky-400/50',
    btnClass: '!bg-sky-600 !border-none hover:!bg-sky-500',
    btnLabel: 'Send Email',
  },
  {
    key: 'instagram',
    icon: <InstagramOutlined className="text-3xl" />,
    label: 'Instagram',
    value: '@ukc.world',
    description: 'Follow us for daily conditions, videos, and news.',
    href: 'https://instagram.com/ukc.world',
    color: 'text-pink-400',
    bg: 'bg-pink-500/10 border-pink-500/20 hover:border-pink-400/50',
    btnClass: '!bg-pink-600 !border-none hover:!bg-pink-500',
    btnLabel: 'Visit Instagram',
  },
  {
    key: 'phone',
    icon: <PhoneOutlined className="text-3xl" />,
    label: 'Phone',
    value: '+90 530 000 00 00',
    description: 'Give us a call during school hours.',
    href: 'tel:+905300000000',
    color: 'text-violet-400',
    bg: 'bg-violet-500/10 border-violet-500/20 hover:border-violet-400/50',
    btnClass: '!bg-violet-600 !border-none hover:!bg-violet-500',
    btnLabel: 'Call Now',
  },
];

const ContactPage = () => {
  usePageSEO({
    title: 'Contact Us | UKC World',
    description: 'Get in touch with the UKC team. WhatsApp, email, phone or Instagram — we\'re always available.',
  });

  return (
    <div className="bg-[#0d1511] min-h-screen text-white font-sans pb-20 selection:bg-emerald-400/30">

      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-900/30 via-transparent to-cyan-900/10 pointer-events-none" />
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-14 relative z-10 text-center">
          <span className="inline-block bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold tracking-widest px-4 py-1.5 rounded-full mb-6 uppercase">
            Get In Touch
          </span>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold mb-4 tracking-tight">
            We&apos;d love to hear from you
          </h1>
          <p className="text-gray-400 text-lg sm:text-xl max-w-2xl mx-auto">
            Whether you have a question about lessons, rentals, availability, or just want to say hi — reach out through any of the channels below.
          </p>
        </div>
      </div>

      {/* Contact Cards */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
          {CONTACT_CHANNELS.map((ch) => (
            <a
              key={ch.key}
              href={ch.href}
              target={ch.key !== 'phone' && ch.key !== 'email' ? '_blank' : undefined}
              rel="noopener noreferrer"
              className={`group flex flex-col gap-4 p-6 sm:p-7 rounded-2xl border bg-white/5 backdrop-blur-sm transition-all duration-200 ${ch.bg} no-underline`}
            >
              <div className={`${ch.color}`}>{ch.icon}</div>
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1">{ch.label}</p>
                <p className="text-xl font-bold text-white mb-1">{ch.value}</p>
                <p className="text-sm text-gray-400 leading-relaxed">{ch.description}</p>
              </div>
              <Button
                type="primary"
                size="large"
                className={`!h-11 !rounded-xl !font-semibold !text-sm w-full sm:w-auto self-start ${ch.btnClass}`}
              >
                {ch.btnLabel}
              </Button>
            </a>
          ))}
        </div>
      </div>

      {/* Location + Hours */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 mt-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
          <div className="flex gap-4 items-start p-6 rounded-2xl bg-white/5 border border-white/8">
            <EnvironmentOutlined className="text-2xl text-emerald-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1">Find Us</p>
              <p className="text-white font-semibold text-lg mb-1">Duotone Pro Center Urla</p>
              <p className="text-gray-400 text-sm leading-relaxed">
                Urla, İzmir — Turkey<br />
                Right on the waterfront.
              </p>
            </div>
          </div>

          <div className="flex gap-4 items-start p-6 rounded-2xl bg-white/5 border border-white/8">
            <ClockCircleOutlined className="text-2xl text-emerald-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1">School Hours</p>
              <p className="text-white font-semibold text-lg mb-1">Every Day</p>
              <p className="text-gray-400 text-sm leading-relaxed">
                09:00 – 18:00<br />
                Wind &amp; weather dependent.
              </p>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
};

export default ContactPage;
