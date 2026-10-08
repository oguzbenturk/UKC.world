// "Needs action" queue: lessons instructors booked as pending (inline Confirm and
// Confirm all), lessons with no instructor, missing waivers, finished lessons not
// closed, instructor payout requests and instructors booked over a full day.
// Status is never colour alone — every group carries an icon + text.
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cardClass, primaryButtonClass } from '@/features/instructor/earnings/components/earningsStyles';
import { formatRelativeTime, useMoney } from '@/features/instructor/earnings/earningsFormat';
import { AlertIcon, CheckIcon, ClockIcon } from '@/features/instructor/earnings/components/EarningsIcons';
import { ChevronRightIcon, WarningIcon } from '@/features/instructor/dashboard/components/DashboardIcons';
import { formatLessonWhen } from '@/features/instructor/students/studentsFormat';
import { actionCount, bookingHref } from '../managerTodayFormat';

function useLocale() {
  const { i18n } = useTranslation();
  return i18n?.language || 'en';
}

const smallPrimary = `${primaryButtonClass} h-10 px-3.5 text-sm`;
const smallSecondary = 'inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-3.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00798c]';

function PaymentChip({ payment }) {
  const { t } = useTranslation(['manager']);
  const { money } = useMoney('EUR');
  const status = String(payment?.status || '').toLowerCase();
  if (['paid', 'package', 'completed'].includes(status)) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
        <CheckIcon size={12} />
        {status === 'package' ? t('manager:today.payment.package') : t('manager:today.payment.paid')}
      </span>
    );
  }
  if (payment?.amount > 0) {
    return <span className="text-xs font-semibold text-orange-800">{t('manager:today.payment.unpaid', { amount: money(payment.amount) })}</span>;
  }
  return null;
}

function ConfirmRow({ item, onConfirm, busy, isDesktop }) {
  const { t } = useTranslation(['manager', 'instructor']);
  const locale = useLocale();
  const when = formatLessonWhen(item.date, item.startHour, { locale, t });
  const who = item.others > 0 ? t('manager:today.plusOthers', { name: item.student, count: item.others }) : (item.student || t('manager:today.unknownStudent'));
  const by = item.bookedBy?.name ? t('manager:today.bookedBy', { name: item.bookedBy.name }) : null;
  const age = item.createdAt ? formatRelativeTime(item.createdAt, locale) : null;
  return (
    <li className={`flex gap-3 border-t border-amber-100 px-3.5 py-2.5 ${isDesktop ? 'items-center' : 'items-start'}`}>
      <div className={`flex min-w-0 flex-1 ${isDesktop ? 'items-center gap-4' : 'flex-col gap-0.5'}`}>
        <span className={`text-sm font-bold tabular-nums text-slate-900 ${isDesktop ? 'w-36 shrink-0' : ''}`}>{when}</span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-semibold text-slate-900">
            {who}{item.service ? <span className="font-normal text-slate-600"> · {item.service}</span> : null}
          </span>
          <span className="flex flex-wrap items-center gap-x-2 text-xs text-slate-600">
            {[by, age].filter(Boolean).join(' · ')}
            <PaymentChip payment={item.payment} />
          </span>
        </span>
      </div>
      <div className="flex shrink-0 gap-2">
        {isDesktop && <Link to={bookingHref(item)} className={smallSecondary}>{t('manager:today.open')}</Link>}
        <button
          type="button"
          onClick={() => onConfirm(item.bookingId)}
          disabled={busy}
          aria-label={t('manager:today.confirmLabel', { name: who })}
          className={smallPrimary}
        >
          {busy ? t('manager:today.confirming') : t('manager:today.confirm')}
        </button>
      </div>
    </li>
  );
}

function ToConfirmGroup({ group, confirming, onConfirm, onConfirmAll, isDesktop }) {
  const { t } = useTranslation(['manager']);
  if (!group?.count) return null;
  const items = group.items || [];
  const allBusy = items.length > 0 && items.every((i) => confirming.has(i.bookingId));
  return (
    <div data-testid="to-confirm" className="overflow-hidden rounded-2xl border border-amber-200">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-amber-50 px-3.5 py-2.5">
        <span className="inline-flex items-center gap-1.5 text-sm font-bold text-amber-900">
          <ClockIcon size={15} />
          {t('manager:today.toConfirm.title', { count: group.count })}
        </span>
        {items.length > 1 && (
          <button type="button" onClick={() => onConfirmAll(items.map((i) => i.bookingId))} disabled={allBusy} className={`${primaryButtonClass} h-9 px-3 text-sm`}>
            {t('manager:today.toConfirm.confirmAll', { count: items.length })}
          </button>
        )}
      </div>
      <ul>
        {items.slice(0, isDesktop ? 5 : 3).map((item) => (
          <ConfirmRow key={item.bookingId} item={item} onConfirm={onConfirm} busy={confirming.has(item.bookingId)} isDesktop={isDesktop} />
        ))}
      </ul>
      {group.count > (isDesktop ? 5 : 3) && (
        <Link to="/calendars/lessons?view=daily" className="block border-t border-amber-100 px-3.5 py-2.5 text-sm font-semibold text-[#00687a] hover:text-[#005f6e]">
          {t('manager:today.toConfirm.more', { count: group.count - Math.min(items.length, isDesktop ? 5 : 3) })}
        </Link>
      )}
    </div>
  );
}

const TONES = {
  warn: { box: 'bg-orange-50', title: 'text-orange-900', sub: 'text-orange-800', Icon: WarningIcon },
  alert: { box: 'bg-rose-50', title: 'text-rose-900', sub: 'text-rose-800', Icon: AlertIcon },
  neutral: { box: 'bg-slate-50', title: 'text-slate-900', sub: 'text-slate-600', Icon: ClockIcon },
};

function ActionItem({ tone = 'neutral', title, detail, to, action, testId }) {
  const style = TONES[tone];
  const { Icon } = style;
  return (
    <Link
      to={to}
      data-testid={testId}
      className={`group flex min-h-[56px] items-center gap-3 rounded-2xl px-3.5 py-2.5 ${style.box} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00798c]`}
    >
      <Icon size={18} className={`shrink-0 ${style.title}`} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={`text-sm font-bold ${style.title}`}>{title}</span>
        {detail && <span className={`truncate text-xs ${style.sub}`}>{detail}</span>}
      </span>
      {action
        ? <span className="shrink-0 rounded-lg bg-white px-2.5 py-1.5 text-xs font-bold text-[#00687a] shadow-sm group-hover:text-[#005f6e]">{action}</span>
        : <ChevronRightIcon size={18} className={`shrink-0 ${style.sub}`} />}
    </Link>
  );
}

// One builder per action type: returns the item's props, or null when there is nothing to show.
const BUILDERS = [
  ['unassigned', (g, t) => {
    const first = g.items?.[0];
    const suggestion = first?.suggested?.name ? t('manager:today.unassigned.suggest', { name: first.suggested.name }) : null;
    return {
      tone: 'warn',
      title: t('manager:today.unassigned.title', { count: g.count }),
      detail: first ? [first.student, first.startHour, suggestion].filter(Boolean).join(' · ') : null,
      to: first ? bookingHref(first) : '/calendars/lessons?view=daily',
      action: t('manager:today.unassigned.action'),
    };
  }],
  ['waivers', (g, t) => {
    const first = g.items?.[0];
    return {
      tone: 'warn',
      title: t('manager:today.waivers.title', { count: g.count }),
      detail: first ? t('manager:today.waivers.detail', { name: first.name, time: first.startHour || '' }) : null,
      to: first?.userId ? `/customers/${first.userId}` : '/customers',
      action: t('manager:today.waivers.action'),
    };
  }],
  ['overbooked', (g, t) => ({
    tone: 'alert',
    title: t('manager:today.overbooked.title', { count: g.count }),
    detail: g.items.slice(0, 3).map((o) => t('manager:today.overbooked.item', { name: o.name, hours: o.hours })).join(' · '),
    to: '/calendars/lessons?view=daily',
    action: t('manager:today.overbooked.action'),
  })],
  ['notClosed', (g, t) => {
    const first = g.items?.[0];
    return {
      title: t('manager:today.notClosed.title', { count: g.count }),
      detail: first ? t('manager:today.notClosed.detail', { name: first.student || '', end: first.endHour || '', instructor: first.instructor?.name || '' }) : null,
      to: first ? bookingHref(first) : '/calendars/lessons?view=daily',
      action: t('manager:today.notClosed.action'),
    };
  }],
  ['payoutRequests', (g, t, money) => ({
    title: t('manager:today.payouts.title', { count: g.count }),
    detail: g.items?.[0] ? t('manager:today.payouts.detail', { name: g.items[0].instructor?.name || '', amount: money(g.amount) }) : null,
    to: '/finance/payout-requests',
    action: t('manager:today.payouts.action'),
  })],
];

function OtherItems({ actions, isDesktop }) {
  const { t } = useTranslation(['manager']);
  const { money } = useMoney('EUR');
  const items = BUILDERS
    .filter(([key]) => actions[key]?.count)
    .map(([key, build]) => <ActionItem key={key} testId={`action-${key}`} {...build(actions[key], t, money)} />);
  if (!items.length) return null;
  return <div className={isDesktop ? 'grid gap-2.5 xl:grid-cols-2' : 'flex flex-col gap-2'}>{items}</div>;
}

export default function NeedsAction({ actions, confirming, onConfirm, onConfirmAll, isDesktop }) {
  const { t } = useTranslation(['manager']);
  const total = actionCount(actions);
  return (
    <section aria-labelledby="needs-action-title" data-testid="needs-action" className={`${cardClass} flex min-w-0 flex-col gap-3 ${isDesktop ? 'p-5' : 'p-4'}`}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="needs-action-title" className="text-base font-bold text-slate-900">{t('manager:today.needsAction')}</h2>
        <span className="text-sm text-slate-600">{t('manager:today.items', { count: total })}</span>
      </div>
      {total === 0 ? (
        <p className="flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          <CheckIcon size={16} />
          {t('manager:today.allClear')}
        </p>
      ) : (
        <>
          <ToConfirmGroup group={actions.toConfirm} confirming={confirming} onConfirm={onConfirm} onConfirmAll={onConfirmAll} isDesktop={isDesktop} />
          <OtherItems actions={actions} isDesktop={isDesktop} />
        </>
      )}
    </section>
  );
}
