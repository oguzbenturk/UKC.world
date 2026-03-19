import { useState, useEffect } from 'react';
import { Drawer, Select, Spin, message } from 'antd';
import {
  CrownOutlined,
  SearchOutlined,
  CheckOutlined,
  WalletOutlined,
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



function useMemberDrawer(isOpen, onClose, isElevated) {
  const queryClient = useQueryClient();
  const [customers, setCustomers] = useState([]);
  const [offerings, setOfferings] = useState([]);
  const [loadingData, setLoadingData] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedCustomers, setSelectedCustomers] = useState([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedOffering, setSelectedOffering] = useState(null);

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

  const reset = () => {
    setSelectedCustomers([]); setCustomerSearch('');
    setSelectedOffering(null);
  };

  const handleClose = () => { reset(); onClose(); };

  const handleSubmit = async () => {
    if (!selectedCustomers.length) { message.warning('Please select at least one customer'); return; }
    if (!selectedOffering) { message.warning('Please select a membership plan'); return; }
    try {
      setSubmitting(true);
      await Promise.all(selectedCustomers.map(userId =>
        apiClient.post('/member-offerings/admin/purchases', {
          userId, offeringId: selectedOffering.id, paymentMethod: 'wallet',
          allowNegativeBalance: isElevated,
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
    canSubmit: !!(selectedCustomers.length && selectedOffering),
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

const DrawerSummary = ({ count, selectedOffering, formatCurrency, isElevated }) => (
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
      <div className="flex justify-between text-sm">
        <span className="text-slate-500">Payment</span>
        <span className="font-medium text-slate-800">Wallet</span>
      </div>
      {isElevated && (
        <p className="text-xs text-amber-600 pt-0.5">Negative balance allowed for your role</p>
      )}
    </div>
    <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex justify-between items-center">
      <span className="text-sm font-semibold text-slate-600">Total{count > 1 && <span className="text-slate-400 font-normal text-xs ml-1">({formatCurrency(selectedOffering?.price || 0)} × {count})</span>}</span>
      <span className="text-lg font-bold text-slate-900">{formatCurrency((selectedOffering?.price || 0) * count)}</span>
    </div>
  </div>
);

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

        <div className="mt-5">
          <SectionHeader label="Payment" />
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50">
            <WalletOutlined className="text-slate-400" />
            <div>
              <p className="text-sm font-medium text-slate-700">Wallet Balance</p>
              <p className="text-xs text-slate-400">{isElevated ? 'Negative balance allowed for your role' : 'Deducted from customer wallet'}</p>
            </div>
          </div>
        </div>

        {canSubmit && (
          <div className="mt-3">
            <DrawerSummary
            count={selectedCustomers.length}
            selectedOffering={selectedOffering}
            formatCurrency={formatCurrency}
            isElevated={isElevated}
          />
          </div>
        )}

      </Spin>
    </Drawer>
  );
}
