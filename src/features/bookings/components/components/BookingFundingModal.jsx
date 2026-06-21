import { useState, useEffect, useMemo } from 'react';
import { Modal, Select, Alert, Spin, Tag } from 'antd';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { fetchCustomerPackagesForFunding, switchBookingFunding } from './bookingFundingApi';

// Switch an existing booking between cash and package funding from the detail
// view. cash → package draws the lesson's hours from the customer's packages
// (overflow stays as a cash 'partial' leg) and refunds the cash charged.
// package → cash restores the hours and re-charges the lesson at the cash rate.
export default function BookingFundingModal({ open, onClose, booking, onDone }) {
  const { formatCurrency, businessCurrency } = useCurrency();
  const currency = booking?.currency || businessCurrency || 'EUR';

  const isPackageFunded = !!(booking?.customer_package_id) &&
    (booking?.payment_status === 'package' || booking?.payment_status === 'partial');
  const mode = isPackageFunded ? 'cash' : 'package';

  const [packages, setPackages] = useState([]);
  const [loadingPkgs, setLoadingPkgs] = useState(false);
  const [selectedPackageId, setSelectedPackageId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const customerId = booking?.student_user_id || booking?.studentId || null;

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSelectedPackageId(null);
    setSubmitting(false);
    if (mode === 'package' && customerId) {
      setLoadingPkgs(true);
      fetchCustomerPackagesForFunding(customerId)
        .then((rows) => setPackages(rows))
        .finally(() => setLoadingPkgs(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Eligible packages: lesson packages with hours left.
  const eligible = useMemo(() => {
    return (packages || []).filter((p) => {
      const remaining = Number(p.remainingHours ?? p.remaining_hours ?? 0);
      const isLesson = p.includesLessons !== false && (p.packageType ? p.packageType !== 'rental' : true);
      const active = p.status === 'active' || p.status === 'waiting_payment';
      return isLesson && active && remaining > 0.0001;
    });
  }, [packages]);

  const duration = Number(booking?.duration) || 0;

  const handleConfirm = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const result = await switchBookingFunding({
        bookingId: booking.id,
        mode,
        customerPackageId: mode === 'package' ? selectedPackageId : null,
      });
      onDone?.(result);
      onClose?.();
    } catch (err) {
      setError(err?.message || 'Failed to switch funding');
    } finally {
      setSubmitting(false);
    }
  };

  const okText = mode === 'package' ? 'Assign to Package' : 'Switch to Cash';
  const title = mode === 'package' ? 'Assign Lesson to a Package' : 'Switch Lesson to Cash';

  return (
    <Modal
      open={open}
      onCancel={submitting ? undefined : onClose}
      onOk={handleConfirm}
      okText={okText}
      okButtonProps={{
        loading: submitting,
        disabled: submitting || (mode === 'package' && !eligible.length),
      }}
      cancelButtonProps={{ disabled: submitting }}
      title={title}
      width={460}
      destroyOnHidden
    >
      {mode === 'package' ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Deduct this {duration ? `${duration}h ` : ''}lesson from one of the customer's packages.
            Any hours the package can't cover stay as a cash co-pay (partial). The cash already
            charged for this lesson is refunded to the wallet.
          </p>

          {loadingPkgs ? (
            <div className="py-6 text-center"><Spin /></div>
          ) : eligible.length ? (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Package</label>
              <Select
                className="w-full"
                placeholder="Auto-pick the oldest matching package"
                allowClear
                value={selectedPackageId}
                onChange={setSelectedPackageId}
                disabled={submitting}
                showSearch
                optionFilterProp="label"
                filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                getPopupContainer={(trigger) => trigger.closest('.ant-modal-content') || document.body}
                options={eligible.map((p) => {
                  const remaining = Number(p.remainingHours ?? p.remaining_hours ?? 0);
                  const name = p.packageName || p.package_name || p.lessonType || 'Package';
                  return {
                    value: p.id,
                    label: `${name} — ${remaining}h left`,
                  };
                })}
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Leave empty to let the system draw from the customer's compatible packages
                oldest-first (spilling across packages if needed).
              </p>
            </div>
          ) : (
            <Alert
              type="warning"
              showIcon
              message="No eligible package"
              description="This customer has no active lesson package with hours left. Create or assign a package first, then switch this lesson onto it."
            />
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <Tag color="blue">Currently paid with package</Tag>
          <p className="text-sm text-slate-600">
            This will restore the {duration ? `${duration}h ` : ''}hours back to the package and
            re-charge the lesson to the customer's wallet at the standard cash rate.
          </p>
        </div>
      )}

      {error && <Alert className="mt-3" type="error" message={error} showIcon />}

      <p className="text-[11px] text-slate-400 mt-3">
        Earnings, manager commission and the wallet all update automatically. Currency: {currency}.
      </p>
    </Modal>
  );
}
