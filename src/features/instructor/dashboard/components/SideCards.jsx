import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ClockIcon } from '../../earnings/components/EarningsIcons';
import { SkeletonBlock } from '../../earnings/components/ui';
import { cardClass } from '../../earnings/components/earningsStyles';
import { getPayoutState, useMoney } from '../../earnings/earningsFormat';
import { useEarningsSummary } from '../../earnings/useEarnings';
import { useInstructorRatings } from '../../hooks/useInstructorRatings';
import { StarIcon } from './DashboardIcons';

// Opens /finance with the payout request sheet (see InstructorEarningsPage).
export const PAYOUT_REQUEST_PATH = '/finance?request=1';
const FINANCE_PATH = '/finance';
const tile = `${cardClass} flex min-h-[44px] text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00798c] hover:bg-slate-50 motion-safe:transition-colors`;

/** "Ready for payout · €436.42 · Request →" — same numbers as /finance. */
export function PayoutMiniCard({ isDesktop }) {
  const { t } = useTranslation(['instructor']);
  const query = useEarningsSummary('month');
  const summary = query.data;
  const { money } = useMoney(summary?.currency);

  if (!summary) {
    if (query.isError) {
      return (
        <Link to={FINANCE_PATH} className={`${tile} flex-col gap-1 p-4`}>
          <span className="text-xs font-bold text-slate-600">{t('instructor:myDay.payout.label')}</span>
          <span className="text-sm text-slate-700">{t('instructor:myDay.payout.unavailable')}</span>
        </Link>
      );
    }
    return <SkeletonBlock className="h-28 rounded-2xl" />;
  }

  const state = getPayoutState(summary);
  const amount = money(state.available);
  const cta = {
    ready: t('instructor:myDay.payout.request'),
    pending: t('instructor:myDay.payout.pending'),
    below: t('instructor:myDay.payout.belowMinimum', { amount: money(summary.threshold?.amount) }),
  }[state.kind];
  const to = state.kind === 'ready' ? PAYOUT_REQUEST_PATH : FINANCE_PATH;
  const label = (
    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-orange-900">
      <ClockIcon size={14} />
      {t('instructor:myDay.payout.label')}
    </span>
  );

  if (isDesktop) {
    return (
      <Link to={to} data-testid="payout-card" className={`${tile} items-center justify-between gap-3 rounded-3xl p-5`}>
        <span className="flex flex-col gap-1">
          {label}
          <span className="text-2xl font-extrabold tabular-nums">{amount}</span>
        </span>
        <span className="text-right text-sm font-extrabold text-[#00798c]">{cta}{state.kind === 'ready' ? ' →' : ''}</span>
      </Link>
    );
  }
  return (
    <Link to={to} data-testid="payout-card" className={`${tile} flex-col gap-1 p-3.5`}>
      {label}
      <span className="text-xl font-extrabold tabular-nums">{amount}</span>
      <span className="text-[13px] font-bold text-[#00798c]">{cta}{state.kind === 'ready' ? ' →' : ''}</span>
    </Link>
  );
}

function ratingDetail(t, { total, latest, author, error, isDesktop }) {
  if (error) return t('instructor:myDay.rating.unavailable');
  if (!total) return t('instructor:myDay.rating.none');
  if (!latest) return t('instructor:myDay.rating.reviews', { count: total });
  if (isDesktop && author) return t('instructor:myDay.rating.latestBy', { count: total, text: latest.feedbackText, name: author });
  return t('instructor:myDay.rating.latest', { count: total, text: latest.feedbackText });
}

function RatingValue({ average, isDesktop }) {
  const { t } = useTranslation(['instructor']);
  return (
    <span className={`inline-flex items-center gap-1 font-extrabold tabular-nums text-slate-900 ${isDesktop ? 'text-2xl' : 'text-xl'}`}>
      {average.toFixed(1)}
      <StarIcon size={isDesktop ? 20 : 18} className="text-amber-700" />
      <span className="sr-only">{t('instructor:myDay.rating.outOfFive')}</span>
    </span>
  );
}

/** Average rating + review count + latest feedback quote. */
export function RatingMiniCard({ isDesktop }) {
  const { t } = useTranslation(['instructor']);
  const { ratings, summary, stats, isLoading, error } = useInstructorRatings({ limit: 5 });

  if (isLoading) return <SkeletonBlock className="h-28 rounded-2xl" />;

  // GET /ratings/instructor/:id returns summary.ratingCount; /ratings/stats/:id returns
  // totalRatings. Reading only `totalRatings` from the summary showed "no ratings" for
  // every instructor.
  const total = Number(summary?.ratingCount ?? summary?.totalRatings ?? stats?.totalRatings) || 0;
  const average = Number(summary?.averageRating ?? stats?.averageRating) || 0;
  const latest = ratings.find((r) => r.feedbackText) || null;
  const anonymous = t('instructor:ratings.anonymous');
  const author = latest && (latest.isAnonymous ? anonymous : latest.studentName);
  const detail = ratingDetail(t, { total, latest, author, error, isDesktop });

  return (
    <section
      aria-label={t('instructor:myDay.rating.label')}
      data-testid="rating-card"
      className={`${cardClass} flex flex-col gap-1 ${isDesktop ? 'rounded-3xl p-5' : 'p-3.5'}`}
    >
      <div className={isDesktop ? 'flex items-baseline justify-between gap-2' : 'flex flex-col gap-1'}>
        <span className={isDesktop ? 'text-[15px] font-extrabold text-slate-900' : 'text-xs font-bold text-slate-600'}>{t('instructor:myDay.rating.label')}</span>
        {total > 0 && <RatingValue average={average} isDesktop={isDesktop} />}
      </div>
      <p className={`text-slate-600 ${isDesktop ? 'text-sm' : 'text-[13px] line-clamp-2'}`}>{detail}</p>
    </section>
  );
}
