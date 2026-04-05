import { useState, useMemo, useEffect } from 'react';
import { Spin, Alert, message, Modal, Select, DatePicker, Tag, Button, Upload, Tooltip, InputNumber } from 'antd';
import { useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import dpsLogo from '../../../../DuotoneFonts/DPSLOGOS/DPS-transparenton-black.svg';
import {
  CrownOutlined,
  CheckOutlined,
  CheckCircleFilled,
  WalletOutlined,
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
  CalendarOutlined,
  BankOutlined,
  CopyOutlined,
  InfoCircleOutlined,
  UploadOutlined,
  InboxOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { UkcBrandDot } from '@/shared/components/ui/UkcBrandDot';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { useAuth } from '@/shared/hooks/useAuth';
import { useAuthModal } from '@/shared/contexts/AuthModalContext';
import { useWalletSummary } from '@/shared/hooks/useWalletSummary';
import apiClient, { resolveApiBaseUrl, getAccessToken } from '@/shared/services/apiClient';
import IyzicoPaymentModal from '@/shared/components/IyzicoPaymentModal';

const fetchMemberOfferings = async () => {
  const { data } = await apiClient.get('/member-offerings');
  return data;
};

const fetchMyPurchases = async () => {
  const { data } = await apiClient.get('/member-offerings/my-purchases');
  return data;
};

const purchaseMembership = async ({ offeringId, paymentMethod, startDate, depositPercent, depositAmount, bankAccountId, receiptUrl }) => {
  const { data } = await apiClient.post(`/member-offerings/${offeringId}/purchase`, {
    paymentMethod, startDate, depositPercent, depositAmount, bankAccountId, receiptUrl,
  });
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

const uploadReceipt = (file) => new Promise((resolve, reject) => {
  const formData = new FormData();
  formData.append('image', file);
  const token = getAccessToken() || localStorage.getItem('token');
  const base = resolveApiBaseUrl();
  const xhr = new XMLHttpRequest();
  xhr.addEventListener('load', () => {
    if (xhr.status === 200) resolve(JSON.parse(xhr.responseText).url);
    else reject(new Error(JSON.parse(xhr.responseText || '{}').error || 'Upload failed'));
  });
  xhr.addEventListener('error', () => reject(new Error('Upload failed')));
  xhr.open('POST', `${base}/api/upload/wallet-deposit`);
  if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
  xhr.send(formData);
});

function CopyButton({ value }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(value || '').then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <Tooltip title={copied ? 'Copied!' : 'Copy'} placement="top">
      <button
        type="button"
        onClick={handleCopy}
        className="flex-shrink-0 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium transition-colors ml-3"
      >
        {copied ? (
          <><CheckOutlined className="text-green-500" /><span className="text-green-500">Copied</span></>
        ) : (
          <><CopyOutlined />Copy</>
        )}
      </button>
    </Tooltip>
  );
}

function BankDetailsCard({ account }) {
  if (!account) return null;
  const CURRENCY_COLOR = { EUR: 'blue', USD: 'green', GBP: 'purple', TRY: 'orange' };
  const fields = [
    { label: 'Bank', value: account.bankName },
    { label: 'Account Holder', value: account.accountHolder },
    { label: 'IBAN', value: account.iban, mono: true, copy: true },
    ...(account.swiftCode ? [{ label: 'SWIFT / BIC', value: account.swiftCode, mono: true, copy: true }] : []),
    ...(account.accountNumber ? [{ label: 'Account No.', value: account.accountNumber, mono: true, copy: true }] : []),
    ...(account.routingNumber ? [{ label: 'Routing No.', value: account.routingNumber, mono: true, copy: true }] : []),
  ];
  return (
    <div className="mt-3 rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 bg-blue-600/10 border-b border-blue-200">
        <div className="flex items-center gap-2">
          <BankOutlined className="text-blue-600" />
          <span className="text-xs font-semibold text-blue-700 uppercase tracking-wider">Transfer To</span>
        </div>
        <Tag color={CURRENCY_COLOR[account.currency] || 'default'} className="font-bold m-0 text-xs">
          {account.currency}
        </Tag>
      </div>
      <div className="px-4 py-0.5 divide-y divide-blue-100">
        {fields.map(({ label, value, mono, copy }) => (
          <div key={label} className="flex items-center justify-between py-2.5 gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">{label}</p>
              <p className={`text-sm text-slate-800 leading-snug break-all ${mono ? 'font-mono tracking-wide' : 'font-medium'}`}>
                {value}
              </p>
            </div>
            {copy && <CopyButton value={value} />}
          </div>
        ))}
      </div>
      {account.instructions && (
        <div className="px-4 py-2.5 bg-amber-50 border-t border-amber-200 flex gap-2">
          <InfoCircleOutlined className="text-amber-500 mt-0.5 flex-shrink-0" />
          <p className="text-[11px] text-amber-700 leading-snug">{account.instructions}</p>
        </div>
      )}
    </div>
  );
}

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

const OfferingCard = ({ offering, onPurchase, formatCurrency, convertCurrency, userCurrency, businessCurrency, isOwned, storageUnit }) => {
  const price = offering.price || 0;
  const eurPrice = businessCurrency === 'EUR' ? price : convertCurrency(price, businessCurrency, 'EUR');
  const eurFormatted = formatCurrency(eurPrice, 'EUR');
  const showLocal = userCurrency && userCurrency !== 'EUR';
  const localFormatted = showLocal ? formatCurrency(convertCurrency(price, businessCurrency, userCurrency), userCurrency) : null;
  const parsedFeatures = parseFeatures(offering.features);
  const accent = getAccent(offering.badge_color);
  const durationLabel = formatDuration(offering.duration_days);
  const isHighlighted = offering.highlighted;
  const isStorage = offering.category === 'storage';
  const isSoldOut = isStorage && offering.available_count != null && offering.available_count <= 0;

  return (
    <div
      onClick={() => !isSoldOut && onPurchase(offering)}
      className={`group relative isolate overflow-hidden rounded-3xl bg-[#1a1f26]/55 backdrop-blur-2xl backdrop-saturate-[1.2] transition-[transform,box-shadow,border-color] duration-300 flex flex-col ${isSoldOut ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:-translate-y-1'}`}
      style={{ border: '1px solid rgba(0,168,196,0.5)', boxShadow: '0 0 10px rgba(0,168,196,0.3), 0 0 25px rgba(0,168,196,0.15), 0 0 50px rgba(0,168,196,0.05)' }}
      onMouseEnter={e => { if (!isSoldOut) { e.currentTarget.style.border = '1px solid rgba(0,168,196,0.75)'; e.currentTarget.style.boxShadow = '0 0 15px rgba(0,168,196,0.45), 0 0 35px rgba(0,168,196,0.2), 0 0 60px rgba(0,168,196,0.08)'; } }}
      onMouseLeave={e => { e.currentTarget.style.border = '1px solid rgba(0,168,196,0.5)'; e.currentTarget.style.boxShadow = '0 0 10px rgba(0,168,196,0.3), 0 0 25px rgba(0,168,196,0.15), 0 0 50px rgba(0,168,196,0.05)'; }}
    >
      {/* Header — image or icon fallback */}
      <div className="h-36 sm:h-40 relative rounded-t-3xl overflow-hidden">
        {offering.image_url ? (
          <img
            src={offering.image_url}
            alt={offering.name}
            className="absolute inset-0 w-full h-full object-cover transition-all duration-500 group-hover:scale-[1.03] group-hover:brightness-110 group-hover:contrast-110"
            loading="lazy"
          />
        ) : (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ background: `linear-gradient(160deg, ${accent.ring}25 0%, rgba(26,31,38,0.6) 100%)` }}
          >
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl text-white"
              style={{ background: accent.btn, boxShadow: `0 6px 20px ${accent.ring}55` }}
            >
              {ICON_MAP[offering.icon] || <CrownOutlined />}
            </div>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-cyan-900/10 via-[#1a1d22]/40 to-[#1a1d22]/70 mix-blend-multiply" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(180,220,240,0.08)_0%,transparent_70%)]" />
        <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-white/[0.06]" />

        {/* Best Value ribbon */}
        {isHighlighted && (
          <div className="absolute top-4 right-4 bg-black/60 backdrop-blur-md text-white px-3 py-1 rounded-full text-xs font-bold shadow-lg flex items-center gap-1">
            <StarFilled className="text-yellow-500" /> Best Value
          </div>
        )}

        {/* Active badge */}
        {isOwned && (
          <div className="absolute top-4 left-4 z-10 flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500 text-white shadow-md">
            <CheckCircleFilled style={{ fontSize: 9 }} /> {storageUnit ? `Unit #${storageUnit}` : 'Active'}
          </div>
        )}

        {/* Storage availability badge */}
        {isStorage && offering.available_count != null && (
          <div className={`absolute ${isOwned ? 'top-12' : 'top-4'} left-4 z-10 flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider shadow-md ${
            isSoldOut ? 'bg-red-500 text-white' : 'bg-orange-500 text-white'
          }`}>
            {isSoldOut ? 'Sold Out' : `${offering.available_count} of ${offering.total_capacity} available`}
          </div>
        )}
      </div>

      {/* Body */}
      <div className="relative z-10 -mt-px pt-5 px-4 pb-4 bg-[#1a1f26]/50 backdrop-blur-2xl backdrop-saturate-[1.2] rounded-b-3xl flex-1 flex flex-col">
        <h3 className="text-base sm:text-lg font-duotone-bold-extended text-white mb-1 transition-colors leading-tight break-words group-hover:text-cyan-300">{offering.name}</h3>
        {offering.description && (
          <p className="text-xs text-gray-400 mb-4 font-duotone-regular uppercase tracking-wide break-words line-clamp-2">{offering.description}</p>
        )}

        {/* Features (max 3) */}
        {parsedFeatures.length > 0 && (
          <div className="space-y-2 mb-4">
            {parsedFeatures.slice(0, 3).map((feat, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-gray-300 font-duotone-regular">
                <CheckOutlined style={{ color: '#00a8c4', fontSize: 11 }} className="flex-shrink-0" />
                <span className="break-words line-clamp-1">{feat}</span>
              </div>
            ))}
          </div>
        )}

        {/* Price pinned to bottom */}
        <div className="flex items-end justify-between border-t border-white/[0.08] pt-4 mt-auto">
          <div>
            <p className="text-xs text-gray-500 mb-1 font-duotone-regular">{isOwned ? 'Your plan' : 'Price'}</p>
            <p className="text-lg sm:text-xl font-duotone-bold-extended text-white">{eurFormatted}</p>
            {showLocal && (
              <p className="text-[10px] text-gray-500 font-duotone-regular">~{localFormatted}</p>
            )}
          </div>
          {durationLabel && (
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-duotone-regular text-gray-400 bg-white/[0.06] border border-white/[0.08]">
              <ClockCircleOutlined style={{ fontSize: 10 }} />
              {durationLabel}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const PAYMENT_REASON_LABELS = {
  membership_payment_error: 'There was a problem processing your membership payment.',
  insufficient_funds: 'Insufficient funds to complete the purchase.',
  payment_timeout: 'The payment session timed out. Please try again.',
  card_declined: 'Your card was declined. Please try a different card.',
};

const MemberOfferings = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { openAuthModal } = useAuthModal();
  const { formatCurrency, convertCurrency, userCurrency, businessCurrency } = useCurrency();
  const [searchParams, setSearchParams] = useSearchParams();
  const [purchaseModal, setPurchaseModal] = useState({ visible: false, offering: null });

  useEffect(() => {
    const paymentStatus = searchParams.get('payment');
    const paymentReason = searchParams.get('reason');
    if (!paymentStatus) return;

    if (paymentStatus === 'success') {
      message.success({ content: 'Payment successful! Your membership has been activated.', duration: 5 });
      queryClient.invalidateQueries(['member-offerings']);
      queryClient.invalidateQueries(['my-member-purchases']);
    } else if (paymentStatus === 'failed') {
      const reasonText = PAYMENT_REASON_LABELS[paymentReason] || 'Your payment could not be processed. Please try again or use a different payment method.';
      message.error({ content: reasonText, duration: 7 });
    }

    setSearchParams({}, { replace: true });
  }, []);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [iyzicoPaymentUrl, setIyzicoPaymentUrl] = useState(null);
  const [showIyzicoModal, setShowIyzicoModal] = useState(false);
  const [pendingPurchaseId, setPendingPurchaseId] = useState(null);
  const [startDate, setStartDate] = useState(dayjs());
  const [paymentMethod, setPaymentMethod] = useState('wallet');
  const [depositMethod, setDepositMethod] = useState('credit_card');
  const [selectedBankAccountId, setSelectedBankAccountId] = useState(null);
  const [fileList, setFileList] = useState([]);

  const walletCurrency = businessCurrency || 'EUR';
  const { data: walletSummary } = useWalletSummary({
    currency: userCurrency,
    enabled: !!user && purchaseModal.visible,
  });

  const walletBalance = useMemo(() => {
    const allBalances = walletSummary?.balances;
    if (Array.isArray(allBalances) && allBalances.length > 0) {
      let total = 0;
      for (const b of allBalances) {
        if ((b.available || 0) !== 0) {
          if (b.currency === walletCurrency) {
            total += Number(b.available) || 0;
          } else if (convertCurrency) {
            total += convertCurrency(Number(b.available) || 0, b.currency, walletCurrency);
          }
        }
      }
      return total;
    }
    return Number(walletSummary?.available) || 0;
  }, [walletSummary, walletCurrency, convertCurrency]);

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

  const { data: bankAccounts = [] } = useQuery({
    queryKey: ['member-offerings', 'bank-accounts'],
    queryFn: async () => {
      const res = await apiClient.get('/wallet/bank-accounts');
      return res.data?.results || [];
    },
    enabled: !!user && purchaseModal.visible,
    staleTime: 300_000,
  });

  const selectedAccount = useMemo(
    () => bankAccounts.find(a => a.id === selectedBankAccountId),
    [bankAccounts, selectedBankAccountId]
  );

  const activePurchases = myPurchases.filter(p => p.status === 'active' && (!p.expires_at || new Date(p.expires_at) > new Date()));
  const ownedOfferingIds = new Set(activePurchases.map(p => p.offering_id));
  const storageUnitMap = useMemo(() => {
    const map = {};
    activePurchases.forEach(p => {
      if (p.storage_unit) map[p.offering_id] = p.storage_unit;
    });
    return map;
  }, [activePurchases]);

  const purchaseMutation = useMutation({
    mutationFn: purchaseMembership,
    onSuccess: (data) => {
      if (data?.paymentPageUrl) {
        setPendingPurchaseId(data.purchase?.id || null);
        setIyzicoPaymentUrl(data.paymentPageUrl);
        setShowIyzicoModal(true);
        return;
      }
      if (data?.pendingApproval) {
        message.success('Receipt submitted! Your membership will be activated after admin approval.');
      } else if (data?.paymentStatus === 'pending_payment') {
        message.info('Payment pending — please complete payment to activate.');
        return;
      } else {
        const unitMsg = data?.purchase?.storage_unit ? ` — Storage Unit #${data.purchase.storage_unit}` : '';
        message.success(`Purchase successful!${unitMsg}`);
      }
      setPurchaseModal({ visible: false, offering: null });
      queryClient.invalidateQueries(['member-offerings']);
      queryClient.invalidateQueries(['my-member-purchases']);
    },
    onError: (err) => {
      message.error(err.response?.data?.error || err.response?.data?.message || 'Purchase failed. Please try again.');
    },
  });

  const assignMutation = useMutation({
    mutationFn: async ({ userId, offeringId, paymentMethod, startDate }) => {
      const { data } = await apiClient.post('/member-offerings/admin/purchases', { userId, offeringId, paymentMethod, startDate });
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
    if (offering.category === 'storage' && offering.available_count != null && offering.available_count <= 0) {
      message.warning('No storage slots available at the moment.');
      return;
    }
    if (isGuest) { message.info('Please sign in to purchase a membership.'); openAuthModal({ title: 'Sign In to Purchase', message: 'Create an account or sign in to purchase a membership.', mode: 'register', returnUrl: '/members/offerings' }); return; }
    if (isStaff && !selectedCustomer) { message.warning('Select a customer first.'); return; }
    setStartDate(dayjs());
    setPaymentMethod('wallet');
    setDepositMethod('credit_card');
    setSelectedBankAccountId(null);
    setFileList([]);
    setPurchaseModal({ visible: true, offering });
  };

  const executePurchase = async () => {
    if (!purchaseModal.offering) return;
    const offering = purchaseModal.offering;
    const dateStr = startDate ? startDate.toISOString() : undefined;
    const isDeposit = paymentMethod === 'deposit';
    const actualMethod = isDeposit ? depositMethod : paymentMethod;
    const depositPct = isDeposit ? 20 : undefined;
    const needsReceipt = actualMethod === 'bank_transfer';

    let receiptUrl = undefined;
    if (needsReceipt && fileList.length > 0) {
      try {
        receiptUrl = await uploadReceipt(fileList[0]);
      } catch (e) {
        message.error(e.message || 'Failed to upload receipt');
        return;
      }
    }

    const eurBase = businessCurrency === 'EUR' ? (offering.price || 0) : convertCurrency(offering.price || 0, businessCurrency, 'EUR');
    const depAmt = isDeposit ? parseFloat((eurBase * 0.2).toFixed(2)) : undefined;

    const payload = {
      offeringId: offering.id,
      paymentMethod: actualMethod,
      startDate: dateStr,
      depositPercent: depositPct,
      depositAmount: depAmt,
      bankAccountId: needsReceipt ? selectedBankAccountId : undefined,
      receiptUrl,
    };

    if (isStaff && selectedCustomer) {
      assignMutation.mutate({ userId: selectedCustomer, ...payload });
    } else {
      purchaseMutation.mutate(payload);
    }
  };

  const cancelPendingPurchase = async () => {
    if (!pendingPurchaseId) return;
    try {
      await apiClient.post(`/member-offerings/purchases/${pendingPurchaseId}/cancel`);
      queryClient.invalidateQueries(['member-offerings']);
      queryClient.invalidateQueries(['my-member-purchases']);
    } catch {
      // silent — backend will auto-expire stale purchases anyway
    }
    setPendingPurchaseId(null);
  };

  const selectedCustomerData = customers.find(c => c.id === selectedCustomer);
  const selectedCustomerName = selectedCustomerData ? `${selectedCustomerData.first_name} ${selectedCustomerData.last_name}` : null;

  return (
    <div className="min-h-screen font-sans bg-[#f4f6f8]">

      {/* Hero */}
      <div className="relative pt-12 md:pt-16">
        <div className="absolute top-14 left-1/2 transform -translate-x-1/2 w-[95vw] sm:w-[65vw] md:w-[48rem] max-w-[850px] z-10 flex flex-col items-center">
          <img
            src={dpsLogo}
            alt="Duotone Pro Center Urla"
            className="w-full"
            style={{ filter: 'invert(1) drop-shadow(0 1px 4px rgba(0,0,0,0.08))' }}
          />
          <p className="-mt-1.5 text-slate-900/80 tracking-[0.25em] text-sm sm:text-base">
            <span className="font-duotone-bold uppercase">Powered by </span>
            <span className="font-gotham-bold inline-flex items-baseline" style={{ letterSpacing: '0.05em', fontSize: 'inherit' }}>
              UKC
              <UkcBrandDot style={{ top: '0.14em' }} />
            </span>
          </p>
        </div>

        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-12 text-center relative z-0">
          <div className="mt-20 md:mt-24 mb-4">
            <h1 className="text-3xl md:text-5xl font-duotone-bold-extended text-slate-900 mb-3 tracking-tight">
              MEMBERSHIPS
            </h1>
            <p className="text-lg md:text-xl font-duotone-regular text-slate-500 max-w-2xl mx-auto leading-relaxed mb-6">
              Choose a plan that fits your schedule. Every membership unlocks access to facilities, services, and exclusive member benefits.
            </p>
          </div>

          {/* Trust indicators */}
          <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-slate-400">
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
            className="mb-8 rounded-2xl p-5 bg-white/70 backdrop-blur-xl border border-slate-200"
          >
            <p className="text-xs font-bold uppercase tracking-widest mb-3 flex items-center gap-2 text-slate-500">
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
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200"
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
            className="text-center py-32 rounded-3xl border-2 border-dashed border-slate-200 bg-white/50"
          >
            <CrownOutlined style={{ fontSize: 40, color: '#cbd5e1' }} />
            <p className="mt-4 font-medium text-slate-400">No membership plans available at the moment.</p>
          </div>
        )}

        {/* Cards grid */}
        {!isLoading && !error && offerings.length > 0 && (() => {
          const membershipOfferings = offerings.filter(o => o.category !== 'storage');
          const storageOfferings = offerings.filter(o => o.category === 'storage');
          const renderGrid = (items) => (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {items.map(offering => (
                <OfferingCard
                  key={offering.id}
                  offering={offering}
                  onPurchase={handlePurchase}
                  formatCurrency={formatCurrency}
                  convertCurrency={convertCurrency}
                  userCurrency={userCurrency}
                  businessCurrency={businessCurrency}
                  isOwned={ownedOfferingIds.has(offering.id)}
                  storageUnit={storageUnitMap[offering.id]}
                />
              ))}
            </div>
          );

          return (
          <>
            {membershipOfferings.length > 0 && (
              <>
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-xl md:text-2xl font-duotone-bold-extended text-slate-900 uppercase">Memberships</h2>
                    <p className="text-xs font-duotone-regular mt-0.5 text-slate-400">{membershipOfferings.length} plan{membershipOfferings.length !== 1 ? 's' : ''} to choose from</p>
                  </div>
                </div>
                {renderGrid(membershipOfferings)}
              </>
            )}

            {storageOfferings.length > 0 && (
              <>
                <div className={`flex items-center justify-between mb-6 ${membershipOfferings.length > 0 ? 'mt-16' : ''}`}>
                  <div>
                    <h2 className="text-xl md:text-2xl font-duotone-bold-extended text-slate-900 uppercase">Storage</h2>
                    <p className="text-xs font-duotone-regular mt-0.5 text-slate-400">Secure equipment storage — {storageOfferings.length} option{storageOfferings.length !== 1 ? 's' : ''}</p>
                  </div>
                </div>
                {renderGrid(storageOfferings)}
              </>
            )}

            {/* Bottom trust strip */}
            <div className="mt-16 flex flex-wrap justify-center gap-8 text-xs text-slate-400">
              <span className="flex items-center gap-2"><SafetyCertificateOutlined /> SSL encrypted checkout</span>
              <span className="flex items-center gap-2"><WalletOutlined /> Pay by wallet, card, or deposit</span>
              <span className="flex items-center gap-2"><ClockCircleOutlined /> Membership starts immediately</span>
            </div>
          </>
          );
        })()}
      </div>

      {/* Purchase Modal */}
      <Modal
        open={purchaseModal.visible}
        onCancel={() => setPurchaseModal({ visible: false, offering: null })}
        footer={null}
        width={520}
        centered
        destroyOnHidden
        style={{ maxWidth: '94vw' }}
        styles={{
          content: { borderRadius: 16, padding: '16px 16px 20px' },
          header: { marginBottom: 0, paddingBottom: 12 },
        }}
        title={purchaseModal.offering ? (
          <div className="flex items-center gap-2 sm:gap-3">
            <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${purchaseModal.offering.category === 'storage' ? 'bg-gradient-to-br from-orange-500 to-orange-600 shadow-orange-500/20' : 'bg-gradient-to-br from-cyan-500 to-cyan-600 shadow-cyan-500/20'}`}>
              {purchaseModal.offering.category === 'storage'
                ? <InboxOutlined className="text-white text-sm sm:text-base" />
                : <CrownOutlined className="text-white text-sm sm:text-base" />}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm sm:text-base font-bold text-slate-900 leading-tight truncate">
                {purchaseModal.offering.category === 'storage' ? 'Reserve Storage' : 'Purchase Membership'}
              </h3>
              <p className="text-[10px] sm:text-xs text-slate-400 leading-tight mt-0.5 truncate">{purchaseModal.offering.name}</p>
            </div>
          </div>
        ) : null}
      >
        {purchaseModal.offering && (() => {
          const offering = purchaseModal.offering;
          const eurBase = businessCurrency === 'EUR' ? (offering.price || 0) : convertCurrency(offering.price || 0, businessCurrency, 'EUR');
          const eurFormatted = formatCurrency(eurBase, 'EUR');
          const showLocal = userCurrency && userCurrency !== 'EUR';
          const localFormatted = showLocal ? formatCurrency(convertCurrency(offering.price || 0, businessCurrency, userCurrency), userCurrency) : null;
          const dualPrice = showLocal ? `${eurFormatted} (~${localFormatted})` : eurFormatted;
          const features = parseFeatures(offering.features);
          const durLabel = formatDuration(offering.duration_days);
          const endDate = offering.duration_days && startDate ? startDate.add(offering.duration_days, 'day') : null;
          const isPending = purchaseMutation.isPending || assignMutation.isPending;
          const walletIsInsufficient = paymentMethod === 'wallet' && eurBase > walletBalance;
          const depositAmount = parseFloat((eurBase * 0.2).toFixed(2));
          const remainingAmount = parseFloat((eurBase - depositAmount).toFixed(2));
          const fmtDual = (amt) => {
            const e = formatCurrency(amt, 'EUR');
            if (!showLocal) return e;
            return `${e} (~${formatCurrency(convertCurrency(amt, 'EUR', userCurrency), userCurrency)})`;
          };

          return (
            <div className="space-y-4 sm:space-y-5">
              {/* Offering summary card */}
              <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white via-slate-50/50 to-cyan-50/30 p-4 sm:p-5">
                <div className="absolute -top-10 -right-10 w-28 h-28 rounded-full bg-cyan-500/[0.04]" />
                <div className="relative">
                  <h3 className="text-base sm:text-lg font-duotone-bold-extended text-slate-900 leading-tight">{offering.name}</h3>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    {durLabel && <Tag color="cyan" className="!text-[10px] sm:!text-xs !m-0 !leading-tight">{durLabel}</Tag>}
                    {offering.period && <Tag className="!text-[10px] sm:!text-xs !m-0 !leading-tight">{offering.period}</Tag>}
                  </div>
                  {offering.description && (
                    <p className="text-xs sm:text-sm text-slate-500 mt-2 line-clamp-2 font-duotone-regular">{offering.description}</p>
                  )}

                  {/* Features */}
                  {features.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      {features.slice(0, 5).map((feat, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs text-slate-600 font-duotone-regular">
                          <CheckOutlined className="mt-0.5 flex-shrink-0" style={{ color: '#00a8c4', fontSize: 11 }} />
                          <span className="line-clamp-1">{feat}</span>
                        </div>
                      ))}
                      {features.length > 5 && (
                        <p className="text-[10px] text-slate-400 pl-5">+{features.length - 5} more benefits</p>
                      )}
                    </div>
                  )}

                  <div className="mt-3 pt-3 border-t border-slate-200/60 flex items-end justify-between">
                    <span className="text-[10px] sm:text-xs text-slate-400 uppercase tracking-wider font-semibold">Total Price</span>
                    <span className="text-2xl sm:text-3xl font-duotone-bold-extended text-slate-900 tracking-tight leading-none">{dualPrice}</span>
                  </div>
                </div>
              </div>

              {/* Start date picker — show for all offerings with duration */}
              {offering.duration_days && (
                <div>
                  <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    <CalendarOutlined className="mr-1" /> Start Date
                  </p>
                  <DatePicker
                    value={startDate}
                    onChange={(d) => setStartDate(d || dayjs())}
                    className="w-full !rounded-xl !h-11"
                    format="dddd, MMMM D, YYYY"
                    disabledDate={(current) => current && current < dayjs().startOf('day')}
                    allowClear={false}
                  />
                  {endDate && (
                    <p className="text-[10px] sm:text-xs text-slate-400 mt-1.5 flex items-center gap-1">
                      <ClockCircleOutlined style={{ fontSize: 10 }} />
                      Valid until {endDate.format('MMMM D, YYYY')} ({offering.duration_days} days)
                    </p>
                  )}
                </div>
              )}

              {/* Storage unit assignment preview */}
              {offering.category === 'storage' && offering.available_count != null && (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-cyan-50 border border-cyan-200 text-xs text-cyan-700">
                  <InboxOutlined />
                  <span>You will be assigned <strong>Storage Unit #{(offering.total_capacity || 0) - (offering.available_count || 0) + 1}</strong></span>
                </div>
              )}

              {/* Payment method grid */}
              <div>
                <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Payment Method</p>
                {(() => {
                  const walletDisplayBalance = convertCurrency ? convertCurrency(walletBalance, walletCurrency, userCurrency) : walletBalance;
                  const walletFormatted = formatCurrency(walletDisplayBalance, userCurrency);
                  return (
                  <>
                <div className="grid gap-2 grid-cols-3">
                  {[
                    { key: 'wallet', icon: <WalletOutlined />, label: 'Wallet', activeColor: '#3b82f6', activeBg: '#eff6ff', sub: walletFormatted },
                    { key: 'credit_card', icon: <CreditCardOutlined />, label: 'Card', activeColor: '#10b981', activeBg: '#ecfdf5', sub: 'Iyzico' },
                    { key: 'deposit', icon: <SafetyCertificateOutlined />, label: 'Deposit 20%', activeColor: '#8b5cf6', activeBg: '#f5f3ff', sub: fmtDual(depositAmount) },
                  ].map(({ key, icon, label, activeColor, activeBg, sub }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setPaymentMethod(key)}
                      className={`relative flex flex-col items-center gap-1 sm:gap-1.5 p-3 sm:p-4 rounded-xl border-2 transition-all text-center cursor-pointer ${
                        paymentMethod === key
                          ? 'shadow-sm'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                      }`}
                      style={paymentMethod === key ? { borderColor: activeColor, backgroundColor: activeBg } : {}}
                    >
                      {paymentMethod === key && (
                        <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full flex items-center justify-center" style={{ backgroundColor: activeColor }}>
                          <CheckOutlined className="text-white text-[8px]" />
                        </div>
                      )}
                      <span className={`text-lg sm:text-xl ${paymentMethod === key ? '' : 'text-slate-400'}`} style={paymentMethod === key ? { color: activeColor } : {}}>
                        {icon}
                      </span>
                      <span className={`text-[11px] sm:text-xs font-semibold ${paymentMethod === key ? 'text-slate-700' : 'text-slate-600'}`}>{label}</span>
                      {sub && <span className="text-[9px] sm:text-[10px] text-slate-400 -mt-0.5 leading-tight">{sub}</span>}
                    </button>
                  ))}
                </div>

                {/* Insufficient wallet balance warning */}
                {paymentMethod === 'wallet' && walletIsInsufficient && (
                  <Alert
                    type="warning"
                    showIcon
                    icon={<WarningOutlined />}
                    className="!mt-2 !rounded-xl !text-xs"
                    message={`Insufficient balance. You have ${walletFormatted} but need ${dualPrice}.`}
                  />
                )}
                  </>
                  );
                })()}

                {/* Deposit sub-options */}
                {paymentMethod === 'deposit' && (
                  <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50/50 p-3 space-y-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500 font-duotone-regular">Deposit (20%)</span>
                      <span className="font-duotone-bold text-slate-900">{fmtDual(depositAmount)}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500 font-duotone-regular">Remaining on arrival</span>
                      <span className="font-duotone-bold text-slate-900">{fmtDual(remainingAmount)}</span>
                    </div>
                    <div className="border-t border-violet-200 pt-2.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">Pay deposit via</p>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { key: 'credit_card', icon: <CreditCardOutlined />, label: 'Card', activeColor: '#10b981' },
                          { key: 'bank_transfer', icon: <BankOutlined />, label: 'Bank Transfer', activeColor: '#3b82f6' },
                        ].map(({ key, icon, label, activeColor }) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setDepositMethod(key)}
                            className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border-2 transition-all text-center cursor-pointer ${
                              depositMethod === key ? 'shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300'
                            }`}
                            style={depositMethod === key ? { borderColor: activeColor, backgroundColor: `${activeColor}10` } : {}}
                          >
                            <span className="text-sm" style={depositMethod === key ? { color: activeColor } : { color: '#94a3b8' }}>{icon}</span>
                            <span className={`text-xs font-semibold ${depositMethod === key ? 'text-slate-700' : 'text-slate-500'}`}>{label}</span>
                          </button>
                        ))}
                      </div>

                      {depositMethod === 'bank_transfer' && (
                        <>
                          <div className="mt-3">
                            <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-violet-700 mb-2">
                              Select Bank Account
                            </p>
                            <Select
                              placeholder="Choose account to transfer to…"
                              className="w-full"
                              size="large"
                              value={selectedBankAccountId}
                              onChange={setSelectedBankAccountId}
                              options={bankAccounts.map((acc) => ({
                                value: acc.id,
                                label: `${acc.bankName} (${acc.currency}) - ${acc.iban ? acc.iban.slice(-6) : ''}`
                              }))}
                            />
                          </div>
                          {selectedAccount && <BankDetailsCard account={selectedAccount} />}
                          {selectedAccount && (
                            <div className="mt-3 pt-2 border-t border-violet-200/50">
                              <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-violet-700 mb-2">
                                Upload Receipt
                              </p>
                              <Upload
                                onRemove={(file) => setFileList((prev) => prev.filter((item) => item.uid !== file.uid))}
                                beforeUpload={(file) => {
                                  const allowed = ['image/jpeg', 'image/png', 'application/pdf'];
                                  if (!allowed.includes(file.type)) {
                                    message.error('Only JPEG, PNG, or PDF files are accepted.');
                                    return Upload.LIST_IGNORE;
                                  }
                                  setFileList([file]);
                                  return false;
                                }}
                                fileList={fileList}
                                maxCount={1}
                                accept=".jpg,.jpeg,.png,.pdf"
                              >
                                <Button icon={<UploadOutlined />} className="w-full">
                                  Select Receipt (JPEG, PNG or PDF)
                                </Button>
                              </Upload>
                              <p className="text-[10px] mt-2 leading-tight text-violet-600/80">
                                {`Upload your deposit receipt for ${fmtDual(depositAmount)} — JPEG, PNG, or PDF accepted.`}
                              </p>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Staff assignment info */}
              {isStaff && selectedCustomerName && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-cyan-50 border border-cyan-200 text-sm text-cyan-700">
                  <UserOutlined /> Assigning to <strong>{selectedCustomerName}</strong>
                </div>
              )}

              {/* Purchase button */}
              <button
                onClick={executePurchase}
                disabled={isPending || ownedOfferingIds.has(offering.id) || walletIsInsufficient || (paymentMethod === 'deposit' && depositMethod === 'bank_transfer' && (!selectedBankAccountId || fileList.length === 0))}
                className="w-full py-3.5 rounded-xl font-duotone-bold text-sm sm:text-base tracking-wide transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                style={{
                  background: '#4b4f54',
                  color: '#00a8c4',
                  border: '1px solid rgba(0,168,196,0.5)',
                  boxShadow: '0 0 8px rgba(0,168,196,0.2)',
                }}
              >
                {isPending ? 'Processing...' : ownedOfferingIds.has(offering.id) ? 'Already Active' : paymentMethod === 'deposit' ? `Pay Deposit — ${fmtDual(depositAmount)}` : offering.category === 'storage' ? `Reserve Storage — ${dualPrice}` : `Purchase — ${dualPrice}`}
              </button>
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
          setPendingPurchaseId(null);
          message.success('Payment confirmed! Membership activated.');
          setPurchaseModal({ visible: false, offering: null });
          queryClient.invalidateQueries(['member-offerings']);
          queryClient.invalidateQueries(['my-member-purchases']);
        }}
        onClose={() => {
          setShowIyzicoModal(false);
          setIyzicoPaymentUrl(null);
          cancelPendingPurchase();
          message.info('Payment cancelled — no charge was made.');
        }}
        onError={(msg) => {
          setShowIyzicoModal(false);
          setIyzicoPaymentUrl(null);
          cancelPendingPurchase();
          message.error(msg || 'Payment failed');
        }}
      />
      {/* Centered Logo at Bottom */}
      <div className="w-full flex flex-col items-center" style={{ margin: '48px 0 24px 0' }}>
        <img
          src={dpsLogo}
          alt="Duotone Pro Center Urla Logo"
          style={{ width: '100%', maxWidth: '900px', height: 'auto', display: 'block', margin: '0 auto', padding: '8px 0', opacity: 0.15, filter: 'invert(1)' }}
        />
        <p className="-mt-1.5 text-slate-900/15 tracking-[0.25em] text-sm sm:text-base">
          <span className="font-duotone-bold uppercase">Powered by </span>
          <span className="font-gotham-bold inline-flex items-baseline" style={{ letterSpacing: '0.05em', fontSize: 'inherit' }}>
            UKC
            <UkcBrandDot className="!bg-emerald-400/15" style={{ top: '0.14em' }} />
          </span>
        </p>
      </div>
    </div>
  );
};

export default MemberOfferings;
