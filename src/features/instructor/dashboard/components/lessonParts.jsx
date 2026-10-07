// Small building blocks shared by the next-lesson hero, the timeline and the
// lesson drawer. Status is always icon + text (never colour alone).
import { useTranslation } from 'react-i18next';
import { AlertIcon, CheckIcon } from '../../earnings/components/EarningsIcons';
import { formatShortDate } from '../../earnings/earningsFormat';
import { WarningIcon } from './DashboardIcons';
import { useLocale } from './lessonText';

const chipBase = 'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold';

export const Avatar = ({ initials, size = 'md' }) => {
  const dims = size === 'lg' ? 'h-14 w-14 rounded-2xl text-lg' : size === 'sm' ? 'h-10 w-10 rounded-xl text-sm' : 'h-12 w-12 rounded-2xl text-base';
  return (
    <span aria-hidden="true" className={`flex shrink-0 items-center justify-center bg-cyan-50 font-bold text-[#00687a] ${dims}`}>
      {initials || '·'}
    </span>
  );
};

export function WaiverChip({ signed }) {
  const { t } = useTranslation(['instructor']);
  if (signed === true) {
    return (
      <span className={`${chipBase} bg-emerald-50 text-emerald-800`}>
        <CheckIcon size={13} />
        {t('instructor:myDay.waiver.signed')}
      </span>
    );
  }
  if (signed === false) {
    return (
      <span className={`${chipBase} bg-orange-50 text-orange-900`}>
        <WarningIcon size={13} />
        {t('instructor:myDay.waiver.missing')}
      </span>
    );
  }
  return (
    <span className={`${chipBase} bg-slate-100 text-slate-700`}>
      <AlertIcon size={13} />
      {t('instructor:myDay.waiver.unknown')}
    </span>
  );
}

export function LevelChip({ level }) {
  const { t } = useTranslation(['instructor']);
  return (
    <span className={`${chipBase} bg-indigo-50 text-indigo-800`}>
      {level ? t('instructor:myDay.level', { level }) : t('instructor:myDay.levelUnset')}
    </span>
  );
}

export function EquipmentChip({ items }) {
  if (!items?.length) return null;
  return <span className={`${chipBase} bg-slate-100 text-slate-700`}>{items.join(' · ')}</span>;
}

export function LastNote({ note, className = '' }) {
  const { t } = useTranslation(['instructor']);
  const locale = useLocale();
  if (!note?.text) return null;
  const date = note.date ? formatShortDate(note.date, locale) : '';
  return (
    <p className={`rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-700 ${className}`}>
      {date
        ? t('instructor:myDay.lastNote', { date, text: note.text })
        : t('instructor:myDay.lastNoteUndated', { text: note.text })}
    </p>
  );
}
