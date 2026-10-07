import { useEffect, useState } from 'react';
import { Modal } from 'antd';
import { useTranslation } from 'react-i18next';
import { message } from '@/shared/utils/antdStatic';
import { formatCurrency } from '@/shared/utils/formatters';
import { usePayoutRequestActions } from '../../hooks/usePayoutRequests';

export const PAYOUT_METHODS = ['bank_transfer', 'cash', 'card', 'other'];

const fieldClass = 'w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-400/40 focus:border-sky-400';
const labelClass = 'block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5';
const primaryBtn = 'px-5 py-2.5 rounded-xl bg-sky-600 text-white text-sm font-medium shadow-sm hover:bg-sky-500 transition-colors disabled:opacity-50';
const dangerBtn = 'px-5 py-2.5 rounded-xl bg-rose-600 text-white text-sm font-medium shadow-sm hover:bg-rose-500 transition-colors disabled:opacity-50';
const secondaryBtn = 'px-5 py-2.5 rounded-xl bg-white text-slate-700 text-sm font-medium border border-slate-200 shadow-sm hover:bg-slate-50 transition-colors';

const apiErrorMessage = (error, fallback) => error?.response?.data?.error || fallback;

function ModalShell({ open, onClose, title, subtitle, children, closeLabel }) {
  return (
    <Modal open={open} onCancel={onClose} footer={null} closable={false} destroyOnHidden width={480} styles={{ content: { padding: 0 } }}>
      <div className="bg-white rounded-2xl">
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-slate-100">
          <div>
            <h3 className="text-base font-semibold text-slate-900 m-0">{title}</h3>
            {subtitle && <p className="mt-1 text-sm text-slate-500 m-0">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="text-xs font-medium text-sky-600 hover:text-sky-800 transition-colors">
            {closeLabel}
          </button>
        </div>
        {children}
      </div>
    </Modal>
  );
}

/** Pay modal: pre-filled amount (= requested), method (= instructor's preference), reference, note. */
export function PayPayoutModal({ request, open, onClose, onDone }) {
  const { t } = useTranslation(['manager']);
  const { pay } = usePayoutRequestActions();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('bank_transfer');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (open && request) {
      setAmount(String(request.amount ?? ''));
      setMethod(PAYOUT_METHODS.includes(request.preferredMethod) ? request.preferredMethod : 'bank_transfer');
      setReference('');
      setNote('');
    }
  }, [open, request]);

  if (!request) return null;
  const numericAmount = Number(amount);
  const amountValid = Number.isFinite(numericAmount) && numericAmount > 0;
  const exceedsAvailable = amountValid && request.available != null && numericAmount > Number(request.available) + 0.005;

  const submit = async () => {
    if (!amountValid) {
      message.error(t('manager:financePages.payoutRequests.payModal.amountRequired'));
      return;
    }
    try {
      await pay.mutateAsync({ id: request.id, amount: numericAmount, paymentMethod: method, referenceNumber: reference.trim(), note: note.trim() });
      message.success(t('manager:financePages.payoutRequests.payModal.success'));
      onDone?.();
      onClose();
    } catch (error) {
      message.error(apiErrorMessage(error, t('manager:financePages.payoutRequests.payModal.error')));
    }
  };

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      closeLabel={t('manager:financePages.payoutRequests.close')}
      title={t('manager:financePages.payoutRequests.payModal.title')}
      subtitle={t('manager:financePages.payoutRequests.payModal.subtitle', {
        name: request.instructorName || '—',
        amount: formatCurrency(request.amount, request.currency),
      })}
    >
      <div className="px-6 py-4 space-y-4">
        <div>
          <label className={labelClass} htmlFor="payout-pay-amount">{t('manager:financePages.payoutRequests.payModal.amount')}</label>
          <input id="payout-pay-amount" type="number" min="0" step="0.01" inputMode="decimal" className={fieldClass} value={amount} onChange={(e) => setAmount(e.target.value)} />
          {request.available != null && (
            <p className={`mt-1 text-xs ${exceedsAvailable ? 'text-amber-600' : 'text-slate-400'}`}>
              {exceedsAvailable
                ? t('manager:financePages.payoutRequests.exceedsAvailable')
                : `${t('manager:financePages.payoutRequests.availableHint')}: ${formatCurrency(request.available, request.currency)}`}
            </p>
          )}
        </div>
        <div>
          <label className={labelClass} htmlFor="payout-pay-method">{t('manager:financePages.payoutRequests.payModal.method')}</label>
          <select id="payout-pay-method" className={fieldClass} value={method} onChange={(e) => setMethod(e.target.value)}>
            {PAYOUT_METHODS.map((m) => (
              <option key={m} value={m}>{t(`manager:financePages.payoutRequests.methods.${m}`)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="payout-pay-reference">{t('manager:financePages.payoutRequests.payModal.reference')}</label>
          <input id="payout-pay-reference" type="text" maxLength={100} className={fieldClass} value={reference}
            placeholder={t('manager:financePages.payoutRequests.payModal.referencePlaceholder')} onChange={(e) => setReference(e.target.value)} />
        </div>
        <div>
          <label className={labelClass} htmlFor="payout-pay-note">{t('manager:financePages.payoutRequests.payModal.note')}</label>
          <textarea id="payout-pay-note" rows={2} maxLength={500} className={fieldClass} value={note}
            placeholder={t('manager:financePages.payoutRequests.payModal.notePlaceholder')} onChange={(e) => setNote(e.target.value)} />
        </div>
        <p className="text-xs text-slate-400 m-0">{t('manager:financePages.payoutRequests.payModal.ledgerHint')}</p>
      </div>
      <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-100">
        <button type="button" className={secondaryBtn} onClick={onClose}>{t('manager:financePages.payoutRequests.close')}</button>
        <button type="button" className={primaryBtn} disabled={pay.isPending || !amountValid} onClick={submit}>
          {t('manager:financePages.payoutRequests.payModal.submit')}
        </button>
      </div>
    </ModalShell>
  );
}

/** Decline modal: reason is required (the instructor is notified with it). */
export function DeclinePayoutModal({ request, open, onClose, onDone }) {
  const { t } = useTranslation(['manager']);
  const { reject } = usePayoutRequestActions();
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (open) setReason('');
  }, [open]);

  if (!request) return null;
  const valid = reason.trim().length > 0;

  const submit = async () => {
    if (!valid) {
      message.error(t('manager:financePages.payoutRequests.declineModal.reasonRequired'));
      return;
    }
    try {
      await reject.mutateAsync({ id: request.id, reason: reason.trim() });
      message.success(t('manager:financePages.payoutRequests.declineModal.success'));
      onDone?.();
      onClose();
    } catch (error) {
      message.error(apiErrorMessage(error, t('manager:financePages.payoutRequests.declineModal.error')));
    }
  };

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      closeLabel={t('manager:financePages.payoutRequests.close')}
      title={t('manager:financePages.payoutRequests.declineModal.title')}
      subtitle={t('manager:financePages.payoutRequests.declineModal.subtitle', {
        name: request.instructorName || '—',
        amount: formatCurrency(request.amount, request.currency),
      })}
    >
      <div className="px-6 py-4">
        <label className={labelClass} htmlFor="payout-decline-reason">{t('manager:financePages.payoutRequests.declineModal.reason')}</label>
        <textarea id="payout-decline-reason" rows={3} maxLength={500} className={fieldClass} value={reason}
          placeholder={t('manager:financePages.payoutRequests.declineModal.reasonPlaceholder')} onChange={(e) => setReason(e.target.value)} />
      </div>
      <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-100">
        <button type="button" className={secondaryBtn} onClick={onClose}>{t('manager:financePages.payoutRequests.close')}</button>
        <button type="button" className={dangerBtn} disabled={reject.isPending || !valid} onClick={submit}>
          {t('manager:financePages.payoutRequests.declineModal.submit')}
        </button>
      </div>
    </ModalShell>
  );
}
