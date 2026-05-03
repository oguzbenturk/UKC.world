import { useState, useEffect } from 'react';
import { Modal, InputNumber, Input, Alert, Tag } from 'antd';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { applyDiscount as apiApplyDiscount, removeDiscount as apiRemoveDiscount } from './customerBill/discountApi';
import { useApiSubmit, PriceSummaryRows } from './customerBill/priceModalBits';

// Reusable single-line discount editor.
//
// Props:
//   open, onClose, onSaved
//   customerId      - required, UUID of the customer whose price is being adjusted
//   entityType      - 'booking' | 'rental' | 'accommodation_booking' | 'customer_package' | 'member_purchase' | 'shop_order'
//   entityId        - id of the source record
//   originalPrice   - the price (after voucher / package logic) that the % applies to
//   currency        - currency code for display
//   existingDiscount  (optional) - the current discounts row for this entity, if any
//   description     - short label shown in the modal title (e.g. "Booking #1234 — Beginner Lesson")
//
// Emits onSaved() with the API result so the parent can invalidate caches.
export default function ApplyDiscountModal({
  open,
  onClose,
  onSaved,
  customerId,
  entityType,
  entityId,
  originalPrice,
  currency,
  existingDiscount = null,
  description = '',
  participantUserId = null,
}) {
  const { businessCurrency } = useCurrency();
  const cur = currency || businessCurrency || 'EUR';

  const [percent, setPercent] = useState(0);
  const [reason, setReason] = useState('');
  const { submitting, error, setError, run } = useApiSubmit();

  useEffect(() => {
    if (open) {
      setPercent(existingDiscount?.percent ? Number(existingDiscount.percent) : 0);
      setReason(existingDiscount?.reason || '');
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const orig = Number(originalPrice) || 0;
  const pct = Number(percent) || 0;
  const previewAmount = Math.max(0, orig - (orig * pct) / 100);
  const discountAmount = Math.max(0, orig - previewAmount);

  const handleSubmit = () => run(async () => {
    const result = await apiApplyDiscount({
      customerId,
      entityType,
      entityId,
      percent: Number(percent) || 0,
      reason: reason || null,
      participantUserId,
    });
    onSaved?.(result);
    onClose?.();
  });

  const handleRemove = () => {
    if (!existingDiscount?.id) return;
    run(async () => {
      await apiRemoveDiscount(existingDiscount.id);
      onSaved?.({ deleted: true });
      onClose?.();
    });
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      onOk={handleSubmit}
      okText={existingDiscount ? 'Update Discount' : 'Apply Discount'}
      okButtonProps={{ loading: submitting, disabled: submitting }}
      cancelButtonProps={{ disabled: submitting }}
      title="Apply Discount"
      width={460}
      destroyOnHidden
    >
      {description && (
        <div className="text-sm text-slate-600 mb-3">{description}</div>
      )}

      <PriceSummaryRows
        currency={cur}
        originalPrice={orig}
        discountAmount={discountAmount}
        finalPrice={previewAmount}
      />

      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Percent off</label>
          <InputNumber
            min={0}
            max={100}
            step={1}
            value={percent}
            onChange={v => setPercent(v ?? 0)}
            addonAfter="%"
            className="w-full"
            disabled={submitting}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Reason (optional)</label>
          <Input.TextArea
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="e.g. Friend & family, complaint resolution, loyalty bonus…"
            rows={2}
            disabled={submitting}
            maxLength={500}
          />
        </div>
        {existingDiscount?.id && (
          <div className="flex items-center gap-2">
            <Tag color="orange">Existing discount</Tag>
            <button
              type="button"
              onClick={handleRemove}
              disabled={submitting}
              className="text-xs text-rose-600 hover:text-rose-700 underline disabled:opacity-50"
            >
              Remove discount
            </button>
          </div>
        )}
        {error && <Alert type="error" message={error} showIcon />}
      </div>
    </Modal>
  );
}
