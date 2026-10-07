import { useTranslation } from 'react-i18next';

// Attention items: missing waivers (server) + unread messages (chat widget).
// No payment items — instructors never see a lesson's payment state.
import { ChevronRightIcon, MessageIcon, WarningIcon } from './DashboardIcons';

const rowBase = 'flex min-h-[48px] w-full items-center gap-3 rounded-2xl px-3.5 py-3 text-left text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00798c] motion-safe:transition-colors';

function useItemText() {
  const { t } = useTranslation(['instructor']);
  return (item) => {
    const name = item.name || t('instructor:myDay.unknownStudent');
    if (item.kind === 'waiver_missing') return t('instructor:myDay.attention.waiver', { name, time: item.startHour });
    return t('instructor:myDay.attention.unread', { count: item.count });
  };
}

const ITEM_STYLE = {
  waiver_missing: { className: 'bg-orange-50 text-orange-950 hover:bg-orange-100', Icon: WarningIcon, iconClass: 'text-orange-800' },
  unread_messages: { className: 'border border-slate-200 bg-white text-slate-900 shadow-sm hover:bg-slate-50', Icon: MessageIcon, iconClass: 'text-[#00798c]' },
};

/** Mobile: one row per item. Rendered only when there is something to show. */
export function AttentionList({ items, onSelect }) {
  const { t } = useTranslation(['instructor']);
  const text = useItemText();
  if (!items.length) return null;
  return (
    <section aria-label={t('instructor:myDay.attention.title')} data-testid="attention" className="flex flex-col gap-2">
      {items.map((item) => {
        const { className, Icon, iconClass } = ITEM_STYLE[item.kind] || ITEM_STYLE.unread_messages;
        return (
          <button key={`${item.kind}-${item.bookingId || ''}-${item.userId || ''}`} type="button" onClick={() => onSelect(item)} className={`${rowBase} ${className}`}>
            <Icon size={20} className={`shrink-0 ${iconClass}`} />
            <span className="flex-1">{text(item)}</span>
            <ChevronRightIcon size={18} className="shrink-0 opacity-70" />
          </button>
        );
      })}
    </section>
  );
}

/** Desktop: grouped chips next to the greeting ("1 missing waiver", "2 unread messages"). */
export function AttentionChips({ items, onSelect }) {
  const { t } = useTranslation(['instructor']);
  if (!items.length) return null;
  const groups = ['waiver_missing', 'unread_messages']
    .map((kind) => {
      const matching = items.filter((i) => i.kind === kind);
      if (!matching.length) return null;
      const count = kind === 'unread_messages' ? matching[0].count : matching.length;
      const label = {
        waiver_missing: t('instructor:myDay.attention.waiverChip', { count }),
        unread_messages: t('instructor:myDay.attention.unread', { count }),
      }[kind];
      return { kind, first: matching[0], label };
    })
    .filter(Boolean);

  return (
    <div role="group" aria-label={t('instructor:myDay.attention.title')} data-testid="attention" className="flex flex-wrap gap-2.5">
      {groups.map(({ kind, first, label }) => {
        const { className, Icon, iconClass } = ITEM_STYLE[kind];
        return (
          <button key={kind} type="button" onClick={() => onSelect(first)} className={`${rowBase} w-auto min-h-[44px] rounded-xl py-2 ${className}`}>
            <Icon size={18} className={`shrink-0 ${iconClass}`} />
            {label}
          </button>
        );
      })}
    </div>
  );
}
