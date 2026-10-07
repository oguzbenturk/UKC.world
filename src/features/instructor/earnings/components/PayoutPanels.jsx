import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { BankIcon, CheckIcon, ClockIcon } from './EarningsIcons';
import { BalanceTile } from './HeroCard';
import { EmptyState, ProgressBar, SectionTitle } from './ui';
import { cardClass, primaryButtonClass, secondaryButtonClass } from './earningsStyles';
import { dec, formatMethod, formatShortDate, getPayoutState, percentOf, useMoney } from '../earningsFormat';

function ShortfallText({ summary, money }) {
  const threshold = summary.threshold ?? {};
  return (
    <Trans
      i18nKey="instructor:earnings.payout.shortfall"
      values={{ amount: money(threshold.shortfall), minimum: money(threshold.amount) }}
      components={{ strong: <strong className="font-semibold text-slate-900" /> }}
    />
  );
}

/**
 * Pending request: "Payout requested · €X · <date>" with a Cancel action that
 * asks for an inline confirmation first.
 */
export function PendingRequestNotice({ summary, onCancel, cancelling = false, compact = false }) {
  const { t } = useTranslation(['instructor']);
  const { money, locale } = useMoney(summary.currency);
  const [confirming, setConfirming] = useState(false);
  const pending = summary.pendingRequest;
  if (!pending) return null;

  return (
    <div
      data-testid="pending-request"
      className={`flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 ${compact ? 'p-3' : 'p-4'}`}
    >
      <div className="flex items-start gap-2.5">
        <ClockIcon size={18} className="mt-0.5 shrink-0 text-amber-800" />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm font-semibold text-slate-900 tabular-nums">
            {t('instructor:earnings.payout.requested', {
              amount: money(pending.amount),
              date: formatShortDate(pending.createdAt, locale),
            })}
          </span>
          <span className="text-xs text-slate-700">{t('instructor:earnings.payout.requestedHint')}</span>
        </div>
      </div>
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('instructor:earnings.payout.cancelConfirm')}>
          <span className="text-sm font-medium text-slate-800">{t('instructor:earnings.payout.cancelConfirm')}</span>
          <div className="ml-auto flex gap-2">
            <button type="button" className={`${secondaryButtonClass} h-10 text-sm`} onClick={() => setConfirming(false)} disabled={cancelling}>
              {t('instructor:earnings.payout.keep')}
            </button>
            <button
              type="button"
              className="inline-flex h-10 items-center rounded-xl bg-rose-700 px-4 text-sm font-semibold text-white hover:bg-rose-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-700 focus-visible:ring-offset-2 disabled:opacity-60"
              onClick={async () => {
                await onCancel(pending.id);
                setConfirming(false);
              }}
              disabled={cancelling}
            >
              {t('instructor:earnings.payout.confirmCancel')}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="self-start rounded-lg px-1 py-1 text-sm font-semibold text-[#00798c] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00798c]"
        >
          {t('instructor:earnings.payout.cancel')}
        </button>
      )}
    </div>
  );
}

function LastPayoutRow({ summary }) {
  const { t } = useTranslation(['instructor']);
  const { money, locale } = useMoney(summary.currency);
  const last = summary.lastPayout;
  if (!last) {
    return (
      <div className="rounded-xl bg-slate-50 px-3 py-3">
        <p className="text-sm font-semibold text-slate-800">{t('instructor:earnings.payout.noPayouts')}</p>
        <p className="mt-0.5 text-xs text-slate-600">{t('instructor:earnings.payout.noPayoutsHint')}</p>
      </div>
    );
  }
  const meta = [formatMethod(last.method, t), last.reference].filter(Boolean).join(' · ');
  return (
    <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-50 text-[#00687a]">
        <BankIcon size={20} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-semibold text-slate-900">
          {t('instructor:earnings.payout.lastPayout', { date: formatShortDate(last.date, locale) })}
        </span>
        {meta && <span className="truncate text-xs text-slate-600">{meta}</span>}
      </div>
      <div className="flex flex-col items-end gap-0.5">
        <span className="text-sm font-bold tabular-nums text-slate-900">{money(last.amount)}</span>
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
          <CheckIcon size={12} />
          {t('instructor:earnings.status.paid')}
        </span>
      </div>
    </div>
  );
}

function ThresholdStatus({ summary, money }) {
  const { t } = useTranslation(['instructor']);
  const state = getPayoutState(summary);
  if (state.kind === 'below') {
    return (
      <p className="flex items-center gap-1.5 text-sm text-slate-700">
        <ClockIcon size={16} className="shrink-0 text-amber-800" />
        <span><ShortfallText summary={summary} money={money} /></span>
      </p>
    );
  }
  return (
    <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-800">
      <CheckIcon size={16} className="shrink-0 text-emerald-700" />
      {state.kind === 'pending' ? t('instructor:earnings.payout.alreadyRequested') : t('instructor:earnings.payout.canRequest')}
    </p>
  );
}

// Mobile payout card: threshold progress, status line, pending request, last payout.
export function PayoutCard({ summary, onCancel, cancelling }) {
  const { t } = useTranslation(['instructor']);
  const { money } = useMoney(summary.currency);
  const threshold = summary.threshold ?? {};
  const progress = percentOf(summary.balances?.available, threshold.amount);

  return (
    <section aria-labelledby="earnings-payout-title" className={`${cardClass} flex flex-col gap-3 p-5`}>
      <div className="flex items-baseline justify-between gap-2">
        <SectionTitle className="text-base" as="h2"><span id="earnings-payout-title">{t('instructor:earnings.payout.title')}</span></SectionTitle>
        {threshold.amount != null && (
          <span className="text-sm text-slate-600">{t('instructor:earnings.payout.minimum', { amount: money(threshold.amount) })}</span>
        )}
      </div>
      <ProgressBar value={progress} label={t('instructor:earnings.payout.progressLabel')} />
      <ThresholdStatus summary={summary} money={money} />
      <PendingRequestNotice summary={summary} onCancel={onCancel} cancelling={cancelling} />
      <LastPayoutRow summary={summary} />
    </section>
  );
}

// Desktop balances column: Ready for payout (+ progress) · Paid out · Total earned.
export function BalancesCard({ summary }) {
  const { t } = useTranslation(['instructor']);
  const { money } = useMoney(summary.currency);
  const balances = summary.balances ?? {};
  const threshold = summary.threshold ?? {};
  const progress = percentOf(balances.available, threshold.amount);
  const state = getPayoutState(summary);
  const showGross = balances.paidOutGross != null && !dec(balances.paidOutGross).eq(dec(balances.paidOutNet));

  return (
    <section aria-label={t('instructor:earnings.balances.title')} className={`${cardClass} flex flex-col gap-3 p-5`}>
      <div className="flex flex-col gap-2 rounded-xl bg-amber-50 p-4">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-800">
          <ClockIcon size={16} />
          {t('instructor:earnings.balances.ready')}
        </span>
        <span className="text-3xl font-bold tabular-nums text-slate-900">{money(balances.available)}</span>
        <ProgressBar value={progress} label={t('instructor:earnings.payout.progressLabel')} height="h-2" />
        <span className="text-xs text-slate-700">
          {state.kind === 'below'
            ? <ShortfallText summary={summary} money={money} />
            : t('instructor:earnings.payout.aboveMinimum', { amount: money(threshold.amount) })}
        </span>
      </div>
      <BalanceTile
        variant="paid"
        label={t('instructor:earnings.balances.paidOut')}
        amount={money(balances.paidOutNet)}
        hint={showGross ? t('instructor:earnings.balances.gross', { amount: money(balances.paidOutGross) }) : null}
      />
      <div className="flex flex-col gap-1 rounded-xl border border-slate-200 p-3">
        <span className="text-xs font-semibold text-slate-600">{t('instructor:earnings.balances.totalEarned')}</span>
        <span className="text-xl font-bold tabular-nums text-slate-900">{money(balances.totalEarned)}</span>
      </div>
    </section>
  );
}

// Desktop: pending request + recent payouts list.
export function RecentPayoutsCard({ summary, payouts = [], loading, onCancel, cancelling, onShowAll }) {
  const { t } = useTranslation(['instructor']);
  const { money, locale } = useMoney(summary.currency);

  return (
    <section aria-labelledby="earnings-recent-payouts" className={`${cardClass} flex flex-col gap-3 p-5`}>
      <SectionTitle><span id="earnings-recent-payouts">{t('instructor:earnings.payout.recent')}</span></SectionTitle>
      <PendingRequestNotice summary={summary} onCancel={onCancel} cancelling={cancelling} compact />
      {loading && !payouts.length ? (
        <div className="space-y-2" aria-hidden="true">
          {[0, 1, 2].map((k) => <div key={k} className="h-12 rounded-xl bg-slate-200 motion-safe:animate-pulse" />)}
        </div>
      ) : payouts.length ? (
        <ul className="divide-y divide-slate-100">
          {payouts.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
              <span className="flex min-w-0 flex-col">
                <span className="text-sm font-semibold text-slate-900">{formatShortDate(p.date, locale)}</span>
                <span className="truncate text-xs text-slate-600">{[formatMethod(p.method, t), p.reference].filter(Boolean).join(' · ')}</span>
              </span>
              <span className="flex flex-col items-end">
                <span className="text-sm font-bold tabular-nums text-slate-900">{money(p.amount)}</span>
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                  <CheckIcon size={12} />
                  {t('instructor:earnings.status.paid')}
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title={t('instructor:earnings.payout.noPayouts')} hint={t('instructor:earnings.payout.noPayoutsHint')} className="py-4" />
      )}
      {payouts.length > 0 && onShowAll && (
        <button type="button" onClick={onShowAll} className="self-start rounded-lg py-1 text-sm font-semibold text-[#00798c] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00798c]">
          {t('instructor:earnings.payout.allPayouts')}
        </button>
      )}
    </section>
  );
}

/**
 * The primary action. Three states:
 *  - ready:   "Request payout · €X"
 *  - pending: "Payout requested · €X" (disabled) — cancel lives in PendingRequestNotice
 *  - below:   disabled + "€Y more to reach the €200 minimum"
 */
export function RequestPayoutButton({ summary, onRequest, size = 'lg', className = '', showExplanation = true }) {
  const { t } = useTranslation(['instructor']);
  const { money } = useMoney(summary.currency);
  const state = getPayoutState(summary);
  const height = size === 'lg' ? 'h-12 text-base' : 'h-11 text-sm';
  const explanationId = 'earnings-request-explanation';

  if (state.kind === 'pending') {
    return (
      <div
        role="status"
        data-testid="request-payout-button"
        className={`inline-flex items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 font-semibold text-slate-900 ${height} ${className}`}
      >
        <ClockIcon size={18} className="text-amber-800" />
        {t('instructor:earnings.payout.requestedShort', { amount: money(state.pending.amount) })}
      </div>
    );
  }

  const disabled = state.kind === 'below';
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <button
        type="button"
        data-testid="request-payout-button"
        onClick={onRequest}
        disabled={disabled}
        aria-describedby={disabled && showExplanation ? explanationId : undefined}
        className={`${primaryButtonClass} ${height} w-full`}
      >
        {t('instructor:earnings.request.button', { amount: money(state.available) })}
      </button>
      {disabled && showExplanation && (
        <p id={explanationId} className="text-center text-xs text-slate-700">
          <ShortfallText summary={summary} money={money} />
        </p>
      )}
    </div>
  );
}
