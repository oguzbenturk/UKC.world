import { useState, useEffect } from 'react';
import { Drawer, Select, Spin, message, Tooltip, InputNumber, DatePicker } from 'antd';
import dayjs from 'dayjs';
import {
  CrownOutlined,
  SearchOutlined,
  CheckOutlined,
  WalletOutlined,
  UsergroupAddOutlined,
} from '@ant-design/icons';
import apiClient from '@/shared/services/apiClient';
import { useAuth } from '@/shared/hooks/useAuth';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { useQueryClient } from '@tanstack/react-query';

const ACCENT_COLOR = {
  gold: '#0891b2', orange: '#0284c7', amber: '#7c3aed', red: '#dc2626',
  rose: '#e11d48', pink: '#db2777', green: '#16a34a', emerald: '#059669',
  teal: '#0d9488', cyan: '#0891b2', sky: '#0284c7', blue: '#2563eb',
  indigo: '#4f46e5', navy: '#3730a3', purple: '#9333ea', violet: '#7c3aed',
  fuchsia: '#c026d3', slate: '#475569', gray: '#4b5563', black: '#1f2937',
};
const getAccentColor = (color) => ACCENT_COLOR[String(color || '').toLowerCase()] || '#4f46e5';

const formatDuration = (days) => {
  if (!days) return null;
  if (days === 1) return '1 Day';
  if (days === 7) return '1 Week';
  if (days === 14) return '2 Weeks';
  if (days === 30 || days === 31) return '1 Month';
  if (days === 90) return '3 Months';
  if (days === 180) return '6 Months';
  if (days === 365 || days === 366) return '1 Year';
  if (days < 30) return `${days} Days`;
  if (days < 365) return `${Math.round(days / 30)} Months`;
  return `${Math.round(days / 365)} Years`;
};

const ELEVATED_ROLES = ['super_admin', 'admin', 'manager', 'owner', 'frontdesk'];

const SectionHeader = ({ label }) => (
  <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">{label}</p>
);

const OfferingList = ({ offerings, selectedOffering, onSelect, formatCurrency }) => (
  <div className="flex flex-col gap-1.5">
    {offerings.map(offering => {
      const color = getAccentColor(offering.badge_color);
      const isSelected = selectedOffering?.id === offering.id;
      const dur = formatDuration(offering.duration_days);
      return (
        <button
          key={offering.id}
          onClick={() => onSelect(isSelected ? null : offering)}
          className="w-full text-left flex items-center gap-3 px-3 py-3 rounded-xl transition-colors cursor-pointer border-0"
          style={{
            background: isSelected ? `${color}0d` : '#fff',
            border: `1px solid ${isSelected ? color : '#e5e7eb'}`,
            outline: 'none',
          }}
        >
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white flex-shrink-0 text-sm"
            style={{ background: color }}
          >
            <CrownOutlined />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-800 truncate">{offering.name}</p>
            {dur && <p className="text-xs text-slate-400 mt-0.5">{dur}</p>}
          </div>
          <p className="text-sm font-semibold flex-shrink-0" style={{ color: isSelected ? color : '#374151' }}>
            {formatCurrency(offering.price || 0)}
            {offering.duration_days === 1 && <span className="text-xs font-normal text-slate-400">/day</span>}
          </p>
          <div
            className="w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0"
            style={{ borderColor: isSelected ? color : '#d1d5db', background: isSelected ? color : 'transparent' }}
          >
            {isSelected && <CheckOutlined style={{ fontSize: 8, color: '#fff' }} />}
          </div>
        </button>
      );
    })}
  </div>
);

// Storage box picker — shown only for storage-category offerings. Free boxes are selectable
// (white/emerald); occupied boxes stay selectable in amber so staff can deliberately SHARE a
// box (same box # assigned to several people). Selected box is highlighted indigo.
const StorageUnitPicker = ({ units, unitsLoading, selectedUnit, onSelect }) => {
  const sel = units.find(u => u.unit === selectedUnit);
  const sharing = sel?.occupied;
  return (
    <div className="mt-5">
      <SectionHeader label="Storage Box" />
      {unitsLoading ? (
        <div className="flex items-center justify-center py-6"><Spin size="small" /></div>
      ) : units.length === 0 ? (
        <div className="text-center py-6 px-4 text-sm text-slate-400 border border-dashed border-slate-200 rounded-xl">
          No storage boxes set up for this plan yet. Set <strong className="text-slate-500">Total Capacity</strong> on it under <strong className="text-slate-500">Settings → Memberships</strong> to enable box selection.
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3 mb-2 text-[11px] text-slate-400">
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-white border border-emerald-300" />Free
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-amber-100 border border-amber-300" />Occupied (tap to share)
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {units.map(u => {
              const isSel = u.unit === selectedUnit;
              const occ = u.occupied;
              return (
                <Tooltip
                  key={u.unit}
                  title={occ ? `Used by ${u.occupants.join(', ')}` : `Box #${u.unit} — free`}
                >
                  <button
                    type="button"
                    onClick={() => onSelect(isSel ? null : u.unit)}
                    className="relative w-10 h-10 rounded-lg text-sm font-semibold flex items-center justify-center transition-colors cursor-pointer border-0"
                    style={{
                      background: isSel ? '#4f46e5' : occ ? '#fffbeb' : '#ffffff',
                      color: isSel ? '#ffffff' : occ ? '#b45309' : '#334155',
                      border: `1px solid ${isSel ? '#4f46e5' : occ ? '#fcd34d' : '#a7f3d0'}`,
                      boxShadow: isSel ? '0 0 0 2px #c7d2fe' : 'none',
                    }}
                  >
                    {u.unit}
                    {occ && (
                      <UsergroupAddOutlined
                        className="absolute -top-1 -right-1 text-[9px] rounded-full p-[1px]"
                        style={{ background: isSel ? '#4f46e5' : '#fffbeb', color: isSel ? '#ffffff' : '#d97706' }}
                      />
                    )}
                  </button>
                </Tooltip>
              );
            })}
          </div>
          {sharing && (
            <div className="mt-2.5 flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200">
              <UsergroupAddOutlined className="text-amber-500 mt-0.5 text-xs" />
              <p className="text-xs text-amber-700">
                Box #{sel.unit} is used by <strong>{sel.occupants.join(', ')}</strong> — assigning will <strong>SHARE</strong> it.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
};

function useMemberDrawer(isOpen, onClose, isElevated) {
  const queryClient = useQueryClient();
  const [customers, setCustomers] = useState([]);
  const [offerings, setOfferings] = useState([]);
  const [loadingData, setLoadingData] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedCustomers, setSelectedCustomers] = useState([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedOffering, setSelectedOffering] = useState(null);
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [units, setUnits] = useState([]);
  const [unitsLoading, setUnitsLoading] = useState(false);
  const [discountPercent, setDiscountPercent] = useState(null);
  // "Paid" = customer settled right now with a real-world method (cash / card /
  // bank transfer): backend records a zero-delta charge+payment pair instead of
  // debiting the wallet, so the balance is untouched and history shows both legs.
  const [paidNow, setPaidNow] = useState(false);
  const [paidMethod, setPaidMethod] = useState('cash');
  // Membership start date — defaults to today; staff can back/forward-date it.
  // Drives purchased_at and (with the plan's duration) the expiry on the backend.
  const [startDate, setStartDate] = useState(() => dayjs());
  // End date — only used for "Daily" offerings (duration_days === 1), which are billed
  // as a per-day rate. The inclusive span start..end multiplies the price on the backend.
  const [endDate, setEndDate] = useState(null);

  const isStorage = selectedOffering?.category === 'storage';
  const isDaily = selectedOffering?.duration_days === 1;

  // Inclusive day span + per-customer charge (display only — the backend re-derives the
  // authoritative price from the dates). Non-daily offerings fall back to the flat price.
  const beachDays = isDaily && startDate && endDate ? endDate.diff(startDate, 'day') + 1 : null;
  const perCustomer = isDaily && beachDays != null
    ? Number(selectedOffering?.price || 0) * beachDays
    : Number(selectedOffering?.price || 0);

  // Moving the start date past the end date drags the end date along with it.
  const handleStartDateChange = (next) => {
    setStartDate(next);
    setEndDate((prev) => (prev && next && prev.isBefore(next, 'day') ? next : prev));
  };

  useEffect(() => {
    if (!isOpen) return;
    setLoadingData(true);
    const customerRoles = ['student', 'outsider', 'trusted_customer'];
    Promise.all([apiClient.get('/users'), apiClient.get('/member-offerings')])
      .then(([usersRes, offeringsRes]) => {
        const all = usersRes.data || [];
        setCustomers(all.filter(u =>
          customerRoles.includes(u.role?.toLowerCase()) || (!u.role && !u.is_admin && !u.is_staff)
        ));
        setOfferings((offeringsRes.data || []).filter(o => o.is_active !== false && o.status !== 'inactive'));
      })
      .catch(() => message.error('Failed to load data'))
      .finally(() => setLoadingData(false));
  }, [isOpen]);

  // Load the storage-box grid whenever a storage offering is selected; clear for non-storage.
  useEffect(() => {
    if (!isOpen) return;
    if (selectedOffering?.category !== 'storage') {
      setUnits([]); setSelectedUnit(null); return;
    }
    setSelectedUnit(null);
    setUnitsLoading(true);
    apiClient.get(`/member-offerings/admin/${selectedOffering.id}/storage-units`)
      .then(({ data }) => setUnits(data?.units || []))
      .catch(() => { setUnits([]); message.error('Failed to load storage boxes'); })
      .finally(() => setUnitsLoading(false));
  }, [isOpen, selectedOffering]);

  // Daily (per-day) offerings are billed by date range: default the end date to the start
  // date (a single day) when such an offering is selected; clear it for any other offering.
  useEffect(() => {
    if (selectedOffering?.duration_days === 1) {
      setEndDate((prev) => prev || startDate);
    } else {
      setEndDate(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOffering]);

  const reset = () => {
    setSelectedCustomers([]); setCustomerSearch('');
    setSelectedOffering(null);
    setSelectedUnit(null); setUnits([]); setUnitsLoading(false);
    setDiscountPercent(null);
    setPaidNow(false); setPaidMethod('cash');
    setStartDate(dayjs());
    setEndDate(null);
  };

  const handleClose = () => { reset(); onClose(); };

  const handleSubmit = async () => {
    if (!selectedCustomers.length) { message.warning('Please select at least one customer'); return; }
    if (!selectedOffering) { message.warning('Please select a membership plan'); return; }
    if (isStorage && units.length > 0 && selectedUnit == null) { message.warning('Please select a storage box'); return; }
    if (isDaily && (!endDate || endDate.isBefore(startDate, 'day'))) { message.warning('Please select a valid end date'); return; }
    try {
      setSubmitting(true);
      // For storage, the SAME box # is sent for every selected customer, so a group shares
      // one physical box (each gets their own record on that unit).
      // Discount is applied SERVER-SIDE by the purchase route (discounts table +
      // wallet credit for wallet sales, suppressed for paid-in-person sales, and
      // the "Paid" payment ledger leg is recorded net of it) — no second request.
      const pct = Number(discountPercent) || 0;
      await Promise.all(selectedCustomers.map(userId =>
        apiClient.post('/member-offerings/admin/purchases', {
          userId, offeringId: selectedOffering.id,
          paymentMethod: paidNow ? paidMethod : 'wallet',
          allowNegativeBalance: isElevated,
          ...(pct > 0 ? { discountPercent: pct } : {}),
          ...(startDate ? { startDate: startDate.format('YYYY-MM-DD') } : {}),
          ...(isDaily && endDate ? { endDate: endDate.format('YYYY-MM-DD') } : {}),
          ...(isStorage ? { storageUnit: selectedUnit } : {}),
        })
      ));
      message.success(`Membership assigned to ${selectedCustomers.length} customer${selectedCustomers.length > 1 ? 's' : ''}!`);
      queryClient.invalidateQueries(['admin-member-purchases']);
      queryClient.invalidateQueries(['admin-member-stats']);
      handleClose();
    } catch (err) {
      message.error(err.response?.data?.message || err.response?.data?.error || 'Assignment failed');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredCustomers = customers.filter(c => {
    const s = customerSearch.toLowerCase();
    return !customerSearch ||
      `${c.first_name || ''} ${c.last_name || ''}`.toLowerCase().includes(s) ||
      c.email?.toLowerCase().includes(s);
  });

  return {
    loadingData, submitting,
    customers, filteredCustomers, offerings,
    selectedCustomers, setSelectedCustomers,
    customerSearch, setCustomerSearch,
    selectedOffering, setSelectedOffering,
    isStorage,
    isDaily, beachDays, perCustomer,
    selectedUnit, setSelectedUnit, units, unitsLoading,
    discountPercent, setDiscountPercent,
    startDate, setStartDate, handleStartDateChange,
    endDate, setEndDate,
    canSubmit: !!(
      selectedCustomers.length &&
      selectedOffering &&
      // Storage: require a box only when boxes are actually configured for the plan.
      // (Unconfigured storage plans — no total_capacity — assign with no box, as before.)
      (!isStorage || (units.length === 0 && !unitsLoading) || selectedUnit != null) &&
      // Daily (per-day) plans require a valid end date on/after the start date.
      (!isDaily || (endDate != null && !endDate.isBefore(startDate, 'day')))
    ),
    handleClose, handleSubmit,
  };
}

const CustomerPicker = ({ filteredCustomers, selectedCustomers, onSelect, onSearch }) => (
  <div>
    <SectionHeader label="Customers" />
    <Select
      mode="multiple"
      showSearch
      placeholder="Search by name or email…"
      value={selectedCustomers}
      onChange={onSelect}
      onSearch={onSearch}
      filterOption={false}
      allowClear
      size="large"
      suffixIcon={<SearchOutlined className="text-slate-400" />}
      className="w-full"
      notFoundContent={<span className="text-sm text-slate-400 px-1">No customers found</span>}
      maxTagCount="responsive"
    >
      {filteredCustomers.map(c => (
        <Select.Option key={c.id} value={c.id}>
          <div className="flex items-center gap-2 py-0.5">
            <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-xs font-bold flex-shrink-0">
              {(c.first_name?.[0] || 'U').toUpperCase()}
            </div>
            <span className="font-medium text-slate-800">{c.first_name} {c.last_name}</span>
            <span className="text-slate-400 text-xs truncate">{c.email}</span>
          </div>
        </Select.Option>
      ))}
    </Select>
    {selectedCustomers.length > 0 && (
      <p className="text-xs text-slate-500 mt-1.5">{selectedCustomers.length} customer{selectedCustomers.length > 1 ? 's' : ''} selected</p>
    )}
  </div>
);

const DrawerSummary = ({ count, selectedOffering, formatCurrency, isElevated, isStorage, selectedUnit, discountPercent, startDate, isDaily, beachDays, perCustomer, endDate }) => {
  // Per-customer charge: daily plans are priced by the day span; everything else is flat.
  const unit = isDaily ? (perCustomer || 0) : (selectedOffering?.price || 0);
  const subtotal = unit * count;
  const pct = Math.min(Math.max(Number(discountPercent) || 0, 0), 100);
  const discountAmount = subtotal * (pct / 100);
  const total = subtotal - discountAmount;
  return (
  <div className="rounded-xl border border-slate-200 overflow-hidden">
    <div className="px-4 py-2 bg-slate-50 border-b border-slate-200">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Summary</p>
    </div>
    <div className="px-4 py-3 space-y-2">
      <div className="flex justify-between text-sm">
        <span className="text-slate-500">Customers</span>
        <span className="font-medium text-slate-800">{count} selected</span>
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-slate-500">Plan</span>
        <span className="font-medium text-slate-800 truncate max-w-[200px] text-right">{selectedOffering?.name}</span>
      </div>
      {startDate && (
        <div className="flex justify-between text-sm">
          <span className="text-slate-500">{isDaily ? 'Dates' : 'Starts'}</span>
          <span className="font-medium text-slate-800">
            {startDate.format('DD MMM YYYY')}
            {isDaily
              ? (endDate ? <span className="text-slate-400 font-normal"> → {endDate.format('DD MMM YYYY')}</span> : null)
              : (selectedOffering?.duration_days
                  ? <span className="text-slate-400 font-normal"> → {startDate.clone().add(selectedOffering.duration_days, 'day').format('DD MMM YYYY')}</span>
                  : null)}
          </span>
        </div>
      )}
      {isDaily && beachDays != null && (
        <div className="flex justify-between text-sm">
          <span className="text-slate-500">Beach days</span>
          <span className="font-medium text-slate-800">{beachDays} × {formatCurrency(selectedOffering?.price || 0)}/day</span>
        </div>
      )}
      {isStorage && selectedUnit != null && (
        <div className="flex justify-between text-sm">
          <span className="text-slate-500">Box</span>
          <span className="font-medium text-slate-800">#{selectedUnit} → {count} customer{count > 1 ? 's' : ''}{count > 1 ? ' (shared)' : ''}</span>
        </div>
      )}
      <div className="flex justify-between text-sm">
        <span className="text-slate-500">Payment</span>
        <span className="font-medium text-slate-800">Wallet</span>
      </div>
      {isElevated && (
        <p className="text-xs text-amber-600 pt-0.5">Negative balance allowed for your role</p>
      )}
    </div>
    {pct > 0 && (
      <div className="px-4 py-2 bg-slate-50 border-t border-slate-200 flex justify-between items-center text-sm">
        <span className="text-emerald-600">Discount ({pct}%)</span>
        <span className="font-medium text-emerald-600">−{formatCurrency(discountAmount)}</span>
      </div>
    )}
    <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex justify-between items-center">
      <span className="text-sm font-semibold text-slate-600">Total{count > 1 && <span className="text-slate-400 font-normal text-xs ml-1">({formatCurrency(unit)} × {count})</span>}</span>
      <span className="text-lg font-bold text-slate-900">
        {pct > 0 && <span className="text-sm font-normal text-slate-400 line-through mr-1.5">{formatCurrency(subtotal)}</span>}
        {formatCurrency(total)}
      </span>
    </div>
  </div>
  );
};

const DrawerFooter = ({ canSubmit, submitting, count, onClose, onSubmit }) => (
  <div className="flex gap-2">
    <button
      onClick={onClose}
      className="flex-1 py-2.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer bg-white"
    >
      Cancel
    </button>
    <button
      onClick={onSubmit}
      disabled={!canSubmit || submitting}
      className="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors cursor-pointer border-0"
      style={{
        background: canSubmit ? '#4f46e5' : '#e5e7eb',
        color: canSubmit ? '#fff' : '#9ca3af',
        cursor: canSubmit && !submitting ? 'pointer' : 'not-allowed',
      }}
    >
      {submitting ? 'Assigning…' : `Assign to ${count || 1} Customer${count > 1 ? 's' : ''}`}
    </button>
  </div>
);

export default function NewMemberDrawer({ isOpen, onClose }) {
  const { formatCurrency } = useCurrency();
  const { user } = useAuth();
  const isElevated = ELEVATED_ROLES.includes(user?.role?.toLowerCase());
  const {
    loadingData, submitting,
    filteredCustomers, offerings,
    selectedCustomers, setSelectedCustomers,
    setCustomerSearch,
    selectedOffering, setSelectedOffering,
    isStorage,
    isDaily, beachDays, perCustomer,
    selectedUnit, setSelectedUnit, units, unitsLoading,
    discountPercent, setDiscountPercent,
    startDate, setStartDate, handleStartDateChange,
    endDate, setEndDate,
    canSubmit,
    handleClose, handleSubmit,
  } = useMemberDrawer(isOpen, onClose, isElevated);

  return (
    <Drawer
      open={isOpen}
      onClose={handleClose}
      placement="right"
      width={440}
      title={
        <div className="flex items-center gap-2">
          <CrownOutlined className="text-indigo-500" />
          <span className="font-semibold text-slate-800">Assign Membership</span>
        </div>
      }
      footer={<DrawerFooter canSubmit={canSubmit} submitting={submitting} count={selectedCustomers.length} onClose={handleClose} onSubmit={handleSubmit} />}
      styles={{
        body: { padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 0, overflowY: 'auto' },
        footer: { padding: '12px 20px', borderTop: '1px solid #e5e7eb' },
      }}
    >
      <Spin spinning={loadingData}>
        <CustomerPicker
          filteredCustomers={filteredCustomers}
          selectedCustomers={selectedCustomers}
          onSelect={setSelectedCustomers}
          onSearch={setCustomerSearch}
        />

        <div className="mt-5">
          <SectionHeader label="Membership Plan" />
          {offerings.length === 0 && !loadingData ? (
            <div className="text-center py-6 text-sm text-slate-400 border border-dashed border-slate-200 rounded-xl">
              No active membership plans found.
            </div>
          ) : (
            <OfferingList offerings={offerings} selectedOffering={selectedOffering} onSelect={setSelectedOffering} formatCurrency={formatCurrency} />
          )}
        </div>

        {isStorage && (
          <StorageUnitPicker
            units={units}
            unitsLoading={unitsLoading}
            selectedUnit={selectedUnit}
            onSelect={setSelectedUnit}
          />
        )}

        {isDaily ? (
          <div className="mt-5">
            <SectionHeader label="Beach Dates" />
            <div className="flex gap-2">
              <DatePicker
                value={startDate}
                onChange={handleStartDateChange}
                allowClear={false}
                format="DD MMM YYYY"
                className="flex-1"
                size="large"
                placeholder="Start date"
                getPopupContainer={(trigger) => trigger.parentElement}
              />
              <DatePicker
                value={endDate}
                onChange={setEndDate}
                allowClear={false}
                format="DD MMM YYYY"
                className="flex-1"
                size="large"
                placeholder="End date"
                disabledDate={(d) => startDate && d && d.isBefore(startDate, 'day')}
                getPopupContainer={(trigger) => trigger.parentElement}
              />
            </div>
            <p className="text-xs text-slate-400 mt-1.5">
              {beachDays != null
                ? <>{beachDays} day{beachDays !== 1 ? 's' : ''} × {formatCurrency(selectedOffering?.price || 0)}/day — first and last beach day included.</>
                : 'Select the first and last beach day.'}
            </p>
          </div>
        ) : (
          <div className="mt-5">
            <SectionHeader label="Start Date" />
            <DatePicker
              value={startDate}
              onChange={setStartDate}
              allowClear={false}
              format="DD MMM YYYY"
              className="w-full"
              size="large"
              getPopupContainer={(trigger) => trigger.parentElement}
            />
            <p className="text-xs text-slate-400 mt-1.5">
              When the membership starts. Expiry is calculated from this date and the plan's duration.
            </p>
          </div>
        )}

        <div className="mt-5">
          <SectionHeader label="Payment" />
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setPaidNow(false)}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-left transition-colors ${
                !paidNow ? 'border-indigo-500 bg-indigo-50/60' : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <WalletOutlined className={!paidNow ? 'text-indigo-500' : 'text-slate-400'} />
              <div>
                <p className="text-sm font-medium text-slate-700">Wallet</p>
                <p className="text-[11px] text-slate-400">
                  {isElevated ? 'On account — negative allowed' : 'Deducted from wallet'}
                </p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setPaidNow(true)}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-left transition-colors ${
                paidNow ? 'border-emerald-500 bg-emerald-50/60' : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <CheckOutlined className={paidNow ? 'text-emerald-500' : 'text-slate-400'} />
              <div>
                <p className="text-sm font-medium text-slate-700">Paid</p>
                <p className="text-[11px] text-slate-400">Settled now, wallet untouched</p>
              </div>
            </button>
          </div>
          {paidNow && (
            <div className="mt-2">
              <Select
                className="w-full"
                value={paidMethod}
                onChange={setPaidMethod}
                options={[
                  { value: 'cash', label: '💵 Cash' },
                  { value: 'card', label: '💳 Card' },
                  { value: 'transfer', label: '🏦 Bank Transfer' },
                ]}
              />
              <p className="text-xs text-slate-400 mt-1.5">
                Records the charge and a matching {paidMethod === 'transfer' ? 'bank transfer' : paidMethod} payment
                in the customer's financial history — the wallet balance doesn't move.
              </p>
            </div>
          )}
        </div>

        {/* Discount — applied at creation, same mechanism as the customer drawer */}
        <div className="mt-5">
          <SectionHeader label="Discount (optional)" />
          <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-slate-200">
            <span className="text-sm text-slate-600">Staff discount</span>
            <InputNumber
              min={0}
              max={100}
              step={1}
              precision={2}
              value={discountPercent}
              onChange={setDiscountPercent}
              addonAfter="%"
              placeholder="0"
              style={{ width: 130 }}
            />
          </div>
        </div>

        {canSubmit && (
          <div className="mt-3">
            <DrawerSummary
            count={selectedCustomers.length}
            selectedOffering={selectedOffering}
            formatCurrency={formatCurrency}
            isElevated={isElevated}
            isStorage={isStorage}
            isDaily={isDaily}
            beachDays={beachDays}
            perCustomer={perCustomer}
            selectedUnit={selectedUnit}
            discountPercent={discountPercent}
            startDate={startDate}
            endDate={endDate}
          />
          </div>
        )}

      </Spin>
    </Drawer>
  );
}
