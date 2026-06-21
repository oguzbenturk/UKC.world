import { useState, useEffect, useMemo } from 'react';
import { Modal, Select, Input, Checkbox, Alert, Tag, Spin, Table } from 'antd';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { fetchLessonPackageTiers, previewPackageUpgrade, upgradePackage } from './customerBill/packageUpgradeApi';

// Upgrade a customer package to a bigger/better tier. On confirm, every
// already-completed lesson that drew from the package is re-priced to the new
// tier's per-hour rate (earnings / commission / wallet cascade on the backend).
// A live dry-run preview shows the exact per-lesson impact before committing.
export default function UpgradePackageModal({ open, onClose, onUpgraded, pkg }) {
  const { formatCurrency, businessCurrency } = useCurrency();

  const currency = pkg?.currency || businessCurrency || 'EUR';
  const currentSvcPkgId = pkg?.servicePackageId || pkg?.service_package_id || null;
  const currentTotalHours = Number(pkg?.totalHours ?? pkg?.total_hours ?? 0);
  const usedHours = Number(pkg?.usedHours ?? pkg?.used_hours ?? 0);
  const currentPrice = Number(pkg?.price ?? pkg?.purchase_price ?? 0);

  const [tiers, setTiers] = useState([]);
  const [loadingTiers, setLoadingTiers] = useState(false);
  const [selectedTierId, setSelectedTierId] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [reason, setReason] = useState('');
  const [settleWallet, setSettleWallet] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    setSelectedTierId(null);
    setPreview(null);
    setReason('');
    setSettleWallet(true);
    setError(null);
    setLoadingTiers(true);
    fetchLessonPackageTiers()
      .then(setTiers)
      .finally(() => setLoadingTiers(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Candidate tiers: lesson packages with at least the current/used hours,
  // excluding the package's current tier.
  const eligibleTiers = useMemo(() => {
    const floor = Math.max(currentTotalHours, usedHours);
    return (tiers || [])
      .filter((t) => String(t.id) !== String(currentSvcPkgId) && Number(t.totalHours) >= floor - 0.0001)
      .sort((a, b) => (Number(a.totalHours) - Number(b.totalHours)) || (Number(a.price) - Number(b.price)));
  }, [tiers, currentSvcPkgId, currentTotalHours, usedHours]);

  useEffect(() => {
    if (!open || !selectedTierId) { setPreview(null); return; }
    let cancelled = false;
    setLoadingPreview(true);
    setError(null);
    previewPackageUpgrade({ packageId: pkg.id, newServicePackageId: selectedTierId, settleWallet })
      .then((res) => { if (!cancelled) setPreview(res); })
      .catch((err) => { if (!cancelled) { setError(err?.message || 'Failed to preview upgrade'); setPreview(null); } })
      .finally(() => { if (!cancelled) setLoadingPreview(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTierId, open]);

  const delta = preview ? Number(preview.delta) || 0 : 0;
  const newPerHour = preview && preview.newRatePerHour != null ? Number(preview.newRatePerHour) : null;
  const oldPerHour = currentTotalHours > 0 ? currentPrice / currentTotalHours : null;

  const handleSubmit = async () => {
    const reasonTrimmed = (reason || '').trim();
    if (!selectedTierId) { setError('Select a tier to upgrade to.'); return; }
    if (!reasonTrimmed) { setError('Reason is required.'); return; }
    setSubmitting(true);
    setError(null);
    try {
      const result = await upgradePackage({
        packageId: pkg.id,
        newServicePackageId: selectedTierId,
        reason: reasonTrimmed,
        settleWallet,
      });
      onUpgraded?.(result);
      onClose?.();
    } catch (err) {
      setError(err?.message || 'Failed to upgrade package');
    } finally {
      setSubmitting(false);
    }
  };

  const lessonCols = [
    { title: 'Date', dataIndex: 'date', key: 'date', render: (d) => (d ? new Date(d).toLocaleDateString() : '—') },
    {
      title: 'Lesson', key: 'lesson', render: (_, r) => (
        <span className="text-xs">
          {r.packageHours ? `${r.packageHours}h` : '—'}
          {r.paidOut && <Tag color="gold" className="!ml-1 !m-0">paid out</Tag>}
        </span>
      ),
    },
    { title: 'Old', dataIndex: 'oldAmount', key: 'old', align: 'right',
      render: (v) => <span className="tabular-nums text-slate-400 line-through text-xs">{v != null ? formatCurrency(v, currency) : '—'}</span> },
    { title: 'New', dataIndex: 'newAmount', key: 'new', align: 'right',
      render: (v) => <span className="tabular-nums font-semibold text-emerald-600">{v != null ? formatCurrency(v, currency) : '—'}</span> },
  ];

  const affected = preview?.affectedLessons || [];

  return (
    <Modal
      open={open}
      onCancel={submitting ? undefined : onClose}
      onOk={handleSubmit}
      okText="Upgrade Package"
      okButtonProps={{ loading: submitting, disabled: submitting || !preview || loadingPreview }}
      cancelButtonProps={{ disabled: submitting }}
      title="Upgrade Package"
      width={560}
      destroyOnHidden
    >
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          Move this customer onto a bigger/better tier. Completed lessons drawn from this package
          are re-priced to the new tier's per-hour rate, and the price difference settles on the wallet.
        </p>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            Current: <span className="font-semibold">{pkg?.packageName || pkg?.package_name || 'Package'}</span>
            {' · '}{currentTotalHours}h{' · '}{formatCurrency(currentPrice, currency)}
            {oldPerHour != null && <span className="text-slate-400"> ({formatCurrency(oldPerHour, currency)}/h)</span>}
          </label>
          <label className="block text-xs font-medium text-slate-600 mb-1">Upgrade to tier</label>
          {loadingTiers ? (
            <div className="py-3 text-center"><Spin size="small" /></div>
          ) : eligibleTiers.length ? (
            <Select
              className="w-full"
              placeholder="Search or select a larger tier"
              value={selectedTierId}
              onChange={setSelectedTierId}
              disabled={submitting}
              showSearch
              optionFilterProp="label"
              filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
              getPopupContainer={(trigger) => trigger.closest('.ant-modal-content') || document.body}
              options={eligibleTiers.map((t) => {
                const pph = Number(t.totalHours) > 0 ? Number(t.price) / Number(t.totalHours) : null;
                return {
                  value: t.id,
                  label: `${t.name} — ${t.totalHours}h — ${formatCurrency(Number(t.price) || 0, t.currency || currency)}${pph != null ? ` (${formatCurrency(pph, t.currency || currency)}/h)` : ''}`,
                };
              })}
            />
          ) : (
            <Alert type="info" showIcon message="No larger lesson tier is available in the catalog to upgrade to." />
          )}
        </div>

        {loadingPreview && <div className="py-4 text-center"><Spin /></div>}

        {preview && !loadingPreview && (
          <>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Price</span>
                <span className="tabular-nums">
                  <span className="text-slate-400 line-through">{formatCurrency(preview.oldPrice, currency)}</span>
                  {' → '}
                  <span className="font-semibold text-slate-700">{formatCurrency(preview.newPrice, currency)}</span>
                </span>
              </div>
              <div className="flex justify-between text-xs mt-1">
                <span className="text-slate-500">Hours</span>
                <span className="tabular-nums">{preview.oldTotalHours}h → <span className="font-semibold">{preview.newTotalHours}h</span></span>
              </div>
              {newPerHour != null && (
                <div className="flex justify-between text-xs mt-1">
                  <span className="text-slate-500">New rate / hour</span>
                  <span className="tabular-nums font-semibold text-emerald-600">{formatCurrency(newPerHour, currency)}/h</span>
                </div>
              )}
              <div className="flex justify-between text-xs mt-1 pt-1.5 border-t border-slate-200">
                <span className="text-slate-500">Wallet {delta < 0 ? 'refund' : 'charge'}</span>
                <span className={`tabular-nums font-medium ${delta < 0 ? 'text-rose-600' : 'text-amber-600'}`}>
                  {delta === 0 ? formatCurrency(0, currency) : `${delta < 0 ? '−' : '+'}${formatCurrency(Math.abs(delta), currency)}`}
                </span>
              </div>
            </div>

            {affected.length > 0 && (
              <div>
                <div className="text-xs font-medium text-slate-600 mb-1">
                  {affected.length} completed/booked lesson{affected.length === 1 ? '' : 's'} will be re-priced
                </div>
                <Table
                  size="small"
                  rowKey="bookingId"
                  columns={lessonCols}
                  dataSource={affected}
                  pagination={affected.length > 6 ? { pageSize: 6, size: 'small' } : false}
                  scroll={{ y: 220 }}
                />
              </div>
            )}

            {preview.paidOutCount > 0 && (
              <Alert
                type="warning"
                showIcon
                message={`${preview.paidOutCount} of these lessons were already paid out in payroll.`}
                description="Their settled instructor earnings are left unchanged (closed payroll). The booking value, revenue and manager commission still reflect the new rate; review payroll if you need to top up the difference."
              />
            )}
          </>
        )}

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Reason <span className="text-rose-500">*</span></label>
          <Input.TextArea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Customer upgraded to a larger package"
            rows={2}
            maxLength={500}
            disabled={submitting}
          />
        </div>

        <Checkbox checked={settleWallet} onChange={(e) => setSettleWallet(e.target.checked)} disabled={submitting}>
          <span className="text-xs text-slate-700">Auto-settle the price difference on the wallet</span>
        </Checkbox>

        {error && <Alert type="error" message={error} showIcon />}
      </div>
    </Modal>
  );
}
