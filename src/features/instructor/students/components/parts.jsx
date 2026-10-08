// Small building blocks shared by the students list and the student profile.
import { useState } from 'react';
import { Drawer, Modal } from 'antd';
import { useTranslation } from 'react-i18next';
import { initials } from '../../earnings/earningsFormat';
import { BRAND_MARK } from '../../earnings/components/earningsStyles';
import { avatarTone, capitalize } from '../studentsFormat';

const AVATAR_SIZES = {
  sm: 'h-10 w-10 rounded-xl text-sm',
  md: 'h-12 w-12 rounded-2xl text-base',
  lg: 'h-16 w-16 rounded-2xl text-xl lg:h-20 lg:w-20 lg:rounded-3xl lg:text-2xl',
};

/** Profile photo when there is one, otherwise initials on a stable tint. */
export function StudentAvatar({ name, src, size = 'md' }) {
  const [broken, setBroken] = useState(false);
  const dims = AVATAR_SIZES[size] || AVATAR_SIZES.md;
  if (src && !broken) {
    return (
      <img
        src={src}
        alt=""
        aria-hidden="true"
        loading="lazy"
        onError={() => setBroken(true)}
        className={`shrink-0 object-cover ${dims}`}
      />
    );
  }
  return (
    <span aria-hidden="true" className={`flex shrink-0 items-center justify-center font-bold ${avatarTone(name)} ${dims}`}>
      {initials(name)}
    </span>
  );
}

export function LevelBadge({ level, className = '' }) {
  const { t } = useTranslation(['instructor']);
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${level ? 'bg-indigo-50 text-indigo-800' : 'bg-slate-100 text-slate-600'} ${className}`}>
      {level ? capitalize(level) : t('instructor:students.levelUnset')}
    </span>
  );
}

/**
 * Package hours ring: used share as the arc, remaining hours in the middle.
 * Low balance turns the arc amber (the label carries the meaning too).
 */
export function PackageRing({ total, remaining, low = false, size = 44, stroke = 4, children }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const used = total > 0 ? Math.min(Math.max((total - remaining) / total, 0), 1) : 0;
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={low ? '#d97706' : BRAND_MARK}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - used)}
          className="motion-safe:transition-[stroke-dashoffset] motion-safe:duration-700"
        />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center leading-none">{children}</span>
    </span>
  );
}

/** Bottom sheet on mobile, centered modal on desktop (same as the payout flow). */
export function Sheet({ open, onClose, title, isDesktop, width = 480, children }) {
  if (isDesktop) {
    return (
      <Modal open={open} onCancel={onClose} footer={null} title={title} width={width} centered destroyOnHidden>
        {children}
      </Modal>
    );
  }
  return (
    <Drawer
      open={open}
      onClose={onClose}
      placement="bottom"
      height="auto"
      title={title}
      destroyOnHidden
      styles={{
        content: { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '92vh' },
        body: { padding: 0, paddingBottom: 'env(safe-area-inset-bottom, 0px)' },
      }}
    >
      {children}
    </Drawer>
  );
}

export const fieldClass = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-500 focus:border-[#00798c] focus:outline-none focus:ring-2 focus:ring-[#00798c]/40';
export const labelClass = 'text-xs font-semibold uppercase tracking-wide text-slate-600';
