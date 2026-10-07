import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Drawer, Modal } from 'antd';
import { CheckIcon } from './EarningsIcons';
import { primaryButtonClass, secondaryButtonClass } from './earningsStyles';
import { dec, parseAmount, useMoney, validatePayoutAmount } from '../earningsFormat';
import { useCreatePayoutRequest } from '../useEarnings';

const METHODS = ['bank_transfer', 'cash', 'other'];
const NOTE_MAX = 500;

// Maps the backend's error codes (instructorPayoutService) to a message key.
const serverErrorKey = (error) => {
  const { status, data } = error?.response ?? {};
  if (status === 409) return 'pending';
  if (data?.code === 'AMOUNT_EXCEEDS_AVAILABLE') return 'max';
  if (data?.code === 'BELOW_THRESHOLD') return 'min';
  return 'generic';
};

function MethodPicker({ value, onChange, labelId }) {
  const { t } = useTranslation(['instructor']);
  const labels = {
    bank_transfer: t('instructor:earnings.methods.bank_transfer'),
    cash: t('instructor:earnings.methods.cash'),
    other: t('instructor:earnings.methods.other'),
  };
  return (
    <div role="radiogroup" aria-labelledby={labelId} className="grid grid-cols-3 gap-2">
      {METHODS.map((m) => {
        const active = value === m;
        return (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(m)}
            className={[
              'h-11 rounded-xl border px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00798c]',
              active ? 'border-[#00798c] bg-cyan-50 font-semibold text-[#00687a]' : 'border-slate-300 bg-white font-medium text-slate-700 hover:bg-slate-50',
            ].join(' ')}
          >
            {labels[m]}
          </button>
        );
      })}
    </div>
  );
}

function SuccessView({ amount, onClose }) {
  const { t } = useTranslation(['instructor']);
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-8 text-center" role="status" data-testid="payout-request-success">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
        <CheckIcon size={28} />
      </span>
      <p className="text-lg font-semibold text-slate-900">{t('instructor:earnings.request.successTitle')}</p>
      <p className="font-duotone-bold-extended text-3xl tabular-nums text-slate-900">{amount}</p>
      <p className="max-w-xs text-sm text-slate-700">{t('instructor:earnings.request.successBody')}</p>
      <button type="button" onClick={onClose} className={`${primaryButtonClass} mt-2 h-12 w-full text-base`}>
        {t('instructor:earnings.request.done')}
      </button>
    </div>
  );
}

function useAmountErrorText(validation, { available, minimum, money }) {
  const { t } = useTranslation(['instructor']);
  if (!validation) return null;
  return {
    required: t('instructor:earnings.request.errors.required'),
    invalid: t('instructor:earnings.request.errors.invalid'),
    max: t('instructor:earnings.request.errors.max', { amount: money(available) }),
    min: t('instructor:earnings.request.errors.min', { amount: money(minimum) }),
  }[validation.key];
}

function useServerErrorText(mutation, { available, minimum, money }) {
  const { t } = useTranslation(['instructor']);
  if (!mutation.isError) return null;
  return {
    pending: t('instructor:earnings.request.errors.pending'),
    max: t('instructor:earnings.request.errors.max', { amount: money(available) }),
    min: t('instructor:earnings.request.errors.min', { amount: money(minimum) }),
    generic: t('instructor:earnings.request.errors.generic'),
  }[serverErrorKey(mutation.error)];
}

function AmountField({ id, currency, value, onChange, onBlur, onUseMax, error, hint }) {
  const { t } = useTranslation(['instructor']);
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-semibold uppercase tracking-wide text-slate-600">
        {t('instructor:earnings.request.amount')}
      </label>
      <div className={`flex h-12 items-center gap-2 rounded-xl border bg-white px-3 focus-within:ring-2 focus-within:ring-[#00798c]/40 ${error ? 'border-rose-500' : 'border-slate-300'}`}>
        <span className="text-base font-semibold text-slate-600" aria-hidden="true">{currency === 'EUR' ? '€' : currency}</span>
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          aria-invalid={Boolean(error)}
          aria-describedby={`${id}-help`}
          className="h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-lg font-semibold tabular-nums text-slate-900 focus:outline-none focus:ring-0"
        />
        <button
          type="button"
          onClick={onUseMax}
          className="shrink-0 rounded-lg px-2 py-1 text-sm font-semibold text-[#00798c] hover:bg-cyan-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00798c]"
        >
          {t('instructor:earnings.request.useMax')}
        </button>
      </div>
      <p id={`${id}-help`} className={`text-xs ${error ? 'font-medium text-rose-700' : 'text-slate-600'}`} role={error ? 'alert' : undefined}>
        {error || hint}
      </p>
    </div>
  );
}

function RequestForm({ summary, onSuccess, onClose }) {
  const { t } = useTranslation(['instructor']);
  const { money } = useMoney(summary.currency);
  const ids = useId();
  const available = summary.balances?.available ?? 0;
  const minimum = summary.threshold?.amount ?? null;
  const [amount, setAmount] = useState(() => dec(available).toFixed(2));
  const [method, setMethod] = useState('bank_transfer');
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);
  const mutation = useCreatePayoutRequest();

  const validation = validatePayoutAmount(amount, { available, minimum });
  const errorText = useAmountErrorText(validation, { available, minimum, money });
  const serverError = useServerErrorText(mutation, { available, minimum, money });
  const parsed = parseAmount(amount);
  const submitAmount = parsed.value ? parsed.value.toDecimalPlaces(2) : dec(0);

  const handleSubmit = (event) => {
    event.preventDefault();
    setTouched(true);
    if (validation || mutation.isPending) return;
    mutation.mutate(
      { amount: submitAmount.toNumber(), preferredMethod: method, note: note.trim() || undefined },
      { onSuccess: () => onSuccess(money(submitAmount)) },
    );
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5 px-5 pb-5 pt-2 sm:px-6">
      <p className="text-sm text-slate-700">{t('instructor:earnings.request.subtitle', { amount: money(available) })}</p>

      <AmountField
        id={`${ids}-amount`}
        currency={summary.currency}
        value={amount}
        onChange={setAmount}
        onBlur={() => setTouched(true)}
        onUseMax={() => { setAmount(dec(available).toFixed(2)); setTouched(true); }}
        error={touched ? errorText : null}
        hint={t('instructor:earnings.request.amountHint', { min: money(minimum ?? 0), max: money(available) })}
      />

      <div className="flex flex-col gap-1.5">
        <span id={`${ids}-method`} className="text-xs font-semibold uppercase tracking-wide text-slate-600">{t('instructor:earnings.request.method')}</span>
        <MethodPicker value={method} onChange={setMethod} labelId={`${ids}-method`} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${ids}-note`} className="text-xs font-semibold uppercase tracking-wide text-slate-600">{t('instructor:earnings.request.note')}</label>
        <textarea
          id={`${ids}-note`}
          rows={3}
          maxLength={NOTE_MAX}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('instructor:earnings.request.notePlaceholder')}
          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus:border-[#00798c] focus:outline-none focus:ring-2 focus:ring-[#00798c]/40"
        />
        <span className="self-end text-xs tabular-nums text-slate-600">{t('instructor:earnings.request.noteCount', { used: note.length, max: NOTE_MAX })}</span>
      </div>

      {serverError && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800">{serverError}</p>}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onClose} className={`${secondaryButtonClass} h-12 sm:h-11`}>{t('instructor:earnings.request.close')}</button>
        <button type="submit" disabled={mutation.isPending} className={`${primaryButtonClass} h-12 text-base sm:h-11 sm:text-sm`}>
          {mutation.isPending
            ? t('instructor:earnings.request.sending')
            : t('instructor:earnings.request.submit', { amount: money(submitAmount) })}
        </button>
      </div>
    </form>
  );
}

/**
 * Payout request flow: bottom sheet on mobile, centered modal on desktop.
 * form → confirm → success ("Request sent — your manager has been notified").
 */
export default function RequestPayoutSheet({ open, onClose, isDesktop, summary }) {
  const { t } = useTranslation(['instructor']);
  const [successAmount, setSuccessAmount] = useState(null);
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    if (open) {
      setSuccessAmount(null);
      setFormKey((k) => k + 1);
    }
  }, [open]);

  const title = successAmount ? null : t('instructor:earnings.request.title');
  const content = successAmount
    ? <SuccessView amount={successAmount} onClose={onClose} />
    : <RequestForm key={formKey} summary={summary} onSuccess={setSuccessAmount} onClose={onClose} />;

  if (isDesktop) {
    return (
      <Modal open={open} onCancel={onClose} footer={null} title={title} width={480} centered destroyOnHidden>
        {content}
      </Modal>
    );
  }
  return (
    <Drawer
      open={open}
      onClose={onClose}
      placement="bottom"
      height="auto"
      title={title}
      destroyOnHidden
      styles={{
        content: { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '92vh' },
        body: { padding: 0, paddingBottom: 'env(safe-area-inset-bottom, 0px)' },
      }}
    >
      {content}
    </Drawer>
  );
}
