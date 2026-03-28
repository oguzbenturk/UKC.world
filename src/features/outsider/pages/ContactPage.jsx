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
    value: '+90 507 138 91 96',
    description: 'Fastest response. Message us any time.',
    href: 'https://wa.me/905071389196',
    color: 'text-[#25D366]',
    bg: 'bg-[#25D366]/5 border-[#25D366]/10 hover:border-[#25D366]/30',
    btnClass: '!bg-[#25D366] !border-none hover:opacity-90',
    btnLabel: 'Open WhatsApp',
  },
  {
    key: 'email',
    icon: <MailOutlined className="text-3xl" />,
    label: 'Email',
    value: 'ukcturkey@gmail.com',
    description: 'For detailed enquiries, bookings, and partnerships.',
    href: 'mailto:ukcturkey@gmail.com',
    color: 'text-[#00a8c4]',
    bg: 'bg-[#00a8c4]/5 border-[#00a8c4]/10 hover:border-[#00a8c4]/30',
    btnClass: '!bg-[#00a8c4] !border-none hover:opacity-90',
    btnLabel: 'Send Email',
  },
  {
    key: 'instagram',
    icon: <InstagramOutlined className="text-3xl" />,
    label: 'Instagram',
    value: '@urlakitecenter',
    description: 'Follow us for daily conditions, videos, and news.',
    href: 'https://instagram.com/urlakitecenter',
    color: 'text-[#E1306C]',
    bg: 'bg-[#E1306C]/5 border-[#E1306C]/10 hover:border-[#E1306C]/30',
    btnClass: '!bg-[#E1306C] !border-none hover:opacity-90',
    btnLabel: 'Visit Instagram',
  },
  {
    key: 'phone',
    icon: <PhoneOutlined className="text-3xl" />,
    label: 'Phone',
    value: '+90 507 138 91 96',
    description: 'Give us a call during school hours.',
    href: 'tel:+905071389196',
    color: 'text-[#8b5cf6]',
    bg: 'bg-[#8b5cf6]/5 border-[#8b5cf6]/10 hover:border-[#8b5cf6]/30',
    btnClass: '!bg-[#8b5cf6] !border-none hover:opacity-90',
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
        <div className="absolute inset-0 bg-gradient-to-br from-[#00a8c4]/5 via-transparent to-white/5 pointer-events-none" />
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-16 relative z-10 text-center">
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-duotone-bold-extended mb-6 tracking-tight">
            We&apos;d love to hear from you
          </h1>
          <p className="text-gray-400 text-lg sm:text-xl max-w-2xl mx-auto font-duotone-regular">
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
          <a 
            href="https://www.google.com/maps/place/URLA+KITE+CENTER+-+U+K+C/@38.331293,26.6346796,15z/data=!4m10!1m2!2m1!1sDuotone+Pro+Center+Urla!3m6!1s0x14bb90e11e890789:0x7e293042b26fdc!8m2!3d38.331293!4d26.653734!15sChdEdW90b25lIFBybyBDZW50ZXIgVXJsYVoZIhdkdW90b25lIHBybyBjZW50ZXIgdXJsYZIBCWtpdGVfc2hvcJoBI0NoWkRTVWhOTUc5blMwVkpRMEZuU1VSeWRVOWZRV05SRUFF4AEA-gEFCNIHEEc!16s%2Fg%2F11clyt0vxn?entry=ttu&g_ep=EgoyMDI2MDMyNC4wIKXMDSoASAFQAw%3D%3D"
            target="_blank"
            rel="noopener noreferrer"
            className="flex gap-4 items-start p-6 rounded-2xl bg-white/5 border border-white/8 hover:border-white/20 transition-all cursor-pointer no-underline group"
          >
            <EnvironmentOutlined className="text-2xl text-white mt-0.5 flex-shrink-0 group-hover:text-[#00a8c4] transition-colors" />
            <div>
              <p className="text-xs font-duotone-bold uppercase tracking-widest text-[#00a8c4] mb-1">Find Us</p>
              <p className="text-white font-duotone-bold text-lg mb-1 group-hover:text-[#00a8c4] transition-colors">Duotone Pro Center Urla</p>
              <p className="text-gray-400 text-sm leading-relaxed font-duotone-regular">
                Urla, İzmir — Turkey<br />
                Right on the waterfront.
              </p>
            </div>
          </a>

          <div className="flex gap-4 items-start p-6 rounded-2xl bg-white/5 border border-white/8">
            <ClockCircleOutlined className="text-2xl text-white mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-duotone-bold uppercase tracking-widest text-[#00a8c4] mb-1">School Hours</p>
              <p className="text-white font-duotone-bold text-lg mb-1">Every Day</p>
              <p className="text-gray-400 text-sm leading-relaxed font-duotone-regular">
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
