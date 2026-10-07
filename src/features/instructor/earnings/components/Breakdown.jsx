import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDownIcon } from './EarningsIcons';
import { EmptyState, SectionTitle } from './ui';
import { BRAND_MARK, cardClass } from './earningsStyles';
import { dec, formatHours, formatRate, percentOf, toLocalDate, useMoney } from '../earningsFormat';

const totalLabelFor = (periodKey, t) => ({
  week: t('instructor:earnings.calc.totalWeek'),
  month: t('instructor:earnings.calc.totalMonth'),
  year: t('instructor:earnings.calc.totalYear'),
  all: t('instructor:earnings.calc.totalAll'),
}[periodKey] ?? t('instructor:earnings.calc.totalMonth'));

/** Collapsible "How is this calculated?" — rate × hours per lesson type, deductions, total. */
export function CalculationDetails({ summary, embedded = false }) {
  const { t } = useTranslation(['instructor']);
  const { money, locale } = useMoney(summary.currency);
  const rows = summary.byLessonType ?? [];
  const hasDeductions = dec(summary.deductions).gt(0);

  return (
    <details className={`group ${embedded ? 'border-t border-slate-100 pt-3' : `${cardClass} px-5 py-3`}`}>
      <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-2 rounded-lg text-sm font-semibold text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00798c] [&::-webkit-details-marker]:hidden">
        {t('instructor:earnings.calc.title')}
        <ChevronDownIcon size={18} className="text-slate-600 group-open:rotate-180 motion-safe:transition-transform" />
      </summary>
      <div className="mt-2 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-sm tabular-nums text-slate-700">
        <span className="col-span-2 text-slate-600">
          {t('instructor:earnings.calc.summary', { count: summary.lessons ?? 0, hours: formatHours(summary.hours, locale) })}
        </span>
        {rows.map((row) => (
          <div key={row.key} className="contents">
            <span>
              {t('instructor:earnings.calc.row', {
                label: row.label,
                rate: formatRate(row.commissionType, row.rate, money, t),
                hours: formatHours(row.hours, locale),
              })}
            </span>
            <span className="text-right">{money(row.amount)}</span>
          </div>
        ))}
        {hasDeductions && (
          <>
            <span>{t('instructor:earnings.calc.deductions')}</span>
            <span className="text-right text-rose-700">{money(dec(summary.deductions).negated())}</span>
          </>
        )}
        <span className="border-t border-slate-200 pt-1.5 font-bold text-slate-900">{totalLabelFor(summary.period?.key, t)}</span>
        <span className="border-t border-slate-200 pt-1.5 text-right font-bold text-slate-900">{money(summary.earned)}</span>
        <p className="col-span-2 mt-1 text-xs text-slate-600">{t('instructor:earnings.calc.explainer')}</p>
      </div>
    </details>
  );
}

/** Horizontal bars per lesson type (no pies). */
export function LessonTypeBars({ summary, showRates = false, children }) {
  const { t } = useTranslation(['instructor']);
  const { money } = useMoney(summary.currency);
  const rows = useMemo(
    () => [...(summary.byLessonType ?? [])].sort((a, b) => dec(b.amount).comparedTo(dec(a.amount))),
    [summary.byLessonType],
  );
  const max = rows.reduce((acc, r) => (dec(r.amount).gt(acc) ? dec(r.amount) : acc), dec(0));
  const hasDeductions = dec(summary.deductions).gt(0);

  return (
    <section aria-labelledby="earnings-by-type" className={`${cardClass} flex flex-col gap-3 p-5`}>
      <SectionTitle><span id="earnings-by-type">{t('instructor:earnings.byType.title')}</span></SectionTitle>
      {rows.length === 0 ? (
        <EmptyState title={t('instructor:earnings.byType.empty')} hint={t('instructor:earnings.byType.emptyHint')} className="py-4" />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {rows.map((row) => {
            const rate = formatRate(row.commissionType, row.rate, money, t);
            return (
              <li key={row.key} className="flex flex-col gap-1">
                <div className="flex justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate text-slate-800">
                    {row.label}
                    {showRates && rate && <span className="text-slate-600"> · {rate}</span>}
                  </span>
                  <span className="font-semibold tabular-nums text-slate-900">{money(row.amount)}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-200" aria-hidden="true">
                  <div className="h-full rounded-full" style={{ width: `${percentOf(row.amount, max)}%`, backgroundColor: BRAND_MARK }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {showRates && hasDeductions && (
        <div className="flex justify-between border-t border-slate-100 pt-2 text-sm">
          <span className="text-slate-700">{t('instructor:earnings.calc.deductions')}</span>
          <span className="font-semibold tabular-nums text-rose-700">{money(dec(summary.deductions).negated())}</span>
        </div>
      )}
      {children}
    </section>
  );
}

/** Desktop: last 6 months as vertical bars, current month marked "so far". */
export function MonthlyBars({ summary }) {
  const { t } = useTranslation(['instructor']);
  const { money, locale } = useMoney(summary.currency);
  const months = summary.monthly ?? [];
  const max = months.reduce((acc, m) => (dec(m.total).gt(acc) ? dec(m.total) : acc), dec(0));
  const currentKey = toLocalDate(new Date())?.format('YYYY-MM');

  return (
    <section aria-labelledby="earnings-by-month" className={`${cardClass} flex flex-col gap-4 p-5`}>
      <SectionTitle><span id="earnings-by-month">{t('instructor:earnings.byMonth.title')}</span></SectionTitle>
      {months.length === 0 ? (
        <EmptyState title={t('instructor:earnings.byType.empty')} className="py-4" />
      ) : (
        <ul className="flex h-48 items-end gap-3" aria-label={t('instructor:earnings.byMonth.chartLabel')}>
          {months.map((m) => {
            const name = new Intl.DateTimeFormat(locale, { month: 'short' }).format(toLocalDate(`${m.month}-01`)?.toDate() ?? new Date());
            const label = m.month === currentKey ? t('instructor:earnings.byMonth.soFar', { month: name }) : name;
            return (
              <li key={m.month} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
                <span className="text-xs font-semibold tabular-nums text-slate-800">{money(m.total)}</span>
                <div className="flex min-h-0 w-full flex-1 items-end justify-center">
                  <div
                    className="w-full max-w-[56px] rounded-t-lg"
                    style={{
                      height: `${Math.max(percentOf(m.total, max), 2)}%`,
                      // Current (incomplete) month: outlined bar so it reads as "so far" without relying on color.
                      backgroundColor: m.month === currentKey ? '#e0f6f9' : BRAND_MARK,
                      border: `2px solid ${BRAND_MARK}`,
                    }}
                  />
                </div>
                <span className="truncate text-xs text-slate-600">{label}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
