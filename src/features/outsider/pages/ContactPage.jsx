import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from 'antd';
import {
  MailOutlined,
  EnvironmentOutlined,
  InstagramOutlined,
  WhatsAppOutlined,
  PhoneOutlined,
  ClockCircleOutlined,
  DownOutlined,
} from '@ant-design/icons';
import { usePageSEO } from '@/shared/utils/seo';

const ContactDropdown = ({ channel }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div
      ref={ref}
      className={`group relative flex flex-col gap-4 p-6 sm:p-7 rounded-2xl border bg-white/5 backdrop-blur-sm transition-all duration-200 ${channel.bg}`}
    >
      <div className={channel.color}>{channel.icon}</div>
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1">{channel.label}</p>
        <p className="text-xl font-bold text-white mb-1">{channel.value}</p>
        <p className="text-sm text-gray-400 leading-relaxed">{channel.description}</p>
      </div>
      <Button
        type="primary"
        size="large"
        className={`!h-11 !rounded-xl !font-semibold !text-sm w-full sm:w-auto self-start ${channel.btnClass}`}
        onClick={() => setOpen((prev) => !prev)}
      >
        {channel.btnLabel} <DownOutlined className="text-xs ml-1" />
      </Button>

      {open && (
        <div className="absolute left-4 right-4 bottom-0 translate-y-[calc(100%+8px)] z-50 rounded-xl border border-white/15 bg-[#1a1f2e]/95 shadow-xl backdrop-blur-md overflow-hidden">
          {channel.dropdown.map((opt) => (
            <a
              key={opt.href}
              href={opt.href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className="flex items-center justify-between gap-3 px-4 py-3 text-sm no-underline transition-colors hover:bg-white/10"
            >
              <div>
                <span className="font-semibold text-white">{opt.label}</span>
                {opt.value && <span className="ml-2 text-xs text-gray-400">{opt.value}</span>}
              </div>
              <span className={`text-lg ${channel.color}`}>{channel.icon}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
};

const ContactPage = () => {
  const { t } = useTranslation(['outsider']);

  usePageSEO({
    title: 'Contact Us | UKC World',
    description: 'Get in touch with the UKC team. WhatsApp, email, phone or Instagram — we\'re always available.',
  });

  const WHATSAPP_OPTIONS = [
    { label: t('outsider:contact.whatsappOptions.shop'), value: '+90 539 952 90 28', href: 'https://wa.me/905399529028' },
    { label: t('outsider:contact.whatsappOptions.school'), value: '+90 507 138 91 96', href: 'https://wa.me/905071389196' },
  ];

  const INSTAGRAM_OPTIONS = [
    { label: t('outsider:contact.instagramOptions.dpc'), value: '@dpc_urla', href: 'https://instagram.com/dpc_urla' },
    { label: t('outsider:contact.instagramOptions.urla'), value: '@urlakitecenter', href: 'https://instagram.com/urlakitecenter' },
    { label: t('outsider:contact.instagramOptions.shop'), value: '@ukc_shop', href: 'https://instagram.com/ukc_shop' },
  ];

  const CONTACT_CHANNELS = [
    {
      key: 'whatsapp',
      icon: <WhatsAppOutlined className="text-3xl" />,
      label: t('outsider:contact.channels.whatsapp.label'),
      value: t('outsider:contact.channels.whatsapp.value'),
      description: t('outsider:contact.channels.whatsapp.description'),
      color: 'text-[#25D366]',
      bg: 'bg-[#25D366]/5 border-[#25D366]/10 hover:border-[#25D366]/30',
      btnClass: '!bg-[#25D366] !border-none hover:opacity-90',
      btnLabel: t('outsider:contact.channels.whatsapp.btnLabel'),
      dropdown: WHATSAPP_OPTIONS,
    },
    {
      key: 'email',
      icon: <MailOutlined className="text-3xl" />,
      label: t('outsider:contact.channels.email.label'),
      value: t('outsider:contact.channels.email.value'),
      description: t('outsider:contact.channels.email.description'),
      href: 'mailto:ukcturkey@gmail.com',
      color: 'text-[#00a8c4]',
      bg: 'bg-[#00a8c4]/5 border-[#00a8c4]/10 hover:border-[#00a8c4]/30',
      btnClass: '!bg-[#00a8c4] !border-none hover:opacity-90',
      btnLabel: t('outsider:contact.channels.email.btnLabel'),
    },
    {
      key: 'instagram',
      icon: <InstagramOutlined className="text-3xl" />,
      label: t('outsider:contact.channels.instagram.label'),
      value: t('outsider:contact.channels.instagram.value'),
      description: t('outsider:contact.channels.instagram.description'),
      color: 'text-[#E1306C]',
      bg: 'bg-[#E1306C]/5 border-[#E1306C]/10 hover:border-[#E1306C]/30',
      btnClass: '!bg-[#E1306C] !border-none hover:opacity-90',
      btnLabel: t('outsider:contact.channels.instagram.btnLabel'),
      dropdown: INSTAGRAM_OPTIONS,
    },
    {
      key: 'phone',
      icon: <PhoneOutlined className="text-3xl" />,
      label: t('outsider:contact.channels.phone.label'),
      value: t('outsider:contact.channels.phone.value'),
      description: t('outsider:contact.channels.phone.description'),
      href: 'tel:+905071389196',
      color: 'text-[#8b5cf6]',
      bg: 'bg-[#8b5cf6]/5 border-[#8b5cf6]/10 hover:border-[#8b5cf6]/30',
      btnClass: '!bg-[#8b5cf6] !border-none hover:opacity-90',
      btnLabel: t('outsider:contact.channels.phone.btnLabel'),
    },
  ];

  return (
    <div className="bg-[#0d1511] min-h-screen text-white font-sans pb-20 selection:bg-emerald-400/30">

      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#00a8c4]/5 via-transparent to-white/5 pointer-events-none" />
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-16 relative z-10 text-center">
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-duotone-bold-extended mb-6 tracking-tight">
            {t('outsider:contact.hero.title')}
          </h1>
          <p className="text-gray-400 text-lg sm:text-xl max-w-2xl mx-auto font-duotone-regular">
            {t('outsider:contact.hero.subtitle')}
          </p>
        </div>
      </div>

      {/* Contact Cards */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
          {CONTACT_CHANNELS.map((ch) =>
            ch.dropdown ? (
              <ContactDropdown key={ch.key} channel={ch} />
            ) : (
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
            )
          )}
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
              <p className="text-xs font-duotone-bold uppercase tracking-widest text-[#00a8c4] mb-1">
                {t('outsider:contact.location.heading')}
              </p>
              <p className="text-white font-duotone-bold text-lg mb-1 group-hover:text-[#00a8c4] transition-colors">
                {t('outsider:contact.location.name')}
              </p>
              <p className="text-gray-400 text-sm leading-relaxed font-duotone-regular">
                {t('outsider:contact.location.address')}<br />
                {t('outsider:contact.location.note')}
              </p>
            </div>
          </a>

          <div className="flex gap-4 items-start p-6 rounded-2xl bg-white/5 border border-white/8">
            <ClockCircleOutlined className="text-2xl text-white mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-duotone-bold uppercase tracking-widest text-[#00a8c4] mb-1">
                {t('outsider:contact.hours.heading')}
              </p>
              <p className="text-white font-duotone-bold text-lg mb-1">
                {t('outsider:contact.hours.days')}
              </p>
              <p className="text-gray-400 text-sm leading-relaxed font-duotone-regular">
                {t('outsider:contact.hours.time')}<br />
                {t('outsider:contact.hours.note')}
              </p>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
};

export default ContactPage;
