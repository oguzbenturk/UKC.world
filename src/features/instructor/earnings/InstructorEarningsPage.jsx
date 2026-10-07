/**
 * Instructor earnings page — the instructor view of /finance.
 * Spec: docs/specs/instructor-earnings-payouts.md (§2 API, §3 UI).
 * Design boards: demo-aydin/design/earnings-{mobile,desktop}.dc.html.
 *
 * Mobile (<1024px): hero → payout card → "How is this calculated?" → by lesson
 * type → day-grouped activity, with a sticky "Request payout" bar.
 * Desktop: header actions (Statement + Request payout), hero / balances /
 * recent payouts, by-month + by-lesson-type, then a searchable activity table.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { message } from '@/shared/utils/antdStatic';
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue';
import PeriodSwitch from './components/PeriodSwitch';
import HeroCard from './components/HeroCard';
import { BalancesCard, PayoutCard, RecentPayoutsCard, RequestPayoutButton } from './components/PayoutPanels';
import { CalculationDetails, LessonTypeBars, MonthlyBars } from './components/Breakdown';
import { ActivityFeed, ActivityTable } from './components/Activity';
import RequestPayoutSheet from './components/RequestPayoutSheet';
import StatementDialog from './components/StatementDialog';
import EarningsSkeleton from './components/EarningsSkeleton';
import { DocumentIcon, DownloadIcon } from './components/EarningsIcons';
import { EmptyState, ErrorState } from './components/ui';
import { cardClass, secondaryButtonClass } from './components/earningsStyles';
import { dec, formatPeriodLabel, formatRelativeTime, getPayoutState, useMoney } from './earningsFormat';
import {
  useCancelPayoutRequest,
  useEarningsActivity,
  useEarningsSummary,
  useIsDesktop,
  usePayoutRequestRealtime,
} from './useEarnings';

const PAGE_SIZE = 50;
// Desktop table filter → API `type` (pending/paid are lesson statuses, filtered client-side).
const TABLE_FILTER_TYPE = { all: 'all', pending: 'lessons', paid: 'lessons', payouts: 'payouts' };

const isEmptyHistory = (summary) => dec(summary?.balances?.totalEarned).isZero()
  && !summary?.lastPayout
  && !Number(summary?.lessons);

function PageHeader({ summary, isDesktop, period, onPeriodChange, actions }) {
  const { t } = useTranslation(['instructor']);
  const { locale } = useMoney(summary?.currency);
  const periodLabel = summary ? formatPeriodLabel(summary.period, locale, t) : '';
  const updated = summary?.updatedAt ? formatRelativeTime(summary.updatedAt, locale) : '';

  return (
    <header className={`flex gap-3 ${isDesktop ? 'flex-row items-end justify-between' : 'flex-col'}`}>
      <div className="flex min-w-0 flex-col gap-0.5">
        <h1 className="font-duotone-bold-extended text-2xl tracking-tight text-slate-900 lg:text-3xl">{t('instructor:earnings.title')}</h1>
        {periodLabel && (
          <p className="text-sm text-slate-600">
            {updated ? t('instructor:earnings.subtitle', { period: periodLabel, updated }) : periodLabel}
          </p>
        )}
      </div>
      <div className={`flex gap-2 ${isDesktop ? 'flex-wrap items-start justify-end' : 'flex-col'}`}>
        <PeriodSwitch value={period} onChange={onPeriodChange} className={isDesktop ? '' : 'w-full'} />
        {actions}
      </div>
    </header>
  );
}

function MobileLayout({ summary, activity, mobileType, setMobileType, loadMore, onCancel, cancelling, onOpenStatement, isRefreshing }) {
  const { t } = useTranslation(['instructor']);
  return (
    <>
      <HeroCard summary={summary} isDesktop={false} isRefreshing={isRefreshing} />
      {isEmptyHistory(summary) && (
        <EmptyState className={cardClass} title={t('instructor:earnings.empty.title')} hint={t('instructor:earnings.empty.body')} />
      )}
      <PayoutCard summary={summary} onCancel={onCancel} cancelling={cancelling} />
      <CalculationDetails summary={summary} />
      <LessonTypeBars summary={summary} />
      <ActivityFeed
        currency={summary.currency}
        query={activity}
        type={mobileType}
        onTypeChange={setMobileType}
        onLoadMore={loadMore}
      />
      <button
        type="button"
        onClick={onOpenStatement}
        className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl text-sm font-semibold text-slate-700 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00798c]"
      >
        <DocumentIcon size={18} />
        {t('instructor:earnings.statement.link')}
      </button>
    </>
  );
}

function DesktopLayout({ summary, activity, recentPayouts, table, onCancel, cancelling, isRefreshing }) {
  const { t } = useTranslation(['instructor']);
  const tableRef = useRef(null);
  const showAllPayouts = () => {
    table.setFilter('payouts');
    tableRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  };
  return (
    <>
      {isEmptyHistory(summary) && (
        <EmptyState className={cardClass} title={t('instructor:earnings.empty.title')} hint={t('instructor:earnings.empty.body')} />
      )}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <HeroCard summary={summary} isDesktop isRefreshing={isRefreshing} />
        <BalancesCard summary={summary} />
        <RecentPayoutsCard
          summary={summary}
          payouts={recentPayouts.data?.items ?? []}
          loading={recentPayouts.isLoading}
          onCancel={onCancel}
          cancelling={cancelling}
          onShowAll={showAllPayouts}
        />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <MonthlyBars summary={summary} />
        <LessonTypeBars summary={summary} showRates>
          <CalculationDetails summary={summary} embedded />
        </LessonTypeBars>
      </div>
      <ActivityTable
        currency={summary.currency}
        query={activity}
        filter={table.filter}
        onFilterChange={table.setFilter}
        search={table.search}
        onSearchChange={table.setSearch}
        onLoadMore={table.loadMore}
        tableRef={tableRef}
      />
    </>
  );
}

// /finance?request=1 (dashboard "Eligible to request payout now") opens the request
// flow once the summary is in; the param is then removed so a refresh doesn't reopen it.
function useOpenRequestFromUrl(summary, open) {
  const [searchParams, setSearchParams] = useSearchParams();
  const wantsRequest = searchParams.get('request') === '1';
  useEffect(() => {
    if (!wantsRequest || !summary) return;
    if (getPayoutState(summary).kind === 'ready') open();
    const next = new URLSearchParams(searchParams);
    next.delete('request');
    setSearchParams(next, { replace: true });
  }, [wantsRequest, summary, searchParams, setSearchParams, open]);
}

function useCancelWithFeedback() {
  const { t } = useTranslation(['instructor']);
  const cancelMutation = useCancelPayoutRequest();
  const { mutateAsync } = cancelMutation;
  const onCancel = useCallback(async (id) => {
    try {
      await mutateAsync(id);
      message.success(t('instructor:earnings.payout.cancelled'));
    } catch {
      message.error(t('instructor:earnings.payout.cancelError'));
    }
  }, [mutateAsync, t]);
  return { onCancel, cancelling: cancelMutation.isPending };
}

// Skeleton while loading, error state with retry, otherwise the layout.
function SummaryGate({ query, isDesktop, children }) {
  const { t } = useTranslation(['instructor']);
  if (query.data) return children(query.data, query.isFetching && query.isPlaceholderData);
  if (query.isError) {
    return (
      <ErrorState
        title={t('instructor:earnings.error.title')}
        body={t('instructor:earnings.error.body')}
        retryLabel={t('instructor:earnings.error.retry')}
        onRetry={() => query.refetch()}
      />
    );
  }
  return <EarningsSkeleton isDesktop={isDesktop} />;
}

function DesktopActions({ summary, onStatement, onRequest }) {
  const { t } = useTranslation(['instructor']);
  if (!summary) return null;
  return (
    <>
      <button type="button" onClick={onStatement} className={`${secondaryButtonClass} h-11 text-sm`}>
        <DownloadIcon size={18} />
        {t('instructor:earnings.statement.button')}
      </button>
      <RequestPayoutButton summary={summary} onRequest={onRequest} size="md" className="min-w-[220px]" />
    </>
  );
}

export default function InstructorEarningsPage() {
  const isDesktop = useIsDesktop();
  const [period, setPeriod] = useState('month');
  const [requestOpen, setRequestOpen] = useState(false);
  const [statementOpen, setStatementOpen] = useState(false);
  const [mobileType, setMobileType] = useState('all');
  const [tableFilter, setTableFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const debouncedSearch = useDebouncedValue(search.trim(), 300);

  usePayoutRequestRealtime();
  const summaryQuery = useEarningsSummary(period);
  const summary = summaryQuery.data;
  const activityType = isDesktop ? TABLE_FILTER_TYPE[tableFilter] : mobileType;
  const activity = useEarningsActivity({ period, type: activityType, search: isDesktop ? debouncedSearch : '', limit });
  const recentPayouts = useEarningsActivity({ period: 'all', type: 'payouts', limit: 3, enabled: isDesktop });
  const { onCancel, cancelling } = useCancelWithFeedback();

  // Any filter change starts the list from the first page again.
  useEffect(() => { setLimit(PAGE_SIZE); }, [period, activityType, debouncedSearch]);

  const loadMore = useCallback(() => setLimit((l) => l + PAGE_SIZE), []);
  const openRequest = useCallback(() => setRequestOpen(true), []);
  const openStatement = useCallback(() => setStatementOpen(true), []);
  useOpenRequestFromUrl(summary, openRequest);

  const renderLayout = (data, isRefreshing) => (isDesktop ? (
    <DesktopLayout
      summary={data}
      activity={activity}
      recentPayouts={recentPayouts}
      table={{ filter: tableFilter, setFilter: setTableFilter, search, setSearch, loadMore }}
      onCancel={onCancel}
      cancelling={cancelling}
      isRefreshing={isRefreshing}
    />
  ) : (
    <MobileLayout
      summary={data}
      activity={activity}
      mobileType={mobileType}
      setMobileType={setMobileType}
      loadMore={loadMore}
      onCancel={onCancel}
      cancelling={cancelling}
      onOpenStatement={openStatement}
      isRefreshing={isRefreshing}
    />
  ));

  return (
    <div
      data-testid="instructor-earnings-page"
      data-layout={isDesktop ? 'desktop' : 'mobile'}
      className={`mx-auto flex w-full flex-col ${isDesktop ? 'max-w-7xl gap-5 p-6 xl:p-8' : 'max-w-xl gap-3.5 px-4 pt-4'}`}
    >
      <PageHeader
        summary={summary}
        isDesktop={isDesktop}
        period={period}
        onPeriodChange={setPeriod}
        actions={isDesktop ? <DesktopActions summary={summary} onStatement={openStatement} onRequest={openRequest} /> : null}
      />
      <SummaryGate query={summaryQuery} isDesktop={isDesktop}>{renderLayout}</SummaryGate>
      {!isDesktop && summary && (
        <div className="sticky bottom-0 z-20 -mx-4 mt-2 border-t border-slate-200 bg-slate-50/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] pt-3 backdrop-blur">
          <RequestPayoutButton summary={summary} onRequest={openRequest} size="lg" className="w-full" />
        </div>
      )}
      {summary && (
        <RequestPayoutSheet open={requestOpen} onClose={() => setRequestOpen(false)} isDesktop={isDesktop} summary={summary} />
      )}
      <StatementDialog open={statementOpen} onClose={() => setStatementOpen(false)} />
    </div>
  );
}
