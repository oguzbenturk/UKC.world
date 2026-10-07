import { useTranslation } from 'react-i18next';
import TrendSparkline from './TrendSparkline';
import { ArrowDownRightIcon, ArrowUpRightIcon, CheckIcon, ClockIcon } from './EarningsIcons';
import { cardClass } from './earningsStyles';
import { dec, formatHours, formatPeriodLabel, useMoney } from '../earningsFormat';

const useHeroLabel = (period, locale) => {
  const { t } = useTranslation(['instructor']);
  const label = formatPeriodLabel(period, locale, t);
  switch (period?.key) {
    case 'week': return t('instructor:earnings.hero.week');
    case 'year': return t('instructor:earnings.hero.year', { label });
    case 'all': return t('instructor:earnings.hero.all');
    default: return t('instructor:earnings.hero.month', { label });
  }
};

function ChangeChip({ changePct, periodKey, locale }) {
  const { t } = useTranslation(['instructor']);
  if (changePct == null || periodKey === 'all') return null;
  const value = dec(changePct);
  const down = value.isNegative() && !value.isZero();
  const pct = new Intl.NumberFormat(locale, { maximumFractionDigits: 0, signDisplay: 'exceptZero' })
    .format(value.toDecimalPlaces(0).toNumber());
  const text = {
    week: t('instructor:earnings.hero.vsWeek', { pct: `${pct}%` }),
    month: t('instructor:earnings.hero.vsMonth', { pct: `${pct}%` }),
    year: t('instructor:earnings.hero.vsYear', { pct: `${pct}%` }),
  }[periodKey] ?? t('instructor:earnings.hero.vsMonth', { pct: `${pct}%` });
  const Arrow = down ? ArrowDownRightIcon : ArrowUpRightIcon;
  return (
    <span
      data-testid="earnings-change-chip"
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ${
        down ? 'bg-slate-100 text-slate-700' : 'bg-cyan-50 text-[#00687a]'
      }`}
    >
      <Arrow size={14} />
      {text}
    </span>
  );
}

export function BalanceTile({ variant, label, amount, hint }) {
  const ready = variant === 'ready';
  const Icon = ready ? ClockIcon : CheckIcon;
  return (
    <div className={`flex flex-col gap-1 rounded-xl p-3 ${ready ? 'bg-amber-50' : 'bg-slate-100'}`}>
      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${ready ? 'text-amber-800' : 'text-slate-700'}`}>
        <Icon size={14} />
        {label}
      </span>
      <span className="text-xl font-bold tabular-nums text-slate-900">{amount}</span>
      {hint && <span className="text-xs text-slate-600">{hint}</span>}
    </div>
  );
}

function HeroAmount({ summary, isDesktop, isRefreshing }) {
  const { splitMoney } = useMoney(summary.currency);
  const [whole, cents] = splitMoney(summary.earned);
  const size = isDesktop ? 'text-5xl' : 'text-[clamp(1.75rem,10vw,2.75rem)] break-words';
  return (
    <p
      data-testid="earnings-hero-amount"
      className={`font-duotone-bold-extended leading-none tracking-tight tabular-nums text-slate-900 ${size} ${isRefreshing ? 'opacity-60' : ''}`}
    >
      {whole}
      <span className={`${isDesktop ? 'text-3xl' : 'text-2xl'} text-slate-500`}>{cents}</span>
    </p>
  );
}

function HeroTrend({ summary, isDesktop }) {
  const { t } = useTranslation(['instructor']);
  const { money } = useMoney(summary.currency);
  const weekly = summary.weekly ?? [];
  if (!weekly.length) return null;
  const latestWeek = weekly[weekly.length - 1].total;
  const threshold = isDesktop ? summary.threshold?.amount ?? null : null;
  return (
    <TrendSparkline
      points={weekly}
      width={isDesktop ? 640 : 320}
      height={isDesktop ? 110 : 64}
      threshold={threshold}
      thresholdLabel={threshold != null ? t('instructor:earnings.hero.thresholdLine', { amount: money(threshold) }) : ''}
      label={t('instructor:earnings.hero.trendLabel', { amount: money(latestWeek) })}
    />
  );
}

function MobileBalances({ summary }) {
  const { t } = useTranslation(['instructor']);
  const { money } = useMoney(summary.currency);
  const balances = summary.balances ?? {};
  const showGross = balances.paidOutGross != null && !dec(balances.paidOutGross).eq(dec(balances.paidOutNet));
  return (
    <div className="grid grid-cols-2 gap-2.5">
      <BalanceTile variant="ready" label={t('instructor:earnings.balances.ready')} amount={money(balances.available)} />
      <BalanceTile
        variant="paid"
        label={t('instructor:earnings.balances.paidOutAllTime')}
        amount={money(balances.paidOutNet)}
        hint={showGross ? t('instructor:earnings.balances.gross', { amount: money(balances.paidOutGross) }) : null}
      />
    </div>
  );
}

export default function HeroCard({ summary, isDesktop, isRefreshing = false }) {
  const { t } = useTranslation(['instructor']);
  const { money, locale } = useMoney(summary.currency);
  const heroLabel = useHeroLabel(summary.period, locale);

  return (
    <section aria-label={heroLabel} aria-busy={isRefreshing} className={`${cardClass} flex flex-col gap-4 p-5 sm:p-6`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-slate-600">{heroLabel}</span>
        <ChangeChip changePct={summary.changePct} periodKey={summary.period?.key} locale={locale} />
      </div>
      <HeroAmount summary={summary} isDesktop={isDesktop} isRefreshing={isRefreshing} />
      {isDesktop && (
        <span className="text-sm text-slate-600 tabular-nums">
          {t('instructor:earnings.hero.stats', {
            count: summary.lessons ?? 0,
            hours: formatHours(summary.hours, locale),
            avg: money(summary.avgPerLesson),
          })}
        </span>
      )}
      <HeroTrend summary={summary} isDesktop={isDesktop} />
      {!isDesktop && <MobileBalances summary={summary} />}
    </section>
  );
}
