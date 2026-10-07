import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { MinusIcon, PayoutIcon, SearchIcon } from './EarningsIcons';
import { EmptyState, SkeletonBlock, StatusBadge } from './ui';
import { cardClass, secondaryButtonClass } from './earningsStyles';
import {
  dec,
  dayKey,
  formatHours,
  formatMethod,
  formatRate,
  formatShortDate,
  formatStartHour,
  initials,
  useMoney,
} from '../earningsFormat';

const studentLabel = (item, t) => {
  const extra = Number(item.groupSize) > 1 ? Number(item.groupSize) - 1 : 0;
  const name = item.student || t('instructor:earnings.activity.unknownStudent');
  return extra ? t('instructor:earnings.activity.groupMore', { name, count: extra }) : name;
};

const dayHeading = (key, locale, t) => {
  const date = formatShortDate(key, locale);
  const today = dayjs().format('YYYY-MM-DD');
  const yesterday = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
  if (key === today) return t('instructor:earnings.activity.today', { date });
  if (key === yesterday) return t('instructor:earnings.activity.yesterday', { date });
  return date;
};

const groupByDay = (items) => {
  const groups = [];
  const index = new Map();
  items.forEach((item) => {
    const key = dayKey(item.date);
    if (!index.has(key)) {
      index.set(key, groups.length);
      groups.push({ key, items: [] });
    }
    groups[index.get(key)].items.push(item);
  });
  return groups;
};

function ChipFilter({ options, value, onChange, label }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            className={[
              'h-10 rounded-full border px-3.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00798c]',
              active ? 'border-[#0093ab] bg-cyan-50 font-semibold text-[#00687a]' : 'border-slate-300 bg-white font-medium text-slate-700 hover:bg-slate-50',
            ].join(' ')}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function ActivityCard({ item, money, locale }) {
  const { t } = useTranslation(['instructor']);
  if (item.kind === 'payout') {
    return (
      <li className={`${cardClass} flex items-center gap-3 px-4 py-3.5`}>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><PayoutIcon size={20} /></span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[15px] font-semibold text-slate-900">{t('instructor:earnings.payout.received')}</span>
          <span className="truncate text-sm text-slate-600">{[formatMethod(item.method, t), item.reference].filter(Boolean).join(' · ')}</span>
        </span>
        <span className="flex flex-col items-end gap-0.5">
          <span className="text-[15px] font-bold tabular-nums text-slate-900">{money(item.amount)}</span>
          <StatusBadge status="paid" />
        </span>
      </li>
    );
  }
  if (item.kind === 'deduction') {
    return (
      <li className={`${cardClass} flex items-center gap-3 px-4 py-3.5`}>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-700"><MinusIcon size={20} /></span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[15px] font-semibold text-slate-900">{t('instructor:earnings.activity.deduction')}</span>
          {item.description && <span className="truncate text-sm text-slate-600">{item.description}</span>}
        </span>
        <span className="text-[15px] font-bold tabular-nums text-rose-700">{money(dec(item.amount).abs().negated())}</span>
      </li>
    );
  }
  const time = formatStartHour(item.startHour);
  const meta = time
    ? t('instructor:earnings.activity.lessonMeta', { type: item.lessonType, hours: formatHours(item.hours, locale), time })
    : t('instructor:earnings.activity.lessonMetaNoTime', { type: item.lessonType, hours: formatHours(item.hours, locale) });
  return (
    <li className={`${cardClass} flex items-center gap-3 px-4 py-3.5`}>
      <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-50 text-sm font-bold text-[#00687a]">{initials(item.student)}</span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[15px] font-semibold text-slate-900">{studentLabel(item, t)}</span>
        <span className="truncate text-sm text-slate-600">{meta}</span>
      </span>
      <span className="flex flex-col items-end gap-0.5">
        <span className="text-[15px] font-bold tabular-nums text-slate-900">{money(item.amount, { signed: true })}</span>
        <StatusBadge status={item.status} />
      </span>
    </li>
  );
}

const ActivitySkeleton = ({ rows = 3 }) => (
  <div className="flex flex-col gap-2" data-testid="activity-skeleton">
    {Array.from({ length: rows }, (_, i) => <SkeletonBlock key={`sk-${i}`} className="h-[68px] rounded-2xl" />)}
  </div>
);

function ActivityError({ onRetry }) {
  const { t } = useTranslation(['instructor']);
  return (
    <div role="alert" className={`${cardClass} flex flex-col items-center gap-2 px-4 py-6 text-center`}>
      <p className="text-sm font-medium text-slate-800">{t('instructor:earnings.activity.error')}</p>
      <button type="button" onClick={onRetry} className={`${secondaryButtonClass} h-10 text-sm`}>{t('instructor:earnings.error.retry')}</button>
    </div>
  );
}

function LoadMore({ shown, total, onMore, loading }) {
  const { t } = useTranslation(['instructor']);
  if (!total || shown >= total) return null;
  return (
    <button
      type="button"
      onClick={onMore}
      disabled={loading}
      className="mx-auto min-h-[44px] rounded-lg px-3 text-sm font-semibold text-[#00798c] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00798c] disabled:opacity-60"
    >
      {t('instructor:earnings.activity.showMore', { shown, total })}
    </button>
  );
}

/** Mobile: day-grouped activity cards with All / Lessons / Payouts chips. */
export function ActivityFeed({ currency, query, type, onTypeChange, onLoadMore }) {
  const { t } = useTranslation(['instructor']);
  const { money, locale } = useMoney(currency);
  const items = useMemo(() => query.data?.items ?? [], [query.data]);
  const groups = useMemo(() => groupByDay(items), [items]);
  const options = [
    { value: 'all', label: t('instructor:earnings.activity.filters.all') },
    { value: 'lessons', label: t('instructor:earnings.activity.filters.lessons') },
    { value: 'payouts', label: t('instructor:earnings.activity.filters.payouts') },
  ];

  let body;
  if (query.isLoading) body = <ActivitySkeleton />;
  else if (query.isError) body = <ActivityError onRetry={() => query.refetch()} />;
  else if (!items.length) {
    body = <EmptyState className={cardClass} title={t('instructor:earnings.activity.empty')} hint={t('instructor:earnings.activity.emptyHint')} />;
  } else {
    body = groups.map((group) => (
      <div key={group.key} className="flex flex-col gap-2">
        <h3 className="px-1 pt-1 text-xs font-semibold uppercase tracking-wide text-slate-600">{dayHeading(group.key, locale, t)}</h3>
        <ul className="flex flex-col gap-2">
          {group.items.map((item) => <ActivityCard key={`${item.kind}-${item.id}`} item={item} money={money} locale={locale} />)}
        </ul>
      </div>
    ));
  }

  return (
    <section aria-labelledby="earnings-activity" className="flex flex-col gap-3" data-testid="activity-feed">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <h2 id="earnings-activity" className="text-base font-semibold text-slate-900">{t('instructor:earnings.activity.title')}</h2>
        <ChipFilter options={options} value={type} onChange={onTypeChange} label={t('instructor:earnings.activity.filterLabel')} />
      </div>
      {body}
      <LoadMore shown={items.length} total={query.data?.total ?? 0} onMore={onLoadMore} loading={query.isFetching} />
    </section>
  );
}

const statusMatches = (item, filter) => {
  if (filter === 'pending') return item.kind === 'lesson' && item.status !== 'paid';
  if (filter === 'paid') return item.kind === 'lesson' && item.status === 'paid';
  return true;
};

function TableRow({ item, money, locale }) {
  const { t } = useTranslation(['instructor']);
  const date = formatShortDate(item.date, locale);
  const time = item.kind === 'lesson' ? formatStartHour(item.startHour) : '';
  const td = 'px-3 py-3 align-middle';
  if (item.kind !== 'lesson') {
    const isPayout = item.kind === 'payout';
    return (
      <tr className="border-b border-slate-100 last:border-b-0">
        <td className={`${td} pl-5 tabular-nums text-slate-700`}>{date}</td>
        <td className={`${td} font-medium text-slate-900`}>{isPayout ? t('instructor:earnings.payout.received') : t('instructor:earnings.activity.deduction')}</td>
        <td className={`${td} text-slate-600`}>{isPayout ? [formatMethod(item.method, t), item.reference].filter(Boolean).join(' · ') : item.description}</td>
        <td className={`${td} text-right text-slate-400`}>—</td>
        <td className={`${td} text-slate-400`}>—</td>
        <td className={`${td} text-right font-semibold tabular-nums ${isPayout ? 'text-slate-900' : 'text-rose-700'}`}>
          {isPayout ? money(item.amount) : money(dec(item.amount).abs().negated())}
        </td>
        <td className={`${td} pr-5`}>{isPayout ? <StatusBadge status="paid" /> : null}</td>
      </tr>
    );
  }
  return (
    <tr className="border-b border-slate-100 last:border-b-0">
      <td className={`${td} pl-5 tabular-nums text-slate-700`}>{time ? `${date} · ${time}` : date}</td>
      <td className={`${td} font-medium text-slate-900`}>{studentLabel(item, t)}</td>
      <td className={`${td} text-slate-700`}>{item.lessonType}</td>
      <td className={`${td} text-right tabular-nums text-slate-700`}>{formatHours(item.hours, locale)}</td>
      <td className={`${td} text-slate-700`}>{formatRate(item.commissionType, item.rate, money, t)}</td>
      <td className={`${td} text-right font-semibold tabular-nums text-slate-900`}>{money(item.amount)}</td>
      <td className={`${td} pr-5`}><StatusBadge status={item.status} /></td>
    </tr>
  );
}

/** Desktop: searchable / filterable activity table with a sticky header and right-aligned amounts. */
export function ActivityTable({ currency, query, filter, onFilterChange, search, onSearchChange, onLoadMore, tableRef }) {
  const { t } = useTranslation(['instructor']);
  const { money, locale } = useMoney(currency);
  const allItems = useMemo(() => query.data?.items ?? [], [query.data]);
  const items = useMemo(() => allItems.filter((item) => statusMatches(item, filter)), [allItems, filter]);
  const options = [
    { value: 'all', label: t('instructor:earnings.activity.filters.all') },
    { value: 'pending', label: t('instructor:earnings.activity.filters.pending') },
    { value: 'paid', label: t('instructor:earnings.activity.filters.paid') },
    { value: 'payouts', label: t('instructor:earnings.activity.filters.payouts') },
  ];
  const th = 'sticky top-0 z-10 bg-slate-50 px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600';

  let body;
  if (query.isLoading) {
    body = <div className="p-5"><ActivitySkeleton rows={4} /></div>;
  } else if (query.isError) {
    body = <div className="p-5"><ActivityError onRetry={() => query.refetch()} /></div>;
  } else if (!items.length) {
    body = search
      ? <EmptyState title={t('instructor:earnings.activity.noResults', { query: search })} hint={t('instructor:earnings.activity.noResultsHint')} />
      : <EmptyState title={t('instructor:earnings.activity.empty')} hint={t('instructor:earnings.activity.emptyHint')} />;
  } else {
    body = (
      <div className="max-h-[560px] overflow-auto">
        <table className="min-w-full text-sm" data-testid="activity-table">
          <thead>
            <tr className="text-left">
              <th scope="col" className={`${th} pl-5`}>{t('instructor:earnings.activity.columns.date')}</th>
              <th scope="col" className={th}>{t('instructor:earnings.activity.columns.student')}</th>
              <th scope="col" className={th}>{t('instructor:earnings.activity.columns.lesson')}</th>
              <th scope="col" className={`${th} text-right`}>{t('instructor:earnings.activity.columns.hours')}</th>
              <th scope="col" className={th}>{t('instructor:earnings.activity.columns.rate')}</th>
              <th scope="col" className={`${th} text-right`}>{t('instructor:earnings.activity.columns.amount')}</th>
              <th scope="col" className={`${th} pr-5`}>{t('instructor:earnings.activity.columns.status')}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => <TableRow key={`${item.kind}-${item.id}`} item={item} money={money} locale={locale} />)}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <section ref={tableRef} aria-labelledby="earnings-activity-table" className={`${cardClass} overflow-hidden`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <h2 id="earnings-activity-table" className="text-base font-semibold text-slate-900">{t('instructor:earnings.activity.tableTitle')}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-slate-600 focus-within:ring-2 focus-within:ring-[#00798c]">
            <SearchIcon size={16} />
            <span className="sr-only">{t('instructor:earnings.activity.search')}</span>
            <input
              type="search"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={t('instructor:earnings.activity.search')}
              className="w-56 border-0 bg-transparent p-0 text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-0"
            />
          </label>
          <ChipFilter options={options} value={filter} onChange={onFilterChange} label={t('instructor:earnings.activity.filterLabel')} />
        </div>
      </div>
      {body}
      <div className="flex justify-center px-5 py-2">
        <LoadMore shown={allItems.length} total={query.data?.total ?? 0} onMore={onLoadMore} loading={query.isFetching} />
      </div>
    </section>
  );
}
