import { useState, useEffect, useMemo } from 'react';
import { Modal, InputNumber, Input, Alert, Select, Tag, Checkbox } from 'antd';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { updateShopOrderItemPrice } from './customerBill/shopOrderItemPriceApi';
import { useApiSubmit, PriceSummaryRows } from './customerBill/priceModalBits';

// Direct edit of a shop order line-item's unit price, after the sale.
//
// Records-only: it updates the order's stored prices/totals and recomputes
// downstream finance figures (commission, discount, profit) on the backend,
// but it never moves the customer's wallet balance and never changes the
// catalog product price.
//
// The price may be entered in any active currency; the value is converted to
// the order's currency server-side (the live preview here is an approximation).
export default function EditShopItemPriceModal({
  open,
  onClose,
  onSaved,
  orderId,
  item,
  orderCurrency = 'EUR',
}) {
  const { formatCurrency, convertCurrency, getSupportedCurrencies } = useCurrency();
  const cur = (orderCurrency || 'EUR').toUpperCase();

  const qty = Number(item?.quantity) || 1;
  const currentUnit = Number(item?.unit_price) || 0;
  const originalUnit = item?.original_unit_price;

  const [inputCurrency, setInputCurrency] = useState(cur);
  const [newPrice, setNewPrice] = useState(currentUnit);
  const [reason, setReason] = useState('');
  const [settleWallet, setSettleWallet] = useState(true);
  const { submitting, error, setError, run } = useApiSubmit();

  // Reset only on open transition; depending on item would clobber input if the
  // parent re-fetches mid-edit.
  useEffect(() => {
    if (open) {
      setInputCurrency(cur);
      setNewPrice(Number(item?.unit_price) || 0);
      setReason('');
      setSettleWallet(true);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const currencyOptions = useMemo(() => {
    const opts = (getSupportedCurrencies?.() || []).map((c) => ({ label: `${c.value} · ${c.symbol}`, value: c.value }));
    if (!opts.some((o) => o.value === cur)) opts.unshift({ label: cur, value: cur });
    return opts;
  }, [getSupportedCurrencies, cur]);

  // Unit price expressed in the order's currency (what actually gets stored).
  // convertCurrency rounds up for display — the backend Decimal conversion is
  // authoritative, so this is a preview only.
  const newUnitInOrderCur = useMemo(() => {
    const v = Number(newPrice) || 0;
    if (inputCurrency === cur) return v;
    return convertCurrency(v, inputCurrency, cur);
  }, [newPrice, inputCurrency, cur, convertCurrency]);

  const newLineTotal = Math.round(newUnitInOrderCur * qty * 100) / 100;
  const delta = Math.round((newUnitInOrderCur - currentUnit) * 100) / 100;
  // What actually moves on the wallet = the whole line delta (× qty).
  const currentLineTotal = Number(item?.total_price) || 0;
  const lineDelta = Math.round((newLineTotal - currentLineTotal) * 100) / 100;
  const showOriginalRow =
    originalUnit !== null && originalUnit !== undefined && Number(originalUnit) !== currentUnit;

  const handleSubmit = () => {
    const reasonTrimmed = (reason || '').trim();
    run(
      async () => {
        const result = await updateShopOrderItemPrice({
          orderId,
          itemId: item.id,
          newUnitPrice: Number(newPrice),
          reason: reasonTrimmed,
          inputCurrency,
          settleWallet,
        });
        onSaved?.(result);
        onClose?.();
      },
      {
        validate: () => {
          if (!Number.isFinite(Number(newPrice)) || Number(newPrice) < 0) return 'Price must be zero or greater.';
          return null;
        },
      }
    );
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      onOk={handleSubmit}
      okText="Save New Price"
      okButtonProps={{ loading: submitting, disabled: submitting }}
      cancelButtonProps={{ disabled: submitting }}
      title="Edit Item Price"
      width={460}
      destroyOnHidden
    >
      {item && (
        <div className="text-sm text-slate-700 mb-3 font-medium">
          {item.product_name}
          <span className="text-slate-400 font-normal"> · qty {qty}</span>
        </div>
      )}

      <PriceSummaryRows
        currency={cur}
        originalPrice={showOriginalRow ? originalUnit : null}
        currentPrice={currentUnit}
        finalPrice={newUnitInOrderCur}
        finalLabel="New unit"
        delta={delta}
      />

      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">New unit price</label>
          <div className="flex gap-2">
            <InputNumber
              min={0}
              step={1}
              value={newPrice}
              onChange={(v) => setNewPrice(v ?? 0)}
              className="w-full"
              disabled={submitting}
            />
            <Select
              value={inputCurrency}
              onChange={setInputCurrency}
              options={currencyOptions}
              disabled={submitting}
              style={{ width: 110 }}
            />
          </div>
          {inputCurrency !== cur && (
            <p className="text-[11px] text-slate-500 mt-1">
              ≈ {formatCurrency(newUnitInOrderCur, cur)} per unit · stored in {cur} (converted on save)
            </p>
          )}
          <p className="text-[11px] text-slate-500 mt-1">
            Line total: <span className="font-medium text-slate-700">{formatCurrency(newLineTotal, cur)}</span>
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            Reason <span className="text-slate-400 font-normal">(optional)</span>
          </label>
          <Input.TextArea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Optional note, e.g. price agreed after sale, revised invoice…"
            rows={2}
            disabled={submitting}
            maxLength={500}
          />
        </div>

        <div className="flex items-start gap-2">
          <Checkbox
            checked={settleWallet}
            onChange={(e) => setSettleWallet(e.target.checked)}
            disabled={submitting}
          >
            <span className="text-xs text-slate-700">
              Charge / refund the difference to the customer&apos;s wallet
              {lineDelta !== 0 && (
                <span className="text-slate-500">
                  {' '}({lineDelta < 0 ? 'refund' : 'charge'} {formatCurrency(Math.abs(lineDelta), cur)})
                </span>
              )}
            </span>
          </Checkbox>
        </div>

        <Alert
          type="info"
          showIcon
          className="!text-xs"
          message={
            settleWallet
              ? "Updates the order total, finance reports, discount and manager commission, and records the change in the customer's wallet & financial history. The product's catalog price is not changed."
              : "Records-only: updates the order total and reports but does NOT change the customer's wallet balance. The product's catalog price is not changed."
          }
        />

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
