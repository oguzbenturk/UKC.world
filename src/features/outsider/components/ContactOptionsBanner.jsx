import { useState, useRef, useEffect } from 'react';
import { WhatsAppOutlined, InstagramOutlined, FacebookOutlined, DownOutlined } from '@ant-design/icons';

const INSTAGRAM_OPTIONS = [
  { label: 'Plannivo', href: 'https://instagram.com/plannivo' },
];

const WHATSAPP_OPTIONS = [
  { label: 'Shop inquiries', href: 'https://wa.me/905399529028' },
  { label: 'School inquiries', href: 'https://wa.me/905071389196' },
];

const DropdownButton = ({ icon, label, color, bg, border, options, variant }) => {
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
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-duotone-bold transition-all duration-150 hover:scale-105 hover:brightness-110 cursor-pointer"
        style={{ color, background: bg, border: `1px solid ${border}` }}
      >
        <span className="text-lg leading-none">{icon}</span>
        <span className="hidden sm:inline">{label}</span>
        <DownOutlined className="text-[10px] opacity-60" />
      </button>

      {open && (
        <div
          className={`absolute left-1/2 -translate-x-1/2 z-50 mt-2 min-w-[180px] rounded-xl border shadow-xl backdrop-blur-md ${
            variant === 'light'
              ? 'border-slate-200 bg-white'
              : 'border-white/15 bg-[#1a1f2e]/95'
          }`}
        >
          {options.map((opt) => (
            <a
              key={opt.href}
              href={opt.href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-duotone-regular no-underline transition-colors first:rounded-t-xl last:rounded-b-xl ${
                variant === 'light'
                  ? 'text-slate-700 hover:bg-slate-50'
                  : 'text-white/80 hover:bg-white/10 hover:text-white'
              }`}
            >
              <span className="text-base leading-none" style={{ color }}>{icon}</span>
              {opt.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
};

const FACEBOOK_OPTION = {
  key: 'facebook',
  label: 'Facebook',
  href: 'https://facebook.com/plannivo',
  icon: <FacebookOutlined />,
  color: '#1877F2',
  bg: 'rgba(24,119,242,0.10)',
  border: 'rgba(24,119,242,0.25)',
};

// variant: 'dark' (default, white text) | 'light' (for white/light backgrounds)
const ContactOptionsBanner = ({ variant = 'dark' }) => (
  <div className="mt-6 flex flex-col items-center gap-3">
    <p className={`text-sm font-duotone-regular tracking-wide ${variant === 'light' ? 'text-slate-400' : 'text-white/40'}`}>Or reach us directly</p>
    <div className="flex items-center gap-3">
      <DropdownButton
        icon={<WhatsAppOutlined />}
        label="WhatsApp"
        color="#25D366"
        bg="rgba(37,211,102,0.10)"
        border="rgba(37,211,102,0.25)"
        options={WHATSAPP_OPTIONS}
        variant={variant}
      />
      <a
        href={FACEBOOK_OPTION.href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={FACEBOOK_OPTION.label}
        className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-duotone-bold transition-all duration-150 hover:scale-105 hover:brightness-110 no-underline"
        style={{
          color: FACEBOOK_OPTION.color,
          background: FACEBOOK_OPTION.bg,
          border: `1px solid ${FACEBOOK_OPTION.border}`,
        }}
      >
        <span className="text-lg leading-none">{FACEBOOK_OPTION.icon}</span>
        <span className="hidden sm:inline">{FACEBOOK_OPTION.label}</span>
      </a>
      <DropdownButton
        icon={<InstagramOutlined />}
        label="Instagram"
        color="#E1306C"
        bg="rgba(225,48,108,0.10)"
        border="rgba(225,48,108,0.25)"
        options={INSTAGRAM_OPTIONS}
        variant={variant}
      />
    </div>
  </div>
);

export default ContactOptionsBanner;
