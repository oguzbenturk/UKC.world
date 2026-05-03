import { useState, useEffect } from 'react';
import { Modal, InputNumber, Input, Alert, Checkbox, Tag } from 'antd';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { updatePackagePrice } from './customerBill/packagePriceApi';

// Direct edit of a customer package's purchase_price.
//
// Distinct from ApplyDiscountModal: that one layers a percent discount on
// top of the package's price. This one mutates the underlying
// purchase_price, then auto-settles the wallet for the delta and
// recomputes any layered discount + pending manager commissions on the
// backend.
export default function EditPackagePriceModal({
  open,
  onClose,
  onSaved,
  packageId,
  currentPrice,
  originalPrice = null,
  currency,
  description = '',
}) {
  const { formatCurrency, businessCurrency } = useCurrency();
  const cur = currency || businessCurrency || 'EUR';

  const [newPrice, setNewPrice] = useState(currentPrice ?? 0);
  const [reason, setReason] = useState('');
  const [settleWallet, setSettleWallet] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Reset only on open transition; depending on currentPrice would clobber
  // user input if the parent re-fetches mid-edit.
  useEffect(() => {
    if (open) {
      setNewPrice(Number(currentPrice) || 0);
      setReason('');
      setSettleWallet(true);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const delta = Math.round(((Number(newPrice) || 0) - (Number(currentPrice) || 0)) * 100) / 100;

  const handleSubmit = async () => {
    const reasonTrimmed = (reason || '').trim();
    if (!reasonTrimmed) {
      setError('Reason is required.');
      return;
    }
    if (!Number.isFinite(Number(newPrice)) || Number(newPrice) < 0) {
      setError('Price must be zero or greater.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await updatePackagePrice({
        packageId,
        newPrice: Number(newPrice),
        reason: reasonTrimmed,
        settleWallet,
      });
      onSaved?.(result);
      onClose?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const showOriginalRow = originalPrice !== null && originalPrice !== undefined && Number(originalPrice) !== Number(currentPrice);

  return (
    <Modal
      open={open}
      onCancel={onClose}
      onOk={handleSubmit}
      okText="Save New Price"
      okButtonProps={{ loading: submitting, disabled: submitting }}
      cancelButtonProps={{ disabled: submitting }}
      title="Edit Package Price"
      width={460}
      destroyOnHidden
    >
      {description && (
        <div className="text-sm text-slate-600 mb-3">{description}</div>
      )}

      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 mb-3">
        {showOriginalRow && (
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">Original</span>
            <span className="tabular-nums text-slate-500 line-through">{formatCurrency(originalPrice || 0, cur)}</span>
          </div>
        )}
        <div className="flex justify-between text-xs mt-1">
          <span className="text-slate-500">Current</span>
          <span className="tabular-nums font-medium text-slate-700">{formatCurrency(currentPrice || 0, cur)}</span>
        </div>
        <div className="flex justify-between text-sm mt-1.5 pt-1.5 border-t border-slate-200">
          <span className="font-semibold text-slate-700">New</span>
          <span className="tabular-nums font-bold text-emerald-600">{formatCurrency(Number(newPrice) || 0, cur)}</span>
        </div>
        {delta !== 0 && (
          <div className="flex justify-between text-xs mt-1">
            <span className="text-slate-500">Delta</span>
            <span className={`tabular-nums font-medium ${delta < 0 ? 'text-rose-600' : 'text-amber-600'}`}>
              {delta < 0 ? '−' : '+'}{formatCurrency(Math.abs(delta), cur)}
            </span>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">New price</label>
          <InputNumber
            min={0}
            step={1}
            value={newPrice}
            onChange={v => setNewPrice(v ?? 0)}
            addonAfter={cur}
            className="w-full"
            disabled={submitting}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Reason <span className="text-rose-500">*</span></label>
          <Input.TextArea
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="e.g. Revised invoice, manager override, complaint resolution…"
            rows={2}
            disabled={submitting}
            maxLength={500}
          />
        </div>
        <div className="flex items-start gap-2">
          <Checkbox
            checked={settleWallet}
            onChange={e => setSettleWallet(e.target.checked)}
            disabled={submitting}
          >
            <span className="text-xs text-slate-700">
              Auto-settle wallet
              {delta !== 0 && (
                <span className="text-slate-500">
                  {' '}({delta < 0 ? 'credit' : 'debit'} {formatCurrency(Math.abs(delta), cur)} to wallet)
                </span>
              )}
            </span>
          </Checkbox>
        </div>
        {showOriginalRow && (
          <div className="flex items-center gap-2">
            <Tag color="blue">Previously edited</Tag>
            <span className="text-xs text-slate-500">First price preserved as the original.</span>
          </div>
        )}
        {error && <Alert type="error" message={error} showIcon />}
      </div>
    </Modal>
  );
}
