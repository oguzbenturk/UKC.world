import { useState } from 'react';
import { Spin, Alert, message, Modal, Select } from 'antd';
import dpsLogo from '../../../../DuotoneFonts/DPSLOGOS/DPS-transparenton-black.svg';
import {
  CrownOutlined,
  CheckOutlined,
  CheckCircleFilled,
  WalletOutlined,
  ShopOutlined,
  CreditCardOutlined,
  UserOutlined,
  SearchOutlined,
  StarFilled,
  StarOutlined,
  TrophyOutlined,
  RocketOutlined,
  ThunderboltOutlined,
  ThunderboltFilled,
  FireOutlined,
  HeartOutlined,
  GiftOutlined,
  SafetyCertificateOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { useAuth } from '@/shared/hooks/useAuth';
import { useAuthModal } from '@/shared/contexts/AuthModalContext';
import apiClient from '@/shared/services/apiClient';
import IyzicoPaymentModal from '@/shared/components/IyzicoPaymentModal';

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

const ACCENT = {
  gold:    { bg: '#ecfeff', ring: '#06b6d4', text: '#164e63', light: '#cffafe', btn: 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)' },
  orange:  { bg: '#f0f9ff', ring: '#0ea5e9', text: '#0c4a6e', light: '#e0f2fe', btn: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)' },
  amber:   { bg: '#f5f3ff', ring: '#8b5cf6', text: '#4c1d95', light: '#ede9fe', btn: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)' },
  red:     { bg: '#fef2f2', ring: '#ef4444', text: '#991b1b', light: '#fee2e2', btn: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' },
  rose:    { bg: '#fff1f2', ring: '#f43f5e', text: '#881337', light: '#ffe4e6', btn: 'linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)' },
  pink:    { bg: '#fdf2f8', ring: '#ec4899', text: '#831843', light: '#fce7f3', btn: 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)' },
  green:   { bg: '#f0fdf4', ring: '#22c55e', text: '#166534', light: '#dcfce7', btn: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)' },
  emerald: { bg: '#ecfdf5', ring: '#10b981', text: '#065f46', light: '#d1fae5', btn: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' },
  teal:    { bg: '#f0fdfa', ring: '#14b8a6', text: '#115e59', light: '#ccfbf1', btn: 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)' },
  cyan:    { bg: '#ecfeff', ring: '#06b6d4', text: '#164e63', light: '#cffafe', btn: 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)' },
  sky:     { bg: '#f0f9ff', ring: '#0ea5e9', text: '#0c4a6e', light: '#e0f2fe', btn: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)' },
  blue:    { bg: '#eff6ff', ring: '#3b82f6', text: '#1e3a8a', light: '#dbeafe', btn: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' },
  indigo:  { bg: '#eef2ff', ring: '#6366f1', text: '#3730a3', light: '#e0e7ff', btn: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)' },
  navy:    { bg: '#eef2ff', ring: '#4338ca', text: '#312e81', light: '#e0e7ff', btn: 'linear-gradient(135deg, #4338ca 0%, #3730a3 100%)' },
  purple:  { bg: '#faf5ff', ring: '#a855f7', text: '#581c87', light: '#f3e8ff', btn: 'linear-gradient(135deg, #a855f7 0%, #9333ea 100%)' },
  violet:  { bg: '#f5f3ff', ring: '#8b5cf6', text: '#4c1d95', light: '#ede9fe', btn: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)' },
  fuchsia: { bg: '#fdf4ff', ring: '#d946ef', text: '#701a75', light: '#fae8ff', btn: 'linear-gradient(135deg, #d946ef 0%, #c026d3 100%)' },
  slate:   { bg: '#f8fafc', ring: '#64748b', text: '#1e293b', light: '#f1f5f9', btn: 'linear-gradient(135deg, #64748b 0%, #475569 100%)' },
  gray:    { bg: '#f9fafb', ring: '#6b7280', text: '#1f2937', light: '#f3f4f6', btn: 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)' },
  black:   { bg: '#f3f4f6', ring: '#374151', text: '#111827', light: '#e5e7eb', btn: 'linear-gradient(135deg, #374151 0%, #1f2937 100%)' },
};
const DEFAULT_ACCENT = { bg: '#eef2ff', ring: '#6366f1', text: '#3730a3', light: '#e0e7ff', btn: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)' };
const getAccent = (color) => ACCENT[String(color || '').toLowerCase()] || DEFAULT_ACCENT;

const ICON_MAP = {
  CrownOutlined: <CrownOutlined />,
  StarOutlined: <StarOutlined />,
  TrophyOutlined: <TrophyOutlined />,
  RocketOutlined: <RocketOutlined />,
  ThunderboltOutlined: <ThunderboltOutlined />,
  FireOutlined: <FireOutlined />,
  HeartOutlined: <HeartOutlined />,
  GiftOutlined: <GiftOutlined />,
};

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

const OfferingCard = ({ offering, onPurchase, formatCurrency, convertCurrency, userCurrency, businessCurrency, isOwned }) => {
  const price = offering.price || 0;
  const eurPrice = businessCurrency === 'EUR' ? price : convertCurrency(price, businessCurrency, 'EUR');
  const eurFormatted = formatCurrency(eurPrice, 'EUR');
  const showLocal = userCurrency && userCurrency !== 'EUR';
  const localFormatted = showLocal ? formatCurrency(convertCurrency(price, businessCurrency, userCurrency), userCurrency) : null;
  const parsedFeatures = parseFeatures(offering.features);
  const accent = getAccent(offering.badge_color);
  const durationLabel = formatDuration(offering.duration_days);
  const isHighlighted = offering.highlighted;

  return (
    <div
      className="group relative flex flex-col rounded-3xl overflow-hidden transition-all duration-300 hover:-translate-y-2 hover:scale-[1.01]"
      style={{
        background: 'rgba(255,255,255,0.07)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        border: isHighlighted
          ? `1.5px solid ${accent.ring}70`
          : '1.5px solid rgba(255,255,255,0.12)',
        boxShadow: isHighlighted
          ? `0 0 0 1px ${accent.ring}25, 0 12px 48px ${accent.ring}30`
          : '0 4px 28px rgba(0,0,0,0.35)',
      }}
    >
      {/* Best Value ribbon */}
      {isHighlighted && (
        <div
          className="absolute top-0 right-6 z-10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white flex items-center gap-1 rounded-b-xl"
          style={{ background: accent.btn, boxShadow: `0 4px 16px ${accent.ring}50` }}
        >
          <StarFilled style={{ fontSize: 8 }} /> Best Value
        </div>
      )}

      {/* Active badge */}
      {isOwned && (
        <div className="absolute top-4 left-4 z-10 flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500 text-white shadow-md">
          <CheckCircleFilled style={{ fontSize: 9 }} /> Active
        </div>
      )}

      {/* Image or header */}
      {offering.image_url ? (
        <div className="h-40 overflow-hidden">
          <img
            src={offering.image_url}
            alt={offering.name}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        </div>
      ) : (
        <div
          className="flex flex-col items-center justify-center pt-9 pb-7 px-6"
          style={{ background: `linear-gradient(160deg, ${accent.ring}22 0%, ${accent.ring}08 100%)` }}
        >
          {durationLabel && (
            <div
              className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold mb-4 text-white"
              style={{ background: `${accent.ring}35`, border: `1px solid ${accent.ring}55` }}
            >
              <ClockCircleOutlined style={{ fontSize: 10 }} />
              {durationLabel}
            </div>
          )}
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl text-white mb-1"
            style={{ background: accent.btn, boxShadow: `0 8px 28px ${accent.ring}55` }}
          >
            {ICON_MAP[offering.icon] || <CrownOutlined />}
          </div>
        </div>
      )}

      <div className="flex flex-col flex-1 p-6">
        <h3 className="text-base font-duotone-bold text-white leading-tight mb-1">{offering.name}</h3>
        {offering.description && (
          <p
            className="text-xs font-duotone-regular leading-relaxed line-clamp-2 mb-4"
            style={{ color: 'rgba(255,255,255,0.45)' }}
          >
            {offering.description}
          </p>
        )}

        {/* Price */}
        <div
          className="flex items-center justify-between rounded-2xl px-4 py-3 mb-5"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          <div>
            <div className="text-2xl font-extrabold tracking-tight text-white">{eurFormatted}</div>
            {showLocal && (
              <div className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.38)' }}>~{localFormatted}</div>
            )}
          </div>
          {durationLabel && offering.image_url && (
            <div
              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold text-white"
              style={{ background: `${accent.ring}35`, border: `1px solid ${accent.ring}55` }}
            >
              <ClockCircleOutlined style={{ fontSize: 10 }} />
              {durationLabel}
            </div>
          )}
        </div>

        {/* Features */}
        {parsedFeatures.length > 0 && (
          <ul className="space-y-2 mb-5 flex-1">
            {parsedFeatures.slice(0, 5).map((feat, i) => (
              <li key={i} className="flex items-start gap-2 text-xs" style={{ color: 'rgba(255,255,255,0.65)' }}>
                <CheckOutlined
                  className="mt-0.5 flex-shrink-0"
                  style={{ color: accent.ring, fontSize: 11 }}
                />
                {feat}
              </li>
            ))}
            {parsedFeatures.length > 5 && (
              <li className="text-xs pl-5" style={{ color: 'rgba(255,255,255,0.3)' }}>+{parsedFeatures.length - 5} more benefits</li>
            )}
          </ul>
        )}

        {/* CTA */}
        <button
          onClick={() => onPurchase(offering)}
          disabled={isOwned}
          className="w-full py-3 rounded-md font-duotone-bold text-sm tracking-wide transition-all duration-200 flex items-center justify-center gap-2 border-0 mt-auto shadow-lg"
          style={{
            background: isOwned ? 'rgba(255,255,255,0.06)' : '#4b4f54',
            color: isOwned ? 'rgba(255,255,255,0.3)' : '#00a8c4',
            cursor: isOwned ? 'not-allowed' : 'pointer',
            border: isOwned ? 'none' : '1px solid rgba(0,168,196,0.5)',
            boxShadow: isOwned ? 'none' : '0 0 12px rgba(0,168,196,0.2)',
          }}
        >
          {isOwned ? (
            <><CheckCircleFilled /> Active Plan</>
          ) : (
            <>Get This Plan</>
          )}
        </button>
      </div>
    </div>
  );
};

const MemberOfferings = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { openAuthModal } = useAuthModal();
  const { formatCurrency, convertCurrency, userCurrency, businessCurrency } = useCurrency();
  const [purchaseModal, setPurchaseModal] = useState({ visible: false, offering: null });
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [iyzicoPaymentUrl, setIyzicoPaymentUrl] = useState(null);
  const [showIyzicoModal, setShowIyzicoModal] = useState(false);

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
    onSuccess: (data) => {
      // For credit card payments, show Iyzico payment modal
      if (data?.paymentPageUrl) {
        setIyzicoPaymentUrl(data.paymentPageUrl);
        setShowIyzicoModal(true);
        return;
      }
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
    const offering = purchaseModal.offering;
    const eurBase = businessCurrency === 'EUR' ? (offering.price || 0) : convertCurrency(offering.price || 0, businessCurrency, 'EUR');
    const eurStr = formatCurrency(eurBase, 'EUR');
    const showLocal = userCurrency && userCurrency !== 'EUR';
    const localStr = showLocal ? ` (~${formatCurrency(convertCurrency(offering.price || 0, businessCurrency, userCurrency), userCurrency)})` : '';
    Modal.confirm({
      title: 'Confirm Membership Purchase',
      icon: <CrownOutlined style={{ color: '#6366f1' }} />,
      content: (
        <div style={{ marginTop: 8 }}>
          <p><strong>{offering.name}</strong></p>
          <p style={{ fontSize: 18, fontWeight: 700, margin: '8px 0' }}>{eurStr}{localStr}{offering.period ? ` / ${offering.period}` : ''}</p>
          {isStaff && selectedCustomerName && <p style={{ color: '#888' }}>Assigning to: {selectedCustomerName}</p>}
          <p style={{ color: '#888' }}>Payment: {paymentMethod === 'wallet' ? 'Wallet Balance' : paymentMethod === 'credit_card' ? 'Credit Card' : 'Pay at Reception'}</p>
        </div>
      ),
      okText: 'Confirm & Pay',
      cancelText: 'Go Back',
      centered: true,
      onOk: () => {
        if (isStaff && selectedCustomer) {
          assignMutation.mutate({ userId: selectedCustomer, offeringId: offering.id, paymentMethod });
        } else {
          purchaseMutation.mutate({ offeringId: offering.id, paymentMethod });
        }
      },
    });
  };

  const selectedCustomerData = customers.find(c => c.id === selectedCustomer);
  const selectedCustomerName = selectedCustomerData ? `${selectedCustomerData.first_name} ${selectedCustomerData.last_name}` : null;
  const modalAccent = purchaseModal.offering ? getAccent(purchaseModal.offering.badge_color) : DEFAULT_ACCENT;

  return (
    <div className="min-h-screen font-sans" style={{ background: '#0d1511' }}>

      {/* Hero */}
      <div className="relative pt-12 md:pt-16">
        <div className="absolute top-14 left-1/2 transform -translate-x-1/2 w-[95vw] sm:w-[65vw] md:w-[48rem] max-w-[850px] z-10">
          <img
            src={dpsLogo}
            alt="Duotone Pro Center Urla"
            className="w-full"
            style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.2))' }}
          />
        </div>

        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-12 text-center relative z-0">
          <div className="mt-20 md:mt-24 mb-4">
            <h1 className="text-3xl md:text-5xl font-duotone-bold-extended text-white mb-3 tracking-tight">
              MEMBERSHIPS
            </h1>
            <p className="text-lg md:text-xl font-duotone-regular max-w-2xl mx-auto leading-relaxed mb-6" style={{ color: 'rgba(255,255,255,0.7)' }}>
              Choose a plan that fits your schedule. Every membership unlocks access to facilities, services, and exclusive member benefits.
            </p>
          </div>

          {/* Trust indicators */}
          <div className="flex flex-wrap items-center justify-center gap-6 text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
            <span className="flex items-center gap-1.5">
              <CheckCircleFilled style={{ color: '#10b981', fontSize: 13 }} />
              Instant activation
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircleFilled style={{ color: '#10b981', fontSize: 13 }} />
              Secure payment
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircleFilled style={{ color: '#10b981', fontSize: 13 }} />
              No hidden fees
            </span>
            {!isLoading && offerings.length > 0 && (
              <span className="flex items-center gap-1.5">
                <CrownOutlined style={{ color: '#818cf8', fontSize: 13 }} />
                {offerings.length} plans available
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 pb-24">

        {/* Staff panel */}
        {isStaff && (
          <div
            className="mb-8 rounded-2xl p-5"
            style={{ background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            <p className="text-xs font-bold uppercase tracking-widest mb-3 flex items-center gap-2" style={{ color: 'rgba(255,255,255,0.45)' }}>
              <UserOutlined /> Staff Console — Assign Membership To a Customer
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
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: 'rgba(99,102,241,0.25)', color: '#a5b4fc' }}>
                        {(c.first_name?.[0] || 'U').toUpperCase()}
                      </div>
                      <span className="font-medium">{c.first_name} {c.last_name}</span>
                      <span className="text-gray-400 text-xs">{c.email}</span>
                    </div>
                  </Select.Option>
                ))}
              </Select>
              {selectedCustomerName && (
                <div
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-emerald-300"
                  style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)' }}
                >
                  <CheckCircleFilled /> Assigning to: {selectedCustomerName}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Guest banner */}


        {/* Loading / Error / Empty */}
        {isLoading && (
          <div className="flex items-center justify-center py-32">
            <Spin size="large" />
          </div>
        )}
        {error && (
          <Alert message="Failed to load plans" description={error.message} type="error" showIcon className="max-w-xl mx-auto rounded-2xl" />
        )}
        {!isLoading && !error && offerings.length === 0 && (
          <div
            className="text-center py-32 rounded-3xl border-2 border-dashed"
            style={{ borderColor: 'rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)' }}
          >
            <CrownOutlined style={{ fontSize: 40, color: 'rgba(255,255,255,0.15)' }} />
            <p className="mt-4 font-medium" style={{ color: 'rgba(255,255,255,0.3)' }}>No membership plans available at the moment.</p>
          </div>
        )}

        {/* Cards grid */}
        {!isLoading && !error && offerings.length > 0 && (
          <>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl md:text-2xl font-duotone-bold-extended text-white uppercase">Available Plans</h2>
                <p className="text-xs font-duotone-regular mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>{offerings.length} plan{offerings.length !== 1 ? 's' : ''} to choose from</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {offerings.map(offering => (
                <OfferingCard
                  key={offering.id}
                  offering={offering}
                  onPurchase={handlePurchase}
                  formatCurrency={formatCurrency}
                  convertCurrency={convertCurrency}
                  userCurrency={userCurrency}
                  businessCurrency={businessCurrency}
                  isOwned={ownedOfferingIds.has(offering.id)}
                />
              ))}
            </div>

            {/* Bottom trust strip */}
            <div className="mt-16 flex flex-wrap justify-center gap-8 text-xs" style={{ color: 'rgba(255,255,255,0.28)' }}>
              <span className="flex items-center gap-2"><SafetyCertificateOutlined /> SSL encrypted checkout</span>
              <span className="flex items-center gap-2"><WalletOutlined /> Pay by wallet, card, or cash</span>
              <span className="flex items-center gap-2"><ClockCircleOutlined /> Membership starts immediately</span>
            </div>
          </>
        )}
      </div>

      {/* Purchase Modal */}
      <Modal
        open={purchaseModal.visible}
        onCancel={() => setPurchaseModal({ visible: false, offering: null })}
        footer={null}
        width={420}
        centered
        title={null}
        styles={{ content: { borderRadius: 20, padding: 0, overflow: 'hidden' } }}
      >
        {purchaseModal.offering && (() => {
          const offering = purchaseModal.offering;
          const eurBase = businessCurrency === 'EUR' ? (offering.price || 0) : convertCurrency(offering.price || 0, businessCurrency, 'EUR');
          return (
            <div>
              {/* Modal header */}
              <div className="px-8 pt-8 pb-6 text-center" style={{ background: modalAccent.bg }}>
                <div
                  className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center text-2xl text-white shadow-lg"
                  style={{ background: modalAccent.btn }}
                >
                  {ICON_MAP[purchaseModal.offering.icon] || <CrownOutlined />}
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-1">{offering.name}</h3>
                <div className="text-2xl font-extrabold my-2" style={{ color: modalAccent.ring }}>
                  {formatCurrency(eurBase, 'EUR')}
                  {userCurrency && userCurrency !== 'EUR' && (
                    <span className="text-sm font-normal text-slate-400 ml-1">
                      (~{formatCurrency(convertCurrency(offering.price || 0, businessCurrency, userCurrency), userCurrency)})
                    </span>
                  )}
                  {offering.period && (
                    <span className="text-sm font-normal text-slate-400"> / {offering.period}</span>
                  )}
                </div>
                <p className="text-sm text-slate-500">
                  {isStaff && selectedCustomerName
                    ? <>Assigning to <strong className="text-slate-700">{selectedCustomerName}</strong></>
                    : 'Select your payment method'}
                </p>
              </div>

              {/* Payment options */}
              <div className="p-6 space-y-3">
                <button
                  onClick={() => confirmPurchase('wallet')}
                  disabled={purchaseMutation.isPending || assignMutation.isPending}
                  className="w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all duration-200 hover:shadow-md text-left disabled:opacity-50 disabled:cursor-not-allowed bg-white cursor-pointer"
                  style={{ borderColor: `${modalAccent.ring}40` }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = modalAccent.ring; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = `${modalAccent.ring}40`; }}
                >
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-lg flex-shrink-0" style={{ background: modalAccent.btn }}>
                    <WalletOutlined />
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-slate-800">{(purchaseMutation.isPending || assignMutation.isPending) ? 'Processing...' : 'Wallet Balance'}</div>
                    <div className="text-xs text-slate-400">Deduct from your UKC wallet</div>
                  </div>
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full text-white" style={{ background: modalAccent.btn }}>Fast</span>
                </button>

                <button
                  onClick={() => confirmPurchase('credit_card')}
                  disabled={purchaseMutation.isPending || assignMutation.isPending}
                  className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-emerald-200 bg-white hover:border-emerald-400 hover:shadow-md transition-all duration-200 text-left disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center text-white text-lg flex-shrink-0">
                    <CreditCardOutlined />
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-slate-800">{(purchaseMutation.isPending || assignMutation.isPending) ? 'Processing...' : 'Credit Card'}</div>
                    <div className="text-xs text-slate-400">Pay securely via Iyzico</div>
                  </div>
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-500 text-white">Secure</span>
                </button>

                <button
                  onClick={() => confirmPurchase('cash')}
                  disabled={purchaseMutation.isPending || assignMutation.isPending}
                  className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-slate-200 bg-white hover:border-slate-300 hover:shadow-md transition-all duration-200 text-left disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 text-lg flex-shrink-0">
                    <ShopOutlined />
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-slate-800">{isStaff ? 'Cash Payment' : 'Pay at Reception'}</div>
                    <div className="text-xs text-slate-400">In-person at the desk</div>
                  </div>
                </button>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* Iyzico Credit Card Payment Modal */}
      <IyzicoPaymentModal
        visible={showIyzicoModal}
        paymentPageUrl={iyzicoPaymentUrl}
        socketEventName="membership:payment_confirmed"
        onSuccess={() => {
          setShowIyzicoModal(false);
          setIyzicoPaymentUrl(null);
          message.success('Payment confirmed! Membership activated.');
          setPurchaseModal({ visible: false, offering: null });
          queryClient.invalidateQueries(['member-offerings']);
          queryClient.invalidateQueries(['my-member-purchases']);
        }}
        onClose={() => {
          setShowIyzicoModal(false);
          setIyzicoPaymentUrl(null);
        }}
        onError={(msg) => {
          setShowIyzicoModal(false);
          setIyzicoPaymentUrl(null);
          message.error(msg || 'Payment failed');
        }}
      />
      {/* Centered White Logo at Bottom */}
      <div className="w-full flex justify-center items-center" style={{ margin: '48px 0 24px 0' }}>
        <img
          src={dpsLogo}
          alt="Duotone Pro Center Urla White Logo"
          style={{ width: '100%', maxWidth: '900px', height: 'auto', display: 'block', margin: '0 auto', padding: '8px 0' }}
        />
      </div>
    </div>
  );
};

export default MemberOfferings;
