// Small building blocks shared by the Members page sections.
// Status is always icon + text (never colour alone).
import { useTranslation } from 'react-i18next';
import { CheckIcon, ClockIcon } from '@/features/instructor/earnings/components/EarningsIcons';
import { initials } from '@/features/instructor/earnings/earningsFormat';
import { daysUntil, memberState } from '../../membersFormat';

const chipBase = 'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap';

const CrossIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
);
const ArrowIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);

/** "◷ 3 days left" / "✕ Expired 10 days ago" / "→ Starts in 2 days" / "✓ Active · 91 days". */
export function MemberStatusChip({ purchase }) {
  const { t } = useTranslation(['admin']);
  const state = memberState(purchase);
  const left = daysUntil(purchase.expires_at);
  const startsIn = daysUntil(purchase.purchased_at);
  if (state === 'expiring') {
    return (
      <span className={`${chipBase} bg-amber-50 text-amber-900`}>
        <ClockIcon size={12} />
        {left <= 0 ? t('admin:membersPage.state.endsToday') : left === 1 ? t('admin:membersPage.state.endsTomorrow') : t('admin:membersPage.state.daysLeft', { count: left })}
      </span>
    );
  }
  if (state === 'expired') {
    const ago = Math.max(-(left ?? 0), 0);
    return (
      <span className={`${chipBase} bg-slate-100 text-slate-700`}>
        <CrossIcon />
        {ago === 0 ? t('admin:membersPage.state.expiredToday') : t('admin:membersPage.state.expiredAgo', { count: ago })}
      </span>
    );
  }
  if (state === 'upcoming') {
    return (
      <span className={`${chipBase} bg-sky-50 text-sky-800`}>
        <ArrowIcon />
        {t('admin:membersPage.state.startsIn', { count: startsIn })}
      </span>
    );
  }
  if (state === 'pending') {
    return (
      <span className={`${chipBase} bg-amber-50 text-amber-900`}>
        <ClockIcon size={12} />
        {t('admin:membersPage.state.pending')}
      </span>
    );
  }
  if (state === 'cancelled') {
    return (
      <span className={`${chipBase} bg-rose-50 text-rose-800`}>
        <CrossIcon />
        {t('admin:membersPage.state.cancelled')}
      </span>
    );
  }
  return (
    <span className={`${chipBase} bg-emerald-50 text-emerald-800`}>
      <CheckIcon size={12} />
      {left == null ? t('admin:membersPage.state.activeNoEnd') : t('admin:membersPage.state.activeDays', { count: left })}
    </span>
  );
}

const TONES = ['bg-cyan-50 text-[#00687a]', 'bg-indigo-50 text-indigo-800', 'bg-amber-50 text-amber-900', 'bg-emerald-50 text-emerald-800', 'bg-rose-50 text-rose-800', 'bg-violet-50 text-violet-800'];
const toneOf = (seed = '') => {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return TONES[h % TONES.length];
};

export function PersonAvatar({ name, src, size = 'md' }) {
  const dims = size === 'sm' ? 'h-9 w-9 rounded-xl text-xs' : 'h-11 w-11 rounded-2xl text-sm';
  if (src) return <img src={src} alt="" aria-hidden="true" className={`shrink-0 object-cover ${dims}`} />;
  return (
    <span aria-hidden="true" className={`flex shrink-0 items-center justify-center font-bold ${toneOf(name || '')} ${dims}`}>
      {initials(name || '')}
    </span>
  );
}

/** "Beach · week" style label from the backend family + duration bucket. */
export function useTypeLabel() {
  const { t } = useTranslation(['admin']);
  return (family, duration) => {
    const fam = t(`admin:membersPage.family.${family}`, { defaultValue: family });
    const dur = t(`admin:membersPage.duration.${duration}`, { defaultValue: duration });
    return `${fam} · ${dur}`;
  };
}
