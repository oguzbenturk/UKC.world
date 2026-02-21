import { useState } from 'react';
import { Spin, Alert, message, Modal, Select } from 'antd';
import {
  CrownOutlined,
  CheckOutlined,
  CheckCircleFilled,
  WalletOutlined,
  ShopOutlined,
  UserOutlined,
  SearchOutlined,
  StarFilled,
  ArrowRightOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { useAuth } from '@/shared/hooks/useAuth';
import { useAuthModal } from '@/shared/contexts/AuthModalContext';
import apiClient from '@/shared/services/apiClient';

const fetchMemberOfferings = async () => {
  const { data } = await apiClient.get('/member-offerings');
  return data;
};

const fetchMyPurchases = async () => {
  const { data } = await apiClient.get('/member-offerings/my-purchases');
  return data;
};

const purchaseMembership = async ({ offeringId, paymentMethod }) => {
  const { data } = await apiClient.post(`/member-offerings/${offeringId}/purchase`, { paymentMethod });
  return data;
};

const parseFeatures = (features) => {
  if (!features) return [];
  if (Array.isArray(features)) return features;
  if (typeof features === 'string') {
    try { return JSON.parse(features); } catch { return features.split('\n').filter(Boolean); }
  }
  return [];
};

// Color accent map per badge_color
const ACCENT = {
  gold:   { ring: '#f59e0b', light: '#fef3c7', text: '#92400e', btn: '#f59e0b', btnHover: '#d97706' },
  orange: { ring: '#f97316', light: '#fff7ed', text: '#9a3412', btn: '#f97316', btnHover: '#ea580c' },
  red:    { ring: '#ef4444', light: '#fee2e2', text: '#991b1b', btn: '#ef4444', btnHover: '#dc2626' },
  green:  { ring: '#22c55e', light: '#dcfce7', text: '#166534', btn: '#22c55e', btnHover: '#16a34a' },
  cyan:   { ring: '#06b6d4', light: '#cffafe', text: '#164e63', btn: '#06b6d4', btnHover: '#0891b2' },
  blue:   { ring: '#3b82f6', light: '#dbeafe', text: '#1e3a8a', btn: '#3b82f6', btnHover: '#2563eb' },
  purple: { ring: '#a855f7', light: '#f3e8ff', text: '#581c87', btn: '#a855f7', btnHover: '#9333ea' },
  violet: { ring: '#8b5cf6', light: '#ede9fe', text: '#4c1d95', btn: '#8b5cf6', btnHover: '#7c3aed' },
};
const DEFAULT_ACCENT = { ring: '#93c47d', light: '#f0fdf4', text: '#14532d', btn: '#4ade80', btnHover: '#22c55e' };
const getAccent = (color) => ACCENT[String(color || '').toLowerCase()] || DEFAULT_ACCENT;

const OfferingCard = ({ offering, onPurchase, formatCurrency, convertCurrency, displayCurrency, businessCurrency, isPopular, isOwned }) => {
  const price = offering.price || 0;
  const displayPrice = convertCurrency(price, businessCurrency, displayCurrency);
  const parsedFeatures = parseFeatures(offering.features);
  const accent = getAccent(offering.badge_color);
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="relative flex flex-col rounded-3xl overflow-hidden transition-all duration-300"
      style={{
        background: '#1a1d2e',
        border: `2px solid ${hovered || isPopular ? accent.ring : 'rgba(255,255,255,0.08)'}`,
        boxShadow: hovered ? `0 20px 40px -12px ${accent.ring}40` : '0 4px 24px rgba(0,0,0,0.3)',
        transform: hovered ? 'translateY(-4px)' : 'none',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Top accent bar */}
      <div style={{ height: '5px', background: accent.ring, flexShrink: 0 }} />

      {/* Popular ribbon */}
      {(isPopular || offering.highlighted) && (
        <div
          className="absolute top-3 right-3 flex items-center gap-1 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider"
          style={{ background: accent.ring, color: '#fff', boxShadow: `0 4px 12px ${accent.ring}60` }}
        >
          <StarFilled style={{ fontSize: 10 }} /> Popular
        </div>
      )}

      {/* Owned ribbon */}
      {isOwned && (
        <div className="absolute top-3 left-3 flex items-center gap-1 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-emerald-500 text-white">
          <CheckCircleFilled style={{ fontSize: 10 }} /> Active
        </div>
      )}

      {/* Image */}
      {offering.image_url && (
        <div className="h-40 overflow-hidden">
          <img
            src={offering.image_url}
            alt={offering.name}
            className="w-full h-full object-cover transition-transform duration-500"
            style={{ transform: hovered ? 'scale(1.05)' : 'scale(1)' }}
          />
        </div>
      )}

      <div className="flex flex-col flex-1 p-6 pt-5">
        {/* Header */}
        <div className="mb-5">
          <h3 className="text-xl font-black text-white mb-1 leading-tight">{offering.name}</h3>
          {offering.description && (
            <p className="text-sm text-white/50 leading-relaxed line-clamp-2">{offering.description}</p>
          )}
        </div>

        {/* Price */}
          <div className="mb-6 pb-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="flex items-baseline gap-1">
            <span className="text-4xl font-black text-white tracking-tight">{formatCurrency(displayPrice)}</span>
            {offering.period && (
              <span className="text-sm text-white/40 font-medium">/ {offering.period}</span>
            )}
          </div>
        </div>

        {/* Features */}
        {parsedFeatures.length > 0 && (
          <ul className="space-y-2.5 mb-6 flex-1">
            {parsedFeatures.map((feat, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-white/70">
                <span
                  className="mt-0.5 w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center text-white"
                  style={{ background: accent.ring, fontSize: 8 }}
                >
                  <CheckOutlined />
                </span>
                {feat}
              </li>
            ))}
          </ul>
        )}

        {/* CTA */}
        <button
          onClick={() => onPurchase(offering)}
          disabled={isOwned}
          className="w-full py-3.5 rounded-2xl font-bold text-sm tracking-wide transition-all duration-200 flex items-center justify-center gap-2"
          style={{
            background: isOwned ? '#f3f4f6' : accent.btn,
            color: isOwned ? '#9ca3af' : '#fff',
            cursor: isOwned ? 'not-allowed' : 'pointer',
            boxShadow: isOwned ? 'none' : `0 4px 14px ${accent.ring}50`,
          }}
          onMouseEnter={e => { if (!isOwned) e.currentTarget.style.background = accent.btnHover; }}
          onMouseLeave={e => { if (!isOwned) e.currentTarget.style.background = accent.btn; }}
        >
          {isOwned ? 'Currently Active' : <span className="flex items-center gap-2">Get Started <ArrowRightOutlined /></span>}
        </button>
      </div>
    </div>
  );
};

const MemberOfferings = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { openAuthModal } = useAuthModal();
  const { formatCurrency, convertCurrency, displayCurrency, businessCurrency } = useCurrency();
  const [purchaseModal, setPurchaseModal] = useState({ visible: false, offering: null });
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerSearch, setCustomerSearch] = useState('');

  const isGuest = !user;
  const userRole = user?.role?.toLowerCase() || '';
  const customerRoles = ['student', 'outsider', 'trusted_customer'];
  const isStaff = !isGuest && !customerRoles.includes(userRole) && userRole !== '';

  const { data: customers = [] } = useQuery({
    queryKey: ['customers-for-membership'],
    queryFn: async () => {
      const { data } = await apiClient.get('/users');
      return (data || []).filter(u => customerRoles.includes(u.role?.toLowerCase()) || (!u.role && !u.is_admin && !u.is_staff));
    },
    enabled: isStaff,
  });

  const filteredCustomers = customers.filter(c => {
    if (!customerSearch) return true;
    const s = customerSearch.toLowerCase();
    return `${c.first_name || ''} ${c.last_name || ''}`.toLowerCase().includes(s) || c.email?.toLowerCase().includes(s);
  });

  const { data: offerings = [], isLoading, error } = useQuery({
    queryKey: ['member-offerings'],
    queryFn: fetchMemberOfferings,
  });

  const { data: myPurchases = [] } = useQuery({
    queryKey: ['my-member-purchases'],
    queryFn: fetchMyPurchases,
    enabled: !!user,
  });

  const ownedOfferingIds = new Set(
    myPurchases
      .filter(p => p.status === 'active' && (!p.expires_at || new Date(p.expires_at) > new Date()))
      .map(p => p.offering_id)
  );

  const purchaseMutation = useMutation({
    mutationFn: purchaseMembership,
    onSuccess: () => {
      message.success('Membership activated! Welcome aboard.');
      setPurchaseModal({ visible: false, offering: null });
      queryClient.invalidateQueries(['member-offerings']);
      queryClient.invalidateQueries(['my-member-purchases']);
    },
    onError: (err) => {
      message.error(err.response?.data?.error || err.response?.data?.message || 'Purchase failed. Please try again.');
    },
  });

  const assignMutation = useMutation({
    mutationFn: async ({ userId, offeringId, paymentMethod }) => {
      const { data } = await apiClient.post('/member-offerings/admin/purchases', { userId, offeringId, paymentMethod });
      return data;
    },
    onSuccess: () => {
      const c = customers.find(c => c.id === selectedCustomer);
      message.success(`Membership assigned to ${c ? `${c.first_name} ${c.last_name}` : 'customer'}!`);
      setPurchaseModal({ visible: false, offering: null });
      setSelectedCustomer(null);
      queryClient.invalidateQueries(['member-offerings']);
      queryClient.invalidateQueries(['admin-member-purchases']);
    },
    onError: (err) => {
      message.error(err.response?.data?.error || err.response?.data?.message || 'Assignment failed.');
    },
  });

  const handlePurchase = (offering) => {
    if (isGuest) { message.info('Please sign in to purchase a membership.'); openAuthModal({ title: 'Sign In to Purchase', message: 'Create an account or sign in to purchase a membership.', mode: 'register', returnUrl: '/members/offerings' }); return; }
    if (isStaff && !selectedCustomer) { message.warning('Select a customer first.'); return; }
    setPurchaseModal({ visible: true, offering });
  };

  const confirmPurchase = (paymentMethod) => {
    if (!purchaseModal.offering) return;
    if (isStaff && selectedCustomer) {
      assignMutation.mutate({ userId: selectedCustomer, offeringId: purchaseModal.offering.id, paymentMethod });
    } else {
      purchaseMutation.mutate({ offeringId: purchaseModal.offering.id, paymentMethod });
    }
  };

  const selectedCustomerData = customers.find(c => c.id === selectedCustomer);
  const selectedCustomerName = selectedCustomerData ? `${selectedCustomerData.first_name} ${selectedCustomerData.last_name}` : null;
  const getIsPopular = (o) => { const n = o.name?.toLowerCase() || ''; return n.includes('vip') || n.includes('beach'); };
  const modalAccent = purchaseModal.offering ? getAccent(purchaseModal.offering.badge_color) : DEFAULT_ACCENT;

  return (
    <div className="min-h-screen bg-[#0f1117] font-sans">

      {/* Hero */}
      <div className="max-w-4xl mx-auto px-4 pt-16 pb-10 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-green-900/30 border border-green-700/40 text-green-400 text-xs font-bold uppercase tracking-widest mb-6">
          <CrownOutlined /> Official Memberships
        </div>
        <h1 className="text-4xl md:text-5xl font-black text-white mb-4 tracking-tight">
          Choose Your Plan
        </h1>
        <p className="text-lg text-white/40 max-w-2xl mx-auto leading-relaxed">
          Unlock priority booking, gear discounts, and exclusive rider perks designed for every level of commitment.
        </p>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">

        {/* Staff panel */}
        {isStaff && (
          <div className="mb-10 bg-white/5 rounded-3xl border border-white/10 p-6">
            <p className="text-xs font-bold text-white/40 uppercase tracking-widest mb-3 flex items-center gap-2">
              <UserOutlined /> Staff: Assign Membership To Customer
            </p>
            <div className="flex flex-col md:flex-row gap-4 items-start">
              <Select
                showSearch
                placeholder="Search customer by name or email..."
                value={selectedCustomer}
                onChange={setSelectedCustomer}
                size="large"
                allowClear
                filterOption={false}
                onSearch={setCustomerSearch}
                suffixIcon={<SearchOutlined />}
                className="w-full md:w-96"
                notFoundContent={<span className="text-sm text-gray-400 p-2">No customers found</span>}
              >
                {filteredCustomers.map(c => (
                  <Select.Option key={c.id} value={c.id}>
                    <div className="flex items-center gap-2 py-0.5">
                      <div className="w-6 h-6 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-xs font-bold">
                        {(c.first_name?.[0] || 'U').toUpperCase()}
                      </div>
                      <span className="font-medium">{c.first_name} {c.last_name}</span>
                      <span className="text-gray-400 text-xs">{c.email}</span>
                    </div>
                  </Select.Option>
                ))}
              </Select>
              {selectedCustomerName && (
                <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-900/30 border border-emerald-600/40 rounded-2xl text-sm font-semibold text-emerald-400">
                  <CheckCircleFilled /> {selectedCustomerName}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Guest banner */}
        {isGuest && (
          <div className="mb-8 flex items-center justify-between gap-4 bg-blue-900/20 border border-blue-700/30 rounded-2xl px-6 py-4">
              <p className="text-sm text-blue-300">
              <strong>Browsing as guest.</strong> Sign in or create an account to purchase any plan.
            </p>
            <button
              onClick={() => openAuthModal({ title: 'Sign In to Purchase', message: 'Create an account or sign in to purchase a membership.', mode: 'register', returnUrl: '/members/offerings' })}
              className="flex-shrink-0 px-5 py-2 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 transition-colors"
            >
              Sign Up / Log In
            </button>
          </div>
        )}

        {/* Plan count */}
        {!isLoading && !error && offerings.length > 0 && (
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-bold text-white">
              Available Plans
              <span className="ml-2 text-sm font-normal text-white/40 bg-white/10 px-2.5 py-1 rounded-full">{offerings.length}</span>
            </h2>
          </div>
        )}

        {/* States */}
        {isLoading && (
          <div className="flex items-center justify-center py-32">
            <Spin size="large" />
          </div>
        )}
        {error && (
          <Alert message="Failed to load plans" description={error.message} type="error" showIcon className="max-w-xl mx-auto rounded-2xl" />
        )}
        {!isLoading && !error && offerings.length === 0 && (
          <div className="text-center py-32 bg-white/4 rounded-3xl border border-dashed border-white/10">
            <CrownOutlined style={{ fontSize: 40, color: '#d1d5db' }} />
            <p className="text-white/30 mt-4">No membership plans available at the moment.</p>
          </div>
        )}

        {/* Cards grid */}
        {!isLoading && !error && offerings.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {offerings.map(offering => (
              <OfferingCard
                key={offering.id}
                offering={offering}
                onPurchase={handlePurchase}
                formatCurrency={formatCurrency}
                convertCurrency={convertCurrency}
                displayCurrency={displayCurrency}
                businessCurrency={businessCurrency}
                isPopular={getIsPopular(offering)}
                isOwned={ownedOfferingIds.has(offering.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Purchase Modal */}
      <Modal
        open={purchaseModal.visible}
        onCancel={() => setPurchaseModal({ visible: false, offering: null })}
        footer={null}
        width={400}
        centered
        title={null}
        styles={{ content: { borderRadius: 24, padding: 0, overflow: 'hidden', background: '#1a1d2e', border: '1px solid rgba(255,255,255,0.1)' } }}
      >
        {purchaseModal.offering && (
          <div>
            {/* Modal header */}
            <div
              className="px-8 pt-8 pb-6 text-center"
              style={{ background: modalAccent.light, borderBottom: `3px solid ${modalAccent.ring}` }}
            >
              <div
                className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center text-2xl font-black text-white"
                style={{ background: modalAccent.ring }}
              >
                <CrownOutlined />
              </div>
              <h3 className="text-xl font-black mb-1" style={{ color: modalAccent.text }}>{purchaseModal.offering.name}</h3>
              <p className="text-sm" style={{ color: modalAccent.text }}>
                {isStaff && selectedCustomerName
                  ? <>Assigning to <strong>{selectedCustomerName}</strong></>
                  : 'Select your payment method to continue'}
              </p>
            </div>

            {/* Payment options */}
            <div className="p-6 space-y-3">
              <button
                onClick={() => confirmPurchase('wallet')}
                disabled={purchaseMutation.isPending || assignMutation.isPending}
                className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all duration-200 hover:shadow-md text-left disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ borderColor: modalAccent.ring, background: `${modalAccent.ring}10` }}
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-lg flex-shrink-0" style={{ background: modalAccent.ring }}>
                  <WalletOutlined />
                </div>
                <div>
                  <div className="font-bold text-white">{(purchaseMutation.isPending || assignMutation.isPending) ? 'Processing...' : 'Wallet Balance'}</div>
                  <div className="text-xs text-white/50">Deduct from your UKC wallet</div>
                </div>
                <span className="ml-auto text-xs font-bold px-2 py-1 rounded-full" style={{ background: modalAccent.ring, color: '#fff' }}>Fast</span>
              </button>

              <button
                onClick={() => confirmPurchase('cash')}
                disabled={purchaseMutation.isPending || assignMutation.isPending}
                className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-white/5 bg-white/5 hover:border-white/15 hover:bg-white/10 transition-all duration-200 text-left disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-white/60 text-lg flex-shrink-0">
                  <ShopOutlined />
                </div>
                <div>
                  <div className="font-bold text-white">{isStaff ? 'Cash Payment' : 'Pay at Reception'}</div>
                  <div className="text-xs text-white/50">In-person at the desk</div>
                </div>
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default MemberOfferings;
