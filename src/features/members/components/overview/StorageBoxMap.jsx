// Storage box map: one cell per box (1..capacity) from the stats endpoint.
// States carry a text label + pattern, never colour alone.
import { useTranslation } from 'react-i18next';
import { cardClass } from '@/features/instructor/earnings/components/earningsStyles';
import { SectionTitle } from '@/features/instructor/earnings/components/ui';

const STATE_CLS = {
  used: 'border-[#00798c] bg-[#00798c] text-white',
  ending: 'border-amber-400 bg-amber-100 text-amber-900 ring-1 ring-inset ring-amber-400',
  starting: 'border-sky-300 bg-sky-50 text-sky-900 border-dashed',
  free: 'border-slate-200 bg-white text-slate-500',
};

const STATE_MARK = { used: '', ending: '!', starting: '→', free: '' };

export default function StorageBoxMap({ storage, onPickBox }) {
  const { t, i18n } = useTranslation(['admin']);
  const locale = i18n?.language || 'en';
  if (!storage) return null;
  const byUnit = new Map((storage.boxes || []).map((b) => [Number(b.unit), b]));
  const maxUnit = Math.max(storage.capacity || 0, ...Array.from(byUnit.keys()), 0);
  if (!maxUnit) return null;
  const cells = Array.from({ length: maxUnit }, (_, i) => {
    const unit = i + 1;
    const box = byUnit.get(unit);
    return { unit, state: box?.state || 'free', box };
  });
  const free = cells.filter((c) => c.state === 'free').length;
  const fmt = (iso) => (iso ? new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(new Date(iso)) : '');
  const labelOf = (c) => {
    const state = t(`admin:membersPage.boxes.state.${c.state}`);
    if (!c.box) return t('admin:membersPage.boxes.cellFree', { unit: c.unit });
    return t('admin:membersPage.boxes.cell', {
      unit: c.unit,
      state,
      name: c.box.holder || '',
      date: fmt(c.box.endsAt),
    });
  };

  return (
    <section className={`${cardClass} flex flex-col gap-3 p-4`} data-testid="storage-box-map">
      <div className="flex items-baseline justify-between gap-2">
        <SectionTitle>{t('admin:membersPage.boxes.title')}</SectionTitle>
        <span className="text-xs tabular-nums text-slate-600">
          {storage.capacity
            ? t('admin:membersPage.boxes.summary', { used: storage.inUse, capacity: storage.capacity, free })
            : t('admin:membersPage.boxes.summaryNoCapacity', { used: storage.inUse })}
        </span>
      </div>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(2.5rem,1fr))] gap-1.5" aria-label={t('admin:membersPage.boxes.title')}>
        {cells.map((c) => (
          <li key={c.unit}>
            <button
              type="button"
              title={labelOf(c)}
              aria-label={labelOf(c)}
              disabled={!c.box}
              onClick={() => c.box && onPickBox?.(c.unit)}
              className={`relative flex h-10 w-full items-center justify-center rounded-lg border text-xs font-bold tabular-nums ${STATE_CLS[c.state]} enabled:hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00798c] focus-visible:ring-offset-1 disabled:cursor-default`}
            >
              {c.unit}
              {STATE_MARK[c.state] && <span aria-hidden="true" className="absolute right-0.5 top-0 text-[10px] leading-none">{STATE_MARK[c.state]}</span>}
              {c.box?.holders > 1 && <span aria-hidden="true" className="absolute bottom-0 right-0.5 text-[9px] leading-none">×{c.box.holders}</span>}
            </button>
          </li>
        ))}
      </ul>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
        {['used', 'ending', 'starting', 'free'].map((s) => (
          <li key={s} className="flex items-center gap-1.5">
            <span aria-hidden="true" className={`flex h-3.5 w-3.5 items-center justify-center rounded border text-[8px] font-bold ${STATE_CLS[s]}`}>{STATE_MARK[s]}</span>
            {t(`admin:membersPage.boxes.state.${s}`)}
          </li>
        ))}
      </ul>
    </section>
  );
}
