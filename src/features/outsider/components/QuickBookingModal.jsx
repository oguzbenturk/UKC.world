/**
 * QuickBookingModal
 *
 * Streamlined 3-step flow for purchasing a lesson package and optionally
 * booking the first session — all in one modal.
 *
 * Step 0 – REVIEW & PAY: package summary + payment method selection + buy
 * Step 1 – SCHEDULE: pick instructor → date → time (skippable)
 * Step 2 – DONE: confirmation with remaining sessions & quick links
 *
 * For standalone services (no package), just books a single lesson session.
 */

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import PropTypes from 'prop-types';
import dayjs from 'dayjs';
import {
  Alert,
  App,
  Button,
  DatePicker,
  Modal,
  Select,
  Spin,
  Tag,
  Upload,
  Tooltip,
} from 'antd';
import {
  CalendarOutlined,
  CheckCircleFilled,
  CheckOutlined,
  ClockCircleOutlined,
  CreditCardOutlined,
  RocketOutlined,
  ShoppingOutlined,
  TeamOutlined,
  UserOutlined,
  WalletOutlined,
  UploadOutlined,
  BankOutlined,
  CopyOutlined,
  InfoCircleOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/shared/hooks/useAuth';
import { useWalletSummary } from '@/shared/hooks/useWalletSummary';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import apiClient, { resolveApiBaseUrl, getAccessToken } from '@/shared/services/apiClient';
import { getAvailableSlots } from '@/features/bookings/components/api/calendarApi';
import { PAY_AT_CENTER_ALLOWED_ROLES } from '@/shared/utils/roleUtils';
import calendarConfig from '@/config/calendarConfig';
import IyzicoPaymentModal from '@/shared/components/IyzicoPaymentModal';
import PromoCodeInput from '@/shared/components/PromoCodeInput';
import PartnerStep from './PartnerStep';

const HALF_HOUR_MINUTES = 30;
const MIN_DURATION_MINUTES = 90;
const DEFAULT_DURATION_MINUTES = 120;
const DEFAULT_DURATION_OPTIONS = [90, 120, 150, 180];

// Resolve a package price in the user's preferred currency
const getPackagePriceInCurrency = (pkg, targetCurrency, convertCurrencyFn) => {
  if (!pkg) return { price: 0, currency: 'EUR' };

  if (targetCurrency && pkg.prices && Array.isArray(pkg.prices)) {
    const currencyPrice = pkg.prices.find(
      p => p.currencyCode === targetCurrency || p.currency_code === targetCurrency
    );
    if (currencyPrice && currencyPrice.price > 0) {
      return { price: currencyPrice.price, currency: targetCurrency };
    }
  }

  const baseCurrency = pkg.currency || 'EUR';
  const basePrice = pkg.price || 0;

  if (convertCurrencyFn && targetCurrency && targetCurrency !== baseCurrency) {
    const convertedPrice = convertCurrencyFn(basePrice, baseCurrency, targetCurrency);
    return { price: convertedPrice, currency: targetCurrency };
  }

  return { price: basePrice, currency: baseCurrency };
};

// Predefined lesson block start times — slots are only offered at these exact times
const PRESET_SLOT_STARTS = calendarConfig.preScheduledSlots.map((s) => s.start);

const formatDurationLabel = (minutes) => {
  if (!Number.isFinite(minutes)) return '';
  const totalHours = minutes / 60;
  if (totalHours >= 1) return `${totalHours % 1 === 0 ? totalHours : totalHours.toFixed(1)}h`;
  return `${minutes}m`;
};

const normalizeNumeric = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const timeStringToMinutes = (timeStr) => {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(':').map(Number);
  return Number.isFinite(h) ? h * 60 + (m || 0) : null;
};

const minutesToTimeString = (minutes) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const computeAvailableStarts = (slots, durationMinutes, isToday) => {
  if (!Array.isArray(slots) || slots.length === 0) return [];
  const stepsRequired = Math.max(1, Math.round(durationMinutes / HALF_HOUR_MINUTES));
  // Index slots by time for O(1) lookup
  const slotByTime = new Map(slots.map((s) => [s.time, s]));
  const nowMinutes = isToday ? dayjs().hour() * 60 + dayjs().minute() : null;
  const results = [];

  // Only offer the business-defined lesson blocks as start times
  for (const startTime of PRESET_SLOT_STARTS) {
    const startMinutes = timeStringToMinutes(startTime);
    if (startMinutes === null) continue;
    // Skip past slots on today
    if (nowMinutes !== null && startMinutes < nowMinutes + 30) continue;
    // Verify every 30-min sub-slot within the window is available
    let allAvailable = true;
    for (let step = 0; step < stepsRequired; step++) {
      const slotTime = minutesToTimeString(startMinutes + step * HALF_HOUR_MINUTES);
      const slot = slotByTime.get(slotTime);
      if (!slot || slot.status !== 'available') {
        allAvailable = false;
        break;
      }
    }
    if (allAvailable) {
      const endTime = minutesToTimeString(startMinutes + durationMinutes);
      results.push({ value: startTime, label: `${startTime} – ${endTime}` });
    }
  }
  return results;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function maskIban(iban) {
  if (!iban) return '';
  const clean = iban.replace(/\s/g, '');
  if (clean.length <= 8) return iban;
  return clean.slice(0, 4) + ' •••• •••• ' + clean.slice(-4);
}

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
    <div className="mt-3 rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-200">
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

/**
 * Get the best price for the given package in the user's currency.
 */
const resolvePkgPrice = (pkg, userCurrency, convertCurrency) => {
  if (!pkg) return { price: 0, currency: 'EUR' };
  if (userCurrency && Array.isArray(pkg.prices)) {
    const match = pkg.prices.find(
      (p) => p.currencyCode === userCurrency || p.currency_code === userCurrency
    );
    if (match && match.price > 0) return { price: match.price, currency: userCurrency };
  }
  const base = pkg.currency || 'EUR';
  const basePrice = pkg.price || 0;
  if (convertCurrency && userCurrency && userCurrency !== base) {
    return { price: convertCurrency(basePrice, base, userCurrency), currency: userCurrency };
  }
  return { price: basePrice, currency: base };
};

// ── Sub-components ───────────────────────────────────────────────────────────

// eslint-disable-next-line complexity
const PayStep = ({
  packageData, packageName, totalSessions, durationHours,
  displayPrice, priceCurrency, formatCurrency,
  paymentMethod, setPaymentMethod, depositMethod, setDepositMethod,
  walletBalance, walletCurrency, walletInsufficient,
  userCurrency, convertCurrency,
  purchasing, onPurchase, canPayLater,
  onCreateGroupLesson, onCreateGroupWithFriend,
  bankAccounts = [], selectedBankAccountId, setSelectedBankAccountId, selectedAccount,
  fileList = [], setFileList,
  isStandalone = false, servicePrice = 0, onProceedToSchedule, proRataTotalHours = null,
  appliedVoucher = null, onVoucherApplied, onVoucherRemoved, serviceId: payStepServiceId,
}) => {
  const isGroupPackage = packageData?.lessonCategoryTag?.toLowerCase() === 'group'
    || (packageData?.name || '').toLowerCase().includes('group')
    || (isStandalone && (packageName || '').toLowerCase().includes('group'));
  const isSemiPrivate = (packageData?.lessonCategoryTag || '').toLowerCase().includes('semi')
    || (packageName || '').toLowerCase().includes('semi');
  const DEPOSIT_PERCENT = 20;
  const packageProRataScale =
    !isStandalone && packageData && proRataTotalHours != null && proRataTotalHours !== ''
      ? (() => {
          const th = parseFloat(packageData.total_hours);
          const r = parseFloat(proRataTotalHours);
          if (!Number.isFinite(th) || th <= 0 || !Number.isFinite(r)) return 1;
          return r / th;
        })()
      : 1;
  const eurPrice = isStandalone
    ? (servicePrice || 0)
    : parseFloat(((packageData?.price || 0) * packageProRataScale).toFixed(2));
  const depositAmount = parseFloat((eurPrice * DEPOSIT_PERCENT / 100).toFixed(2));
  const remainingAmount = parseFloat((eurPrice - depositAmount).toFixed(2));

  const showLocalCurrency = userCurrency && userCurrency !== 'EUR' && priceCurrency !== 'EUR';
  const fmtDual = (eurAmt) => {
    const eurStr = formatCurrency(eurAmt, 'EUR');
    if (!showLocalCurrency || !convertCurrency) return eurStr;
    const local = convertCurrency(eurAmt, 'EUR', userCurrency);
    return `${eurStr} (~${formatCurrency(local, userCurrency)})`;
  };

  // Dual-price: show EUR first, then user's local currency equivalent
  const dualPrice = (() => {
    const eurFormatted = formatCurrency(eurPrice, 'EUR');
    if (!showLocalCurrency) return eurFormatted;
    return `${eurFormatted} (~${formatCurrency(displayPrice, priceCurrency)})`;
  })();

  const isDeposit = paymentMethod === 'deposit';
  const isBankOrDeposit = isDeposit;

  return (
  <div className="space-y-4 sm:space-y-5">
    {/* Package summary card */}
    <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white via-slate-50/50 to-blue-50/30 p-4 sm:p-5">
      <div className="absolute -top-10 -right-10 w-28 h-28 rounded-full bg-blue-500/[0.04]" />
      <div className="relative">
        <h3 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">{packageName}</h3>
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
          {packageData?.lessonCategoryTag && (
            <Tag color="blue" className="!text-[10px] sm:!text-xs !m-0 !leading-tight">{packageData.lessonCategoryTag}</Tag>
          )}
          {isStandalone && isSemiPrivate && (
            <Tag color="blue" className="!text-[10px] sm:!text-xs !m-0 !leading-tight">Semi-Private</Tag>
          )}
          {packageData?.levelTag && (
            <Tag className="!text-[10px] sm:!text-xs !m-0 !leading-tight">{packageData.levelTag}</Tag>
          )}
          <span className="text-[11px] sm:text-xs text-slate-400">
            <ClockCircleOutlined className="mr-1" />
            {durationHours}h · {totalSessions} session{totalSessions !== 1 ? 's' : ''}
          </span>
        </div>
        {packageData?.description && (
          <p className="text-xs sm:text-sm text-slate-500 mt-2 line-clamp-2">{packageData.description}</p>
        )}
        <div className="mt-3 pt-3 border-t border-slate-200/60 flex items-end justify-between">
          <span className="text-[10px] sm:text-xs text-slate-400 uppercase tracking-wider font-semibold">
            {isStandalone ? 'Lesson Price' : 'Package Total'}
          </span>
          <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight leading-none">
            {dualPrice}
          </span>
        </div>
      </div>
    </div>

    {isGroupPackage ? (
      <>
        {/* Group package — must go through group flow, no direct payment */}
        <Alert
          type="info"
          showIcon
          className="!rounded-xl"
          message="This is a group lesson package"
          description="Group lessons require at least 2 people. Choose how you'd like to proceed below."
        />

        <div className="rounded-xl border-2 border-blue-200 bg-blue-50/60 p-4 space-y-3">
          <Button
            type="primary"
            size="large"
            block
            className="!h-12 !rounded-xl !font-bold"
            icon={<TeamOutlined />}
            onClick={onCreateGroupWithFriend}
          >
            I have a friend — Create Group
          </Button>
          <Button
            size="large"
            block
            className="!h-12 !rounded-xl !font-bold !border-violet-300 !text-violet-600 hover:!bg-violet-50"
            onClick={onCreateGroupLesson}
          >
            I'm alone — Find me a partner
          </Button>
        </div>
      </>
    ) : (
      <>
        {/* Non-group (private) package — normal payment flow */}
        <div>
          <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
            Payment Method
          </p>
          <div className="grid gap-2 grid-cols-3">
            {[
              { key: 'wallet', icon: <WalletOutlined />, label: 'Wallet', activeColor: '#3b82f6', activeBg: '#eff6ff', sub: formatCurrency(convertCurrency ? convertCurrency(walletBalance, walletCurrency, userCurrency) : walletBalance, userCurrency) },
              { key: 'credit_card', icon: <CreditCardOutlined />, label: 'Card', activeColor: '#10b981', activeBg: '#ecfdf5', sub: 'Iyzico' },
              { key: 'deposit', icon: <SafetyCertificateOutlined />, label: `Deposit ${DEPOSIT_PERCENT}%`, activeColor: '#8b5cf6', activeBg: '#f5f3ff', sub: fmtDual(depositAmount) },
            ].map(({ key, icon, label, activeColor, activeBg, sub }) => (
              <button
                key={key}
                type="button"
                onClick={() => setPaymentMethod(key)}
                className={`relative flex flex-col items-center gap-1 sm:gap-1.5 p-3 sm:p-4 rounded-xl border-2 transition-all text-center cursor-pointer ${
                  paymentMethod === key ? 'shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                }`}
                style={paymentMethod === key ? { borderColor: activeColor, backgroundColor: activeBg } : {}}
              >
                {paymentMethod === key && (
                  <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full flex items-center justify-center" style={{ backgroundColor: activeColor }}>
                    <CheckOutlined className="text-white text-[8px]" />
                  </div>
                )}
                <span className={`text-lg sm:text-xl ${paymentMethod === key ? '' : 'text-slate-400'}`} style={paymentMethod === key ? { color: activeColor } : {}}>{icon}</span>
                <span className={`text-[11px] sm:text-xs font-semibold ${paymentMethod === key ? 'text-slate-700' : 'text-slate-600'}`}>{label}</span>
                <span className={`text-[10px] sm:text-xs ${paymentMethod === key ? '' : 'text-slate-400'}`} style={paymentMethod === key ? { color: activeColor } : {}}>{sub}</span>
              </button>
            ))}
          </div>

          {walletInsufficient && paymentMethod === 'wallet' && (
            <Alert
              type="warning"
              showIcon
              className="!mt-3 !rounded-xl !text-xs"
              message="Insufficient wallet balance"
              description="Switch to Credit Card or top up your wallet first."
            />
          )}

          {isDeposit && (
            <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50/50 p-3 sm:p-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="p-3 rounded-lg bg-violet-100/80 border border-violet-200">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-violet-800">Deposit Now</span>
                  <span className="text-sm font-bold text-violet-900">{fmtDual(depositAmount)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-violet-800">Pay on Arrival</span>
                  <span className="text-sm font-bold text-violet-900">{fmtDual(remainingAmount)}</span>
                </div>
                <p className="text-[10px] text-violet-600 mt-2 leading-tight">
                  Pay {DEPOSIT_PERCENT}% now to reserve your spot. The remaining {100 - DEPOSIT_PERCENT}% is due on arrival.
                </p>
              </div>

              <div className="border-t border-violet-200 pt-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-700 mb-2">Pay deposit via</p>
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
              </div>

              {depositMethod === 'bank_transfer' && (
                <>
                  <div>
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
                    <div className="pt-2 border-t border-violet-200/50">
                      <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-violet-700 mb-2">
                        Upload Receipt
                      </p>
                      <Upload
                        onRemove={(file) => setFileList((prev) => prev.filter((item) => item.uid !== file.uid))}
                        beforeUpload={(file) => {
                          const allowed = ['image/jpeg', 'image/png', 'application/pdf'];
                          if (!allowed.includes(file.type)) {
                            App.useApp().message.error('Only JPEG, PNG, or PDF files are accepted.');
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
          )}
        </div>

        {/* Promo Code */}
        <div>
          <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
            Promo Code
          </p>
          <PromoCodeInput
            context="lessons"
            amount={eurPrice}
            currency="EUR"
            serviceId={payStepServiceId}
            appliedVoucher={appliedVoucher}
            onValidCode={onVoucherApplied}
            onClear={onVoucherRemoved}
            disabled={purchasing}
            variant="light"
          />
        </div>

        <Button
          type="primary"
          size="large"
          block
          loading={purchasing}
          disabled={purchasing || (paymentMethod === 'wallet' && walletInsufficient) || (isDeposit && depositMethod === 'bank_transfer' && (!selectedBankAccountId || fileList.length === 0))}
          onClick={isStandalone ? onProceedToSchedule : onPurchase}
          className="!h-12 sm:!h-14 !rounded-xl !text-sm sm:!text-base !font-bold"
          icon={isStandalone ? <CalendarOutlined /> : <ShoppingOutlined />}
        >
          {isStandalone
            ? 'Continue — Schedule Session'
            : paymentMethod === 'wallet'
              ? `Pay ${dualPrice}`
              : paymentMethod === 'credit_card'
                ? `Pay ${dualPrice} with Card`
                : paymentMethod === 'deposit'
                  ? `Pay Deposit ${fmtDual(depositAmount)}`
                  : `Pay ${dualPrice}`}
        </Button>

        {/* Group Lesson Options */}
        <div className="rounded-xl border border-dashed border-blue-200 bg-blue-50/50 p-3 text-center">
          <p className="text-xs text-slate-500 mb-1">
            <TeamOutlined className="mr-1" />
            Prefer a group lesson?
          </p>
          <div className="flex items-center justify-center gap-1">
            <Button
              type="link"
              size="small"
              className="!text-xs !font-semibold !text-blue-600"
              onClick={onCreateGroupWithFriend}
            >
              I have a friend →
            </Button>
            <span className="text-xs text-slate-300">|</span>
            <Button
              type="link"
              size="small"
              className="!text-xs !font-semibold !text-violet-600"
              onClick={onCreateGroupLesson}
            >
              Find me a partner →
            </Button>
          </div>
        </div>
      </>
    )}
  </div>
  );
};

// Compute the set of 30-min sub-slot times occupied by a booking starting at `startTime` for `durationMinutes`
const getOccupiedSubSlots = (startTime, durationMinutes) => {
  const startMins = timeStringToMinutes(startTime);
  if (startMins === null) return [];
  const steps = Math.max(1, Math.round(durationMinutes / HALF_HOUR_MINUTES));
  const occupied = [];
  for (let i = 0; i < steps; i++) {
    occupied.push(minutesToTimeString(startMins + i * HALF_HOUR_MINUTES));
  }
  return occupied;
};

// Session date+time row with its own availability query
const SessionSlotRow = ({ instructorId, durationMinutes, date, time, onChange, onRemove, showRemove, excludedTimes = [] }) => {
  const dateString = date?.isValid() ? date.format('YYYY-MM-DD') : null;

  const { data: availabilityData, isLoading: slotsLoading } = useQuery({
    queryKey: ['quick-booking', 'slots', dateString, instructorId],
    queryFn: async () => {
      const filters = { instructorIds: [instructorId] };
      return getAvailableSlots(dateString, dateString, filters);
    },
    enabled: !!dateString && !!instructorId,
    staleTime: 60_000,
  });

  const availableStarts = useMemo(() => {
    if (!availabilityData?.length) return [];
    const dayData = availabilityData.find(d => d.date === dateString);
    if (!dayData?.slots) return [];
    const instructorSlots = dayData.slots.filter(s => s.instructorId === instructorId);
    const isToday = dayjs().format('YYYY-MM-DD') === dateString;
    const allStarts = computeAvailableStarts(instructorSlots, durationMinutes, isToday);
    if (excludedTimes.length === 0) return allStarts;
    // Filter out starts whose sub-slots overlap with already-selected sibling sessions
    const excludedSet = new Set(excludedTimes);
    const stepsRequired = Math.max(1, Math.round(durationMinutes / HALF_HOUR_MINUTES));
    return allStarts.filter(slot => {
      const startMins = timeStringToMinutes(slot.value);
      for (let i = 0; i < stepsRequired; i++) {
        if (excludedSet.has(minutesToTimeString(startMins + i * HALF_HOUR_MINUTES))) return false;
      }
      return true;
    });
  }, [availabilityData, dateString, instructorId, durationMinutes, excludedTimes]);

  return (
    <div className="flex items-start gap-2">
      <div className="flex-1 grid grid-cols-2 gap-2">
        <DatePicker
          className="w-full"
          size="large"
          value={date}
          onChange={(val) => onChange({ date: val, time: null })}
          disabledDate={(current) => current && current.isBefore(dayjs(), 'day')}
          format="ddd, MMM D"
          inputReadOnly
          placeholder="Pick date"
        />
        {dateString ? (
          slotsLoading ? (
            <div className="flex items-center justify-center h-10"><Spin size="small" /></div>
          ) : availableStarts.length === 0 ? (
            <Select placeholder="No slots" disabled className="w-full" size="large" />
          ) : (
            <Select
              placeholder="Pick time"
              className="w-full"
              size="large"
              value={time}
              onChange={(val) => onChange({ date, time: val })}
              options={availableStarts}
            />
          )
        ) : (
          <Select placeholder="Pick date first" disabled className="w-full" size="large" />
        )}
      </div>
      {showRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="mt-2 w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors text-lg font-medium"
        >
          ×
        </button>
      )}
    </div>
  );
};

const ScheduleStep = ({ isExistingPackage, isStandalone, existingPackageRemaining, durationOptions = [], selectedDurationMinutes, setSelectedDurationMinutes, instructorsData = [], instructorsLoading, selectedInstructorId, setSelectedInstructorId, sessions = [], maxSessions = Infinity, onSessionChange, onAddSession, onRemoveSession, bookingPending, onBookSession, onSkip, onResetSessions, partnerInfo, includePartner, onTogglePartner }) => (
  <div className="space-y-4 sm:space-y-5">
    {/* Status banner */}
    <div className={`rounded-2xl border p-3 sm:p-4 flex items-start sm:items-center gap-2.5 sm:gap-3 ${
      isStandalone
        ? 'bg-blue-50 border-blue-200'
        : isExistingPackage
          ? 'bg-blue-50 border-blue-200'
          : 'bg-green-50 border-green-200'
    }`}>
      <CheckCircleFilled className={`shrink-0 mt-0.5 sm:mt-0 ${
        isStandalone
          ? 'text-blue-500 text-lg sm:text-xl'
          : isExistingPackage ? 'text-blue-500 text-lg sm:text-xl' : 'text-green-500 text-lg sm:text-xl'
      }`} />
      <div className="min-w-0">
        <p className={`font-semibold text-xs sm:text-sm ${
          isStandalone
            ? 'text-blue-800'
            : isExistingPackage ? 'text-blue-800' : 'text-green-800'
        }`}>
          {isStandalone ? 'Book Your Lesson' : isExistingPackage ? 'You have an active package!' : 'Package purchased!'}
        </p>
        <p className={`text-[11px] sm:text-xs mt-0.5 leading-relaxed ${
          isStandalone
            ? 'text-blue-600'
            : isExistingPackage ? 'text-blue-600' : 'text-green-600'
        }`}>
          {isStandalone
            ? 'Pick your instructor, date, and time slot below.'
            : isExistingPackage
              ? `${existingPackageRemaining}h remaining — schedule a session below.`
              : 'Now schedule your first session, or skip and book later.'}
        </p>
      </div>
    </div>

    {/* Group partner section */}
    {partnerInfo && (
      <div
        className={`rounded-2xl border p-3 sm:p-4 flex items-center gap-3 cursor-pointer transition-all ${
          includePartner
            ? 'bg-purple-50 border-purple-200'
            : 'bg-slate-50 border-slate-200'
        }`}
        onClick={() => onTogglePartner?.(!includePartner)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && onTogglePartner?.(!includePartner)}
      >
        <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${
          includePartner
            ? 'bg-purple-500 border-purple-500'
            : 'border-slate-300 bg-white'
        }`}>
          {includePartner && <CheckOutlined className="text-white text-[10px]" />}
        </div>
        <TeamOutlined className={`text-lg shrink-0 ${includePartner ? 'text-purple-500' : 'text-slate-400'}`} />
        <div className="min-w-0 flex-1">
          <p className={`font-semibold text-xs sm:text-sm ${includePartner ? 'text-purple-800' : 'text-slate-600'}`}>
            {partnerInfo.partnerName}
          </p>
          <p className={`text-[11px] sm:text-xs mt-0.5 ${includePartner ? 'text-purple-600' : 'text-slate-400'}`}>
            {includePartner
              ? `Group partner • ${partnerInfo.partnerRemainingHours}h remaining in their package`
              : 'Tap to include your group partner'}
          </p>
        </div>
      </div>
    )}

    {/* Duration selector */}
    <div>
      <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
        <ClockCircleOutlined className="mr-1" /> Session Duration
      </p>
      <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
        {durationOptions.map((minutes) => (
          <button
            key={minutes}
            type="button"
            onClick={() => setSelectedDurationMinutes(minutes)}
            className={`relative px-2 py-2.5 sm:px-3 sm:py-2 border-2 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
              selectedDurationMinutes === minutes
                ? 'bg-blue-500 text-white border-blue-500 shadow-sm shadow-blue-500/20'
                : 'border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300'
            }`}
          >
            {formatDurationLabel(minutes)}
            {minutes === DEFAULT_DURATION_MINUTES && (
              <span className={`block text-[9px] font-medium mt-0.5 ${selectedDurationMinutes === minutes ? 'text-blue-100' : 'text-blue-400'}`}>Recommended</span>
            )}
          </button>
        ))}
      </div>
    </div>

    {/* Instructor */}
    <div>
      <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
        <UserOutlined className="mr-1" /> Instructor
      </p>
      {instructorsLoading ? (
        <div className="flex justify-center py-4"><Spin size="small" /></div>
      ) : (
        <Select
          placeholder="Choose your instructor"
          className="w-full"
          size="large"
          value={selectedInstructorId}
          onChange={(val) => {
            if (val === '__any__') {
              const randomIdx = Math.floor(Math.random() * instructorsData.length);
              setSelectedInstructorId(instructorsData[randomIdx].id);
            } else {
              setSelectedInstructorId(val);
            }
            onResetSessions();
          }}
          options={[
            { value: '__any__', label: '🎲 Any available instructor' },
            ...instructorsData.map((inst) => ({
              value: inst.id,
              label: `${inst.first_name || ''} ${inst.last_name || ''}`.trim() || inst.name || inst.email,
            })),
          ]}
        />
      )}
    </div>

    {/* Session date/time rows */}
    {selectedInstructorId && (
      <div>
        <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
          <CalendarOutlined className="mr-1" /> Date & Time
        </p>
        <div className="space-y-2">
          {sessions.map((session) => {
            // Collect sub-slots occupied by sibling sessions on the same date
            const dateStr = session.date?.isValid() ? session.date.format('YYYY-MM-DD') : null;
            const excludedTimes = dateStr
              ? sessions
                  .filter(s => s.id !== session.id && s.time && s.date?.isValid() && s.date.format('YYYY-MM-DD') === dateStr)
                  .flatMap(s => getOccupiedSubSlots(s.time, selectedDurationMinutes))
              : [];
            return (
              <SessionSlotRow
                key={session.id}
                instructorId={selectedInstructorId}
                durationMinutes={selectedDurationMinutes}
                date={session.date}
                time={session.time}
                onChange={(changes) => onSessionChange(session.id, changes)}
                onRemove={() => onRemoveSession(session.id)}
                showRemove={sessions.length > 1}
                excludedTimes={excludedTimes}
              />
            );
          })}
          {sessions.length < maxSessions && (
            <button
              type="button"
              onClick={onAddSession}
              className="w-full py-2 border-2 border-dashed border-slate-200 rounded-xl text-xs sm:text-sm font-medium text-slate-400 hover:text-blue-500 hover:border-blue-300 hover:bg-blue-50/30 transition-all"
            >
              + Add another day
            </button>
          )}
        </div>
      </div>
    )}

    {/* Action buttons */}
    <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 pt-1 sm:pt-2">
      {!isStandalone && (
        <Button size="large" block onClick={onSkip} className="!h-11 sm:!h-12 !rounded-xl !text-xs sm:!text-sm">
          Skip — Book Later
        </Button>
      )}
      <Button
        type="primary"
        size="large"
        block
        disabled={!selectedInstructorId || !sessions.some(s => s.date?.isValid() && s.time)}
        loading={bookingPending}
        onClick={onBookSession}
        className="!h-11 sm:!h-12 !rounded-xl !font-bold !text-xs sm:!text-sm"
        icon={<CalendarOutlined />}
      >
        {sessions.filter(s => s.date?.isValid() && s.time).length > 1
          ? `Book ${sessions.filter(s => s.date?.isValid() && s.time).length} Sessions`
          : 'Book Session'}
      </Button>
    </div>
  </div>
);

// eslint-disable-next-line complexity
const DoneStep = ({ packageName, paymentMethod, skipSchedule, purchasedPackage, durationHours, _perSessionHours, isExistingPackage, isStandalone, displayPrice, formatCurrency, priceCurrency, eurPrice, userCurrency, instructorName, onClose, sessions = [], groupPartnerMode = false, includePartner = false, partnerData = null }) => {
  const remaining = purchasedPackage?.remainingHours ?? (durationHours || 0);
  const usedBooking = !skipSchedule;
  const bookedCount = sessions.filter(s => s.date?.isValid() && s.time).length;
  const isPartnerInvite = groupPartnerMode && includePartner && partnerData;
  const partnerName = partnerData?.partnerName || 'your partner';

  return (
    <div className="text-center space-y-4 sm:space-y-5 py-2 sm:py-4">
      {/* Success icon with pulse ring */}
      <div className="mx-auto w-16 h-16 sm:w-20 sm:h-20 relative">
        <div className={`absolute inset-0 rounded-full ${isPartnerInvite ? 'bg-blue-200/50' : 'bg-green-200/50'} animate-pulse`} />
        <div className={`relative w-full h-full rounded-full bg-gradient-to-br ${isPartnerInvite ? 'from-blue-100 to-indigo-50 border-blue-200 shadow-blue-500/10' : 'from-green-100 to-emerald-50 border-green-200 shadow-green-500/10'} flex items-center justify-center border-2 shadow-sm`}>
          <CheckCircleFilled className={`${isPartnerInvite ? 'text-blue-500' : 'text-green-500'} text-2xl sm:text-4xl`} />
        </div>
      </div>

      <div className="px-2">
        <h3 className="text-lg sm:text-xl font-bold text-slate-900 mb-1">
          {isPartnerInvite ? 'Invite Sent!' : 'All Done!'}
        </h3>
        <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
          {isPartnerInvite
            ? `A confirmation request has been sent to ${partnerName}. The lesson will be confirmed once they accept.`
            : isStandalone
              ? (bookedCount > 1 ? `${bookedCount} lesson sessions booked! Check your dashboard for details.` : 'Your lesson session has been booked! Check your dashboard for details.')
              : usedBooking
                ? (isExistingPackage
                  ? (bookedCount > 1 ? `${bookedCount} sessions booked from your existing package.` : 'Your session is booked from your existing package.')
                  : (bookedCount > 1 ? `Package purchased & ${bookedCount} sessions booked.` : 'Package purchased & your first session is booked.'))
                : (isExistingPackage
                  ? 'No session booked — schedule anytime from your dashboard.'
                  : 'Package purchased — book sessions anytime from your dashboard.')}
        </p>
      </div>

      {isPartnerInvite && (
        <div className="bg-blue-50 rounded-2xl border border-blue-200/80 p-3 sm:p-4 text-left space-y-2">
          <div className="flex justify-between items-center text-xs sm:text-sm">
            <span className="text-slate-500">Partner</span>
            <span className="font-semibold text-slate-800">{partnerName}</span>
          </div>
          <div className="flex justify-between items-center text-xs sm:text-sm">
            <span className="text-slate-500">Status</span>
            <Tag color="orange" className="!m-0 !text-[10px] sm:!text-xs">Awaiting acceptance</Tag>
          </div>
          {bookedCount > 0 && (
            <div className="text-xs sm:text-sm">
              <span className="text-slate-500">Session{bookedCount > 1 ? 's' : ''} ({bookedCount})</span>
              <div className="mt-1.5 space-y-1">
                {sessions.filter(s => s.date?.isValid() && s.time).map((session, idx) => (
                  <div key={idx} className="flex justify-between items-center">
                    <span className="text-slate-400">#{idx + 1}</span>
                    <span className="font-semibold text-slate-800">
                      {session.date.format('ddd, MMM D')} at {session.time}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!isPartnerInvite && (
      <div className="bg-slate-50 rounded-2xl border border-slate-200/80 p-3 sm:p-4 text-left space-y-2.5">
        <div className="flex justify-between items-center text-xs sm:text-sm">
          <span className="text-slate-500">{isStandalone ? 'Lesson' : 'Package'}</span>
          <span className="font-semibold text-slate-800 text-right max-w-[60%] truncate">{packageName}</span>
        </div>
        {instructorName && (
          <div className="flex justify-between items-center text-xs sm:text-sm">
            <span className="text-slate-500">Instructor</span>
            <span className="font-semibold text-slate-800 text-right max-w-[60%] truncate">{instructorName}</span>
          </div>
        )}
        {isStandalone && displayPrice > 0 && (
          <div className="flex justify-between items-center text-xs sm:text-sm">
            <span className="text-slate-500">Price</span>
            <span className="font-semibold text-slate-800">{(() => { const ef = formatCurrency(eurPrice || displayPrice, 'EUR'); if (!userCurrency || userCurrency === 'EUR' || priceCurrency === 'EUR') return ef; return `${ef} (~${formatCurrency(displayPrice, priceCurrency)})`; })()}</span>
          </div>
        )}
        {!isExistingPackage && !isStandalone && (
          <div className="flex justify-between items-center text-xs sm:text-sm">
            <span className="text-slate-500">Payment</span>
            <Tag color={paymentMethod === 'wallet' ? 'green' : 'orange'} className="!m-0 !text-[10px] sm:!text-xs">
              {paymentMethod === 'wallet' ? 'Paid' : paymentMethod === 'bank_transfer' ? 'Bank Transfer' : 'Processing'}
            </Tag>
          </div>
        )}
        {isExistingPackage && (
          <div className="flex justify-between items-center text-xs sm:text-sm">
            <span className="text-slate-500">Source</span>
            <Tag color="blue" className="!m-0 !text-[10px] sm:!text-xs">Existing Package</Tag>
          </div>
        )}
        {usedBooking && bookedCount > 0 && (
          <div className="text-xs sm:text-sm">
            <span className="text-slate-500">Sessions ({bookedCount})</span>
            <div className="mt-1.5 space-y-1">
              {sessions.filter(s => s.date?.isValid() && s.time).map((session, idx) => (
                <div key={idx} className="flex justify-between items-center">
                  <span className="text-slate-400">#{idx + 1}</span>
                  <span className="font-semibold text-slate-800">
                    {session.date.format('ddd, MMM D')} at {session.time}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        {!isStandalone && remaining > 0 && (
          <div className="flex justify-between items-center text-xs sm:text-sm">
            <span className="text-slate-500">Remaining</span>
            <span className="font-semibold text-emerald-600">
              {remaining}h left
            </span>
          </div>
        )}
      </div>
      )}

      <Button
        type="primary"
        size="large"
        block
        onClick={onClose}
        className="!h-11 sm:!h-12 !rounded-xl !font-bold !text-sm"
      >
        Done
      </Button>
    </div>
  );
};

// ── Main Component ───────────────────────────────────────────────────────────

// eslint-disable-next-line complexity
const QuickBookingModal = ({ open, onClose, packageData, serviceId, durationHours, servicePrice, serviceName, proRataTotalHours = null, initialOwnedPackage = null }) => {
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, refreshToken } = useAuth();
  const { formatCurrency, userCurrency, convertCurrency } = useCurrency();

  // ── Local state ──────────────────────────────────────────────────────────
  const [step, setStep] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('wallet');
  const [depositMethod, setDepositMethod] = useState('credit_card');
  const [purchasing, setPurchasing] = useState(false);
  const [purchasedPackage, setPurchasedPackage] = useState(null);
  const [isExistingPackage, setIsExistingPackage] = useState(false);
  const [iyzicoPaymentUrl, setIyzicoPaymentUrl] = useState(null);
  const [showIyzicoModal, setShowIyzicoModal] = useState(false);
  const [pendingCustomerPackageId, setPendingCustomerPackageId] = useState(null);
  const iyzicoConfirmedRef = useRef(false);
  const pendingCardPackageRef = useRef(null);
  const [selectedBankAccountId, setSelectedBankAccountId] = useState(null);
  const [fileList, setFileList] = useState([]);
  const [appliedVoucher, setAppliedVoucher] = useState(null);

  const [selectedInstructorId, setSelectedInstructorId] = useState(null);
  const [skipSchedule, setSkipSchedule] = useState(false);
  const [selectedDurationMinutes, setSelectedDurationMinutes] = useState(DEFAULT_DURATION_MINUTES);

  // Multi-session: each entry has { id, date, time }
  const [sessions, setSessions] = useState([{ id: 1, date: null, time: null }]);
  const sessionIdRef = useRef(1);
  const [bookingInProgress, setBookingInProgress] = useState(false);
  const [groupPartnerMode, setGroupPartnerMode] = useState(false);
  const [includePartner, setIncludePartner] = useState(true);

  const studentId = user?.userId || user?.id;

  // Standalone service mode (no package to purchase)
  const isStandalone = !packageData && !!serviceId;

  // Determine if user can use pay_later based on role
  const canPayLater = PAY_AT_CENTER_ALLOWED_ROLES.includes(user?.role);

  // Per-session default: total package hours / sessions count
  const sessionsCount = packageData?.sessionsCount || 1;
  const defaultPerSessionMinutes = sessionsCount > 0
    ? Math.round(((durationHours || 1) / sessionsCount) * 60)
    : 60;

  // The actual duration used for availability + booking
  const activeDurationMinutes = selectedDurationMinutes || defaultPerSessionMinutes;
  const activeDurationHours = activeDurationMinutes / 60;

  // ── Fetch user's existing customer packages ───────────────────────────────
  const { data: ownedPackages = [] } = useQuery({
    queryKey: ['quick-booking', 'owned-packages', studentId],
    queryFn: async () => {
      const res = await apiClient.get(`/services/customer-packages/${studentId}`);
      return Array.isArray(res.data) ? res.data : [];
    },
    enabled: open && !!studentId,
    staleTime: 15_000,
  });

  // Find a matching active customer package by service_package_id
  const matchingOwnedPackage = useMemo(() => {
    if (!packageData?.id || !ownedPackages.length) return null;
    return ownedPackages.find((cp) => {
      const isActive = (cp.status || '').toLowerCase() === 'active';
      const hasHours = (parseFloat(cp.remainingHours ?? cp.remaining_hours) || 0) > 0;
      const matchesPackage =
        String(cp.servicePackageId || cp.service_package_id) === String(packageData.id);
      return isActive && hasHours && matchesPackage;
    }) || null;
  }, [packageData?.id, ownedPackages]);

  // Tracks whether package-ownership detection has already run for this modal open
  const hasDetectedRef = useRef(false);

  // Reset all state when modal opens
  useEffect(() => {
    if (open) {
      setPaymentMethod('wallet');
      setPurchasing(false);
      setSelectedInstructorId(null);
      setSkipSchedule(false);
      setSelectedDurationMinutes(DEFAULT_DURATION_MINUTES);
      setIyzicoPaymentUrl(null);
      setShowIyzicoModal(false);
      setPendingCustomerPackageId(null);
      setSelectedBankAccountId(null);
      setAppliedVoucher(null);
      preferredAppliedRef.current = false;
      setSessions([{ id: 1, date: null, time: null }]);
      sessionIdRef.current = 1;
      setBookingInProgress(false);
      setIncludePartner(true);
      // Auto-enter partner mode for group and semi-private packages (and standalone semi-private services)
      const tag = packageData?.lessonCategoryTag?.toLowerCase() || '';
      const name = (packageData?.name || serviceName || '').toLowerCase();
      const isGroup = tag === 'group' || tag === 'semi-private'
        || name.includes('group') || name.includes('semi-private') || name.includes('semi private');
      setGroupPartnerMode(isGroup);

      if (initialOwnedPackage) {
        // Student already owns this package — skip payment step immediately (no loading delay)
        setPurchasedPackage(initialOwnedPackage);
        setIsExistingPackage(true);
        hasDetectedRef.current = true;
        setStep(isGroup ? 0 : 1);
      } else {
        // No known owned package yet — start at payment step; async detection effect may update
        setStep(0);
        setPurchasedPackage(null);
        setIsExistingPackage(false);
      }
    }
  }, [open]);

  // Once owned packages are loaded, check for an existing matching package
  // For standalone services, skip step 0 (no package to buy)
  useEffect(() => {
    if (!open) {
      hasDetectedRef.current = false;
      return;
    }
    // Only run detection once per open
    if (hasDetectedRef.current) return;
    // For standalone, stay at step 0 to show payment selection (same flow as packages)
    if (isStandalone) {
      hasDetectedRef.current = true;
      return;
    }
    // Wait for ownedPackages to be fetched (non-empty or query settled)
    if (matchingOwnedPackage) {
      hasDetectedRef.current = true;
      setPurchasedPackage(matchingOwnedPackage);
      setIsExistingPackage(true);
      // For group packages, stay at step 0 to show partner overview
      // For non-group packages, skip to schedule
      const isGroup = packageData?.lessonCategoryTag?.toLowerCase() === 'group'
        || (packageData?.name || '').toLowerCase().includes('group');
      if (!isGroup) {
        setStep(1);
      }
    }
  }, [open, matchingOwnedPackage, isStandalone]);

  // ── Fetch group partner info for existing group packages ──────────────
  const { data: partnerData } = useQuery({
    queryKey: ['group-booking-partner', matchingOwnedPackage?.id],
    queryFn: async () => {
      const res = await apiClient.get(`/group-bookings/partner-for-package/${matchingOwnedPackage.id}`);
      return res.data?.partner || null;
    },
    enabled: !!matchingOwnedPackage?.id && groupPartnerMode,
    staleTime: 60_000,
    retry: false,
  });

  // ── Booking defaults (for allowed durations) ─────────────────────────────
  const { data: bookingDefaults } = useQuery({
    queryKey: ['quick-booking', 'booking-defaults'],
    queryFn: async () => {
      try {
        const response = await apiClient.get('/settings');
        return response.data?.booking_defaults ?? null;
      } catch { return null; }
    },
    enabled: open,
    staleTime: 300_000,
    retry: false,
  });

  // ── Fetch Bank Accounts for Bank Transfer ────────────────────────────────
  const { data: bankAccountsResponse = [] } = useQuery({
    queryKey: ['quick-booking', 'bank-accounts'],
    queryFn: async () => {
      const res = await apiClient.get('/wallet/bank-accounts');
      return res.data?.results || [];
    },
    enabled: open && step === 0,
    staleTime: 300_000,
  });

  const selectedAccount = useMemo(() => bankAccountsResponse.find(a => a.id === selectedBankAccountId), [bankAccountsResponse, selectedBankAccountId]);

  // Utility to upload the dekont independently before saving booking
  const uploadReceipt = async (file) => {
    return new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append('image', file);
      const token = getAccessToken() || localStorage.getItem('token');
      const base = resolveApiBaseUrl();
      const xhr = new XMLHttpRequest();
      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          resolve(JSON.parse(xhr.responseText).url);
        } else {
          reject(new Error(JSON.parse(xhr.responseText || '{}').error || 'Upload failed'));
        }
      });
      xhr.addEventListener('error', () => reject(new Error('Upload failed')));
      xhr.open('POST', `${base}/api/upload/wallet-deposit`);
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.send(formData);
    });
  };

  // ── Duration options ─────────────────────────────────────────────────────
  const remainingHours = purchasedPackage?.remainingHours ?? (durationHours || 0);
  const remainingMinutes = remainingHours * 60;

  const durationOptions = useMemo(() => {
    const candidateSet = new Set();
    if (Array.isArray(bookingDefaults?.allowedDurations)) {
      bookingDefaults.allowedDurations.forEach((v) => {
        const n = Number(v);
        if (Number.isFinite(n) && n > 0) {
          candidateSet.add(Math.max(HALF_HOUR_MINUTES, Math.round(n / HALF_HOUR_MINUTES) * HALF_HOUR_MINUTES));
        }
      });
    }
    if (defaultPerSessionMinutes > 0) candidateSet.add(defaultPerSessionMinutes);
    if (candidateSet.size === 0) DEFAULT_DURATION_OPTIONS.forEach((d) => candidateSet.add(d));
    // Cap at remaining package hours
    const maxMinutes = remainingMinutes > 0 ? remainingMinutes : Infinity;
    return Array.from(candidateSet)
      .filter((m) => Number.isFinite(m) && m >= MIN_DURATION_MINUTES && m <= maxMinutes)
      .sort((a, b) => a - b);
  }, [bookingDefaults, defaultPerSessionMinutes, remainingMinutes]);

  // Pre-select default duration once options are available
  useEffect(() => {
    if (step === 1 && durationOptions.length > 0 && !selectedDurationMinutes) {
      const preferred = durationOptions.includes(DEFAULT_DURATION_MINUTES)
        ? DEFAULT_DURATION_MINUTES
        : durationOptions[0];
      setSelectedDurationMinutes(preferred);
    }
  }, [step, durationOptions, selectedDurationMinutes]);

  const { data: walletSummary } = useWalletSummary({
    currency: userCurrency,
    enabled: open && !!studentId,
  });
  // Aggregate ALL wallet currency rows (EUR + TRY etc.) into a single display amount
  const walletBalance = useMemo(() => {
    const allBalances = walletSummary?.balances;
    if (Array.isArray(allBalances) && allBalances.length > 0) {
      return allBalances.reduce((sum, row) => {
        const amt = Number(row.available) || 0;
        if (amt === 0) return sum;
        if (row.currency === userCurrency || !convertCurrency) return sum + amt;
        return sum + convertCurrency(amt, row.currency, userCurrency);
      }, 0);
    }
    return normalizeNumeric(walletSummary?.available, 0);
  }, [walletSummary, convertCurrency, userCurrency]);
  const walletCurrency = userCurrency || 'EUR';

  const { price: displayPrice, currency: priceCurrency } = useMemo(
    () => {
      if (isStandalone && servicePrice > 0) {
        const converted = convertCurrency ? convertCurrency(servicePrice, 'EUR', userCurrency) : servicePrice;
        return { price: converted, currency: userCurrency || 'EUR' };
      }
      const resolved = resolvePkgPrice(packageData, userCurrency, convertCurrency);
      if (
        proRataTotalHours != null &&
        proRataTotalHours !== '' &&
        packageData &&
        Number.isFinite(parseFloat(proRataTotalHours)) &&
        Number.isFinite(parseFloat(packageData.total_hours)) &&
        parseFloat(packageData.total_hours) > 0
      ) {
        const scale = parseFloat(proRataTotalHours) / parseFloat(packageData.total_hours);
        return {
          price: parseFloat((resolved.price * scale).toFixed(2)),
          currency: resolved.currency,
        };
      }
      return resolved;
    },
    [packageData, userCurrency, convertCurrency, isStandalone, servicePrice, proRataTotalHours]
  );
  const walletInsufficient = paymentMethod === 'wallet' && displayPrice > walletBalance;

  const { data: instructorsData = [], isLoading: instructorsLoading } = useQuery({
    queryKey: ['quick-booking', 'instructors'],
    queryFn: () => apiClient.get('/instructors').then((r) => r.data.filter(i => !i.is_freelance)),
    enabled: open && step === 1,
    staleTime: 300_000,
  });

  // Fetch student's preferred (most recent) instructor
  const { data: preferredData } = useQuery({
    queryKey: ['quick-booking', 'preferred-instructor'],
    queryFn: () => apiClient.get('/bookings/preferred-instructor').then((r) => r.data),
    enabled: open && step === 1 && !!studentId,
    staleTime: 300_000,
  });

  // Auto-select preferred instructor once data is available
  const preferredAppliedRef = useRef(false);
  useEffect(() => {
    if (preferredAppliedRef.current || !instructorsData.length || selectedInstructorId) return;
    const prefId = preferredData?.instructorId;
    if (prefId && instructorsData.some(i => i.id === prefId)) {
      setSelectedInstructorId(prefId);
      preferredAppliedRef.current = true;
    }
  }, [instructorsData, preferredData, selectedInstructorId]);

  // Polling fallback: check every 3s if the pending package became active
  // (catches cases where the socket event was missed due to disconnect/reconnect)
  const handleIyzicoSuccess = useCallback(async () => {
    if (iyzicoConfirmedRef.current) return;
    iyzicoConfirmedRef.current = true;
    setShowIyzicoModal(false);
    setIyzicoPaymentUrl(null);
    setPendingCustomerPackageId(null);
    if (pendingCardPackageRef.current) {
      setPurchasedPackage(pendingCardPackageRef.current);
      setIsExistingPackage(false);
      pendingCardPackageRef.current = null;
    }
    // Refresh JWT so the new role (student) is reflected in the session
    try { await refreshToken(); } catch { /* non-blocking */ }
    queryClient.invalidateQueries({ queryKey: ['wallet'] });
    queryClient.invalidateQueries({ queryKey: ['student-booking'] });
    queryClient.invalidateQueries({ queryKey: ['student-dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['quick-booking', 'owned-packages'] });
    queryClient.invalidateQueries({ queryKey: ['customer-packages'] });
    message.success('Payment confirmed! Package purchased.');
    setStep(1);
  }, [queryClient, refreshToken]);

  const { data: iyzicoPolledStatus } = useQuery({
    queryKey: ['iyzico-pkg-status', pendingCustomerPackageId],
    queryFn: () =>
      apiClient
        .get(`/services/customer-packages/${pendingCustomerPackageId}/payment-status`)
        .then((r) => r.data?.status),
    enabled: !!showIyzicoModal && !!pendingCustomerPackageId,
    refetchInterval: 3000,
    staleTime: 0,
  });

  useEffect(() => {
    if (iyzicoPolledStatus === 'active' && showIyzicoModal) {
      handleIyzicoSuccess();
    }
  }, [iyzicoPolledStatus, showIyzicoModal, handleIyzicoSuccess]);

  const purchaseMutation = useMutation({
    mutationFn: (payload) => apiClient.post('/services/packages/purchase', payload),
    onSuccess: async (res) => {
      // For credit card payments, show the Iyzico payment modal
      if (res.data?.paymentPageUrl) {
        iyzicoConfirmedRef.current = false;
        pendingCardPackageRef.current = res.data.customerPackage || null;
        setIyzicoPaymentUrl(res.data.paymentPageUrl);
        setPendingCustomerPackageId(res.data.customerPackage?.id || null);
        setShowIyzicoModal(true);
        setPurchasing(false);
        return;
      }

      setPurchasedPackage(res.data.customerPackage);
      setIsExistingPackage(false);
      if (res.data.roleUpgrade?.upgraded) {
        try { await refreshToken(); } catch { /* ignore */ }
      }
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      queryClient.invalidateQueries({ queryKey: ['student-booking'] });
      queryClient.invalidateQueries({ queryKey: ['student-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['quick-booking', 'owned-packages'] });
      message.success('Package purchased!');
      setStep(1);
    },
    onError: (err) => {
      message.error(err.response?.data?.error || err.message || 'Purchase failed');
    },
    onSettled: () => setPurchasing(false),
  });

  const handlePurchase = useCallback(() => {
    if (!packageData?.id || !studentId) return;
    const pkgPrice = displayPrice;
    const pkgCurrency = priceCurrency;
    const isDeposit = paymentMethod === 'deposit';
    const isBankLike = isDeposit && depositMethod === 'bank_transfer';
    const depositPct = 20;
    const depositAmt = isDeposit ? parseFloat((pkgPrice * depositPct / 100).toFixed(2)) : 0;
    const remainAmt = isDeposit ? parseFloat((pkgPrice - depositAmt).toFixed(2)) : 0;

    const paymentLabel = paymentMethod === 'wallet' ? 'Wallet'
      : paymentMethod === 'credit_card' ? 'Credit Card'
      : isDeposit ? `Deposit ${depositPct}% (${depositMethod === 'credit_card' ? 'Card' : 'Bank Transfer'})`
      : paymentMethod;

    const fmtDualConfirm = (eurAmt) => {
      const eurStr = formatCurrency(eurAmt, 'EUR');
      if (!userCurrency || userCurrency === 'EUR' || !convertCurrency) return eurStr;
      const local = convertCurrency(eurAmt, 'EUR', userCurrency);
      return `${eurStr} (~${formatCurrency(local, userCurrency)})`;
    };

    modal.confirm({
      title: isDeposit ? 'Confirm Deposit Payment' : 'Confirm Purchase',
      icon: <ShoppingOutlined style={{ color: '#1890ff' }} />,
      content: (
        <div style={{ marginTop: 8 }}>
          <p><strong>{packageData.name || serviceName || 'Package'}</strong></p>
          {isDeposit ? (
            <>
              <p style={{ fontSize: 14, color: '#666', margin: '4px 0' }}>Package Total: {fmtDualConfirm(pkgPrice)}</p>
              <p style={{ fontSize: 18, fontWeight: 700, margin: '8px 0', color: '#7c3aed' }}>Deposit Now: {fmtDualConfirm(depositAmt)}</p>
              <p style={{ fontSize: 13, color: '#888' }}>Remaining {fmtDualConfirm(remainAmt)} due on arrival</p>
            </>
          ) : (
            <p style={{ fontSize: 18, fontWeight: 700, margin: '8px 0' }}>{formatCurrency(pkgPrice, pkgCurrency)}</p>
          )}
          <p style={{ color: '#888' }}>Payment: {paymentLabel}</p>
        </div>
      ),
      okText: isDeposit ? 'Confirm Deposit' : 'Confirm & Pay',
      cancelText: 'Go Back',
      centered: true,
      onOk: async () => {
        setPurchasing(true);
        let receiptUrl = null;
        if (isBankLike) {
          if (fileList.length === 0) {
            message.error('Please upload a proof of payment (receipt/dekont)');
            setPurchasing(false);
            return;
          }
          try {
            receiptUrl = await uploadReceipt(fileList[0]);
          } catch (e) {
            message.error(e.message || 'Error uploading receipt');
            setPurchasing(false);
            return;
          }
        }

        purchaseMutation.mutate({
          packageId: packageData.id,
          paymentMethod: isDeposit ? depositMethod : paymentMethod,
          ...(isBankLike ? { bankAccountId: selectedBankAccountId, receiptUrl } : {}),
          ...(isDeposit ? { depositPercent: depositPct, depositAmount: depositAmt } : {}),
          ...(proRataTotalHours != null && proRataTotalHours !== ''
            ? { proRataTotalHours: parseFloat(proRataTotalHours) }
            : {}),
          ...(appliedVoucher?.id ? { voucherId: appliedVoucher.id } : {}),
        });
      },
    });
  }, [packageData, studentId, paymentMethod, depositMethod, purchaseMutation, userCurrency, convertCurrency, formatCurrency, serviceName, modal, selectedBankAccountId, fileList, displayPrice, priceCurrency, proRataTotalHours]);

  const executeBookSessions = useCallback(async () => {
    const validSessions = sessions.filter(s => s.date?.isValid() && s.time);
    if (!studentId || !selectedInstructorId || validSessions.length === 0) return;

    const isBankLike = paymentMethod === 'deposit' && depositMethod === 'bank_transfer';
    let receiptUrl = null;
    if (isStandalone && isBankLike) {
      if (fileList.length === 0) {
        message.error('Please upload a proof of payment (receipt/dekont)');
        setBookingInProgress(false);
        return;
      }
      try {
        receiptUrl = await uploadReceipt(fileList[0]);
      } catch (e) {
        message.error(e.message || 'Error uploading receipt');
        setBookingInProgress(false);
        return;
      }
    }

    setBookingInProgress(true);
    let successCount = 0;

    for (const session of validSessions) {
      const dateStr = session.date.format('YYYY-MM-DD');
      const [h, m] = session.time.split(':').map(Number);
      const startHour = h + (m || 0) / 60;

      try {
        const payload = isStandalone
          ? {
              student_user_id: studentId, instructor_user_id: selectedInstructorId,
              service_id: serviceId || null, date: dateStr,
              start_hour: startHour, duration: activeDurationHours,
              status: 'pending', notes: `Booked via academy: ${serviceName || 'Lesson'}`,
              use_package: false,
              amount: servicePrice || 0, final_amount: servicePrice || 0, base_amount: servicePrice || 0,
              discount_percent: 0, discount_amount: 0,
              payment_method: paymentMethod === 'deposit' ? depositMethod : paymentMethod,
              ...(isBankLike ? { bank_account_id: selectedBankAccountId, receiptUrl } : {}),
              ...(paymentMethod === 'deposit' ? { deposit_percent: 20 } : {})
            }
          : {
              student_user_id: studentId, instructor_user_id: selectedInstructorId,
              service_id: serviceId || null, date: dateStr,
              start_hour: startHour, duration: activeDurationHours,
              status: includePartner && partnerData ? 'pending_partner' : 'pending',
              notes: `Booked via package: ${packageData?.name || 'Quick Booking'}`,
              use_package: true,
              customer_package_id: purchasedPackage?.id || null,
              selected_package_id: purchasedPackage?.id || null,
              amount: 0, final_amount: 0, base_amount: 0,
              package_hours_applied: activeDurationHours,
              package_chargeable_hours: activeDurationHours,
              discount_percent: 0, discount_amount: 0, payment_method: 'wallet',
              ...(includePartner && partnerData ? {
                partner_user_id: partnerData.partnerId,
                partner_customer_package_id: partnerData.partnerCustomerPackageId,
              } : {}),
            };

        await apiClient.post('/bookings', payload);
        successCount++;
      } catch (err) {
        message.error(`Failed to book ${dateStr} at ${session.time}: ${err.response?.data?.error || err.message}`);
      }
    }

    if (successCount > 0) {
      queryClient.invalidateQueries({ queryKey: ['student-booking'] });
      queryClient.invalidateQueries({ queryKey: ['student-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      queryClient.invalidateQueries({ queryKey: ['quick-booking', 'owned-packages'] });
      queryClient.invalidateQueries({ queryKey: ['customer-packages'] });
      queryClient.invalidateQueries({ queryKey: ['quick-booking', 'slots'] });
      queryClient.invalidateQueries({ queryKey: ['group-booking-partner'] });

      if (!isStandalone) {
        const totalHoursUsed = activeDurationHours * successCount;
        setPurchasedPackage(prev => {
          if (!prev) return prev;
          const currentRemaining = parseFloat(prev.remainingHours ?? prev.remaining_hours) || 0;
          return { ...prev, remainingHours: Math.max(0, currentRemaining - totalHoursUsed), remaining_hours: Math.max(0, currentRemaining - totalHoursUsed) };
        });
      }

      message.success(
        includePartner && partnerData
          ? `Invite sent! ${partnerData.partnerName || 'Your partner'} will be notified to accept.`
          : `${successCount} session${successCount > 1 ? 's' : ''} booked!`
      );
      setStep(2);
    }

    setBookingInProgress(false);
  }, [sessions, studentId, selectedInstructorId, serviceId, activeDurationHours, packageData, purchasedPackage, isStandalone, servicePrice, serviceName, paymentMethod, depositMethod, queryClient, message, includePartner, partnerData]);

  const handleBookSessions = useCallback(() => {
    const validSessions = sessions.filter(s => s.date?.isValid() && s.time);
    if (!studentId || !selectedInstructorId || validSessions.length === 0) return;
    const selectedInstr = (instructorsData || []).find(i => i.id === selectedInstructorId);
    const instructorName = selectedInstr?.name || `${selectedInstr?.first_name || ''} ${selectedInstr?.last_name || ''}`.trim() || 'Selected instructor';
    modal.confirm({
      title: 'Confirm Booking',
      icon: <CalendarOutlined style={{ color: '#1890ff' }} />,
      content: (
        <div style={{ marginTop: 8 }}>
          <p><strong>{serviceName || packageData?.name || 'Lesson'}</strong></p>
          <p style={{ color: '#555' }}>Instructor: {instructorName}</p>
          <p style={{ color: '#555' }}>Duration: {formatDurationLabel(activeDurationMinutes)} per session</p>
          {includePartner && partnerData && (
            <p style={{ color: '#7c3aed', fontWeight: 600 }}>
              <TeamOutlined style={{ marginRight: 4 }} />
              With: {partnerData.partnerName}
            </p>
          )}
          <div style={{ margin: '8px 0' }}>
            {validSessions.map((s, i) => (
              <p key={i} style={{ color: '#555', margin: '2px 0' }}>
                📅 {s.date.format('ddd, MMM D')} at {s.time}
              </p>
            ))}
          </div>
          {isStandalone && servicePrice > 0 && <p style={{ fontSize: 16, fontWeight: 700 }}>{formatCurrency(servicePrice * validSessions.length, userCurrency)}</p>}
        </div>
      ),
      okText: `Book ${validSessions.length} Session${validSessions.length > 1 ? 's' : ''}`,
      cancelText: 'Go Back',
      centered: true,
      onOk: executeBookSessions,
    });
  }, [sessions, studentId, selectedInstructorId, instructorsData, serviceName, packageData, activeDurationMinutes, isStandalone, servicePrice, formatCurrency, userCurrency, executeBookSessions, modal, includePartner, partnerData]);

  const handleSkipSchedule = useCallback(() => {
    setSkipSchedule(true);
    setStep(2);
  }, []);

  const handleCreateGroupLesson = useCallback(() => {
    setGroupPartnerMode(true);
  }, []);

  const handleProceedToSchedule = useCallback(() => {
    setStep(1);
  }, []);

  const handleCreateGroupWithFriend = useCallback(() => {
    setGroupPartnerMode(true);
  }, []);

  const handlePartnerDone = useCallback(() => {
    onClose();
  }, [onClose]);

  const handleClose = useCallback(() => onClose(), [onClose]);
  const handleSessionChange = useCallback((id, changes) => {
    setSessions(prev => {
      const updated = prev.map(s => s.id === id ? { ...s, ...changes } : s);
      // When a time is picked, propagate it to sessions that don't have a time yet
      if (changes.time) {
        return updated.map(s => s.id === id ? s : (s.time ? s : { ...s, time: changes.time }));
      }
      return updated;
    });
  }, []);
  const maxSessions = remainingMinutes > 0 && selectedDurationMinutes > 0
    ? Math.floor(remainingMinutes / selectedDurationMinutes)
    : Infinity;

  const handleAddSession = useCallback(() => {
    setSessions(prev => {
      if (prev.length >= maxSessions) return prev;
      sessionIdRef.current += 1;
      return [...prev, { id: sessionIdRef.current, date: null, time: null }];
    });
  }, [maxSessions]);
  const handleRemoveSession = useCallback((id) => {
    setSessions(prev => prev.filter(s => s.id !== id));
  }, []);
  const handleResetSessions = useCallback(() => {
    setSessions([{ id: 1, date: null, time: null }]);
    sessionIdRef.current = 1;
  }, []);
  const handleDurationChange = useCallback((minutes) => {
    setSelectedDurationMinutes(minutes);
    // Reset all session times when duration changes (different slot availability)
    setSessions(prev => prev.map(s => ({ ...s, time: null })));
  }, []);

  const totalSessions = packageData?.sessionsCount || Math.round(durationHours || 1);
  const packageName = packageData?.name || serviceName || 'Lesson';

  // Dynamic step titles based on whether user already owns the package
  const stepTitles = isExistingPackage
    ? ['—', 'Schedule Session', 'Complete']
    : ['Review & Pay', 'Schedule Session', 'Complete'];
  const activeTitle = groupPartnerMode
    ? (isExistingPackage && matchingOwnedPackage ? 'Your Group Package' : 'Find a Partner')
    : (stepTitles[step] || 'Quick Booking');

  // Number of visible steps for the progress indicator
  const visibleSteps = isExistingPackage
    ? [{ title: 'Schedule Session', idx: 1 }, { title: 'Complete', idx: 2 }]
    : [{ title: 'Review & Pay', idx: 0 }, { title: 'Schedule Session', idx: 1 }, { title: 'Complete', idx: 2 }];

  return (
    <>
    <Modal
      open={open}
      onCancel={handleClose}
      footer={null}
      width={520}
      centered
      destroyOnHidden
      closable={step < 2}
      maskClosable={step === 0}
      style={{ maxWidth: '94vw' }}
      styles={{
        content: { borderRadius: 16, padding: '16px 16px 20px' },
        header: { marginBottom: 0, paddingBottom: 12 },
      }}
      title={
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shrink-0 shadow-sm shadow-blue-500/20">
            <RocketOutlined className="text-white text-sm sm:text-base" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm sm:text-base font-bold text-slate-900 leading-tight truncate">
              {activeTitle}
            </h3>
            <p className="text-[10px] sm:text-xs text-slate-400 leading-tight mt-0.5">
              {groupPartnerMode ? 'Group lesson setup' : `Step ${visibleSteps.findIndex(s => s.idx === step) + 1} of ${visibleSteps.length}`}
            </p>
          </div>
          {/* Progress bar */}
          <div className="flex gap-1 sm:gap-1.5 ml-auto">
            {visibleSteps.map(({ title, idx }) => (
              <div
                key={title}
                className={`h-1.5 sm:h-2 rounded-full transition-all duration-300 ${
                  idx < step
                    ? 'bg-green-500 w-4 sm:w-5'
                    : idx === step
                      ? 'bg-blue-500 w-6 sm:w-8'
                      : 'bg-slate-200 w-3 sm:w-4'
                }`}
                title={title}
              />
            ))}
          </div>
        </div>
      }
    >
      {step === 0 && groupPartnerMode && (
        <PartnerStep
          serviceId={serviceId}
          packageData={packageData}
          durationHours={durationHours}
          onDone={handlePartnerDone}
          onBack={() => setGroupPartnerMode(false)}
          ownedPackage={isExistingPackage ? matchingOwnedPackage : null}
          partnerInfo={partnerData}
          onProceedToSchedule={handleProceedToSchedule}
          serviceName={serviceName}
          servicePrice={servicePrice}
        />
      )}
      {step === 0 && !groupPartnerMode && (
        <PayStep
          packageData={packageData}
          packageName={packageName}
          totalSessions={totalSessions}
          durationHours={durationHours}
          displayPrice={displayPrice}
          priceCurrency={priceCurrency}
          formatCurrency={formatCurrency}
          paymentMethod={paymentMethod}
          setPaymentMethod={setPaymentMethod}
          depositMethod={depositMethod}
          setDepositMethod={setDepositMethod}
          walletBalance={walletBalance}
          walletCurrency={walletCurrency}
          walletInsufficient={walletInsufficient}
          userCurrency={userCurrency}
          convertCurrency={convertCurrency}
          purchasing={purchasing}
          onPurchase={handlePurchase}
          canPayLater={canPayLater}
          onCreateGroupLesson={handleCreateGroupLesson}
          onCreateGroupWithFriend={handleCreateGroupWithFriend}
          bankAccounts={bankAccountsResponse}
          selectedBankAccountId={selectedBankAccountId}
          setSelectedBankAccountId={setSelectedBankAccountId}
          selectedAccount={selectedAccount}
          fileList={fileList}
          setFileList={setFileList}
          isStandalone={isStandalone}
          servicePrice={servicePrice}
          onProceedToSchedule={handleProceedToSchedule}
          proRataTotalHours={proRataTotalHours}
          appliedVoucher={appliedVoucher}
          onVoucherApplied={(voucherData) => setAppliedVoucher(voucherData)}
          onVoucherRemoved={() => setAppliedVoucher(null)}
          serviceId={serviceId}
        />
      )}
      {step === 1 && (
        <ScheduleStep
          isExistingPackage={isExistingPackage}
          isStandalone={isStandalone}
          existingPackageRemaining={matchingOwnedPackage ? (parseFloat(matchingOwnedPackage.remainingHours ?? matchingOwnedPackage.remaining_hours) || 0) : 0}
          durationOptions={durationOptions}
          selectedDurationMinutes={activeDurationMinutes}
          setSelectedDurationMinutes={handleDurationChange}
          instructorsData={instructorsData}
          instructorsLoading={instructorsLoading}
          selectedInstructorId={selectedInstructorId}
          setSelectedInstructorId={setSelectedInstructorId}
          sessions={sessions}
          maxSessions={maxSessions}
          onSessionChange={handleSessionChange}
          onAddSession={handleAddSession}
          onRemoveSession={handleRemoveSession}
          bookingPending={bookingInProgress}
          onBookSession={handleBookSessions}
          onSkip={handleSkipSchedule}
          onResetSessions={handleResetSessions}
          partnerInfo={partnerData}
          includePartner={includePartner}
          onTogglePartner={setIncludePartner}
        />
      )}
      {step === 2 && (
        <DoneStep
          packageName={packageName}
          paymentMethod={paymentMethod}
          skipSchedule={skipSchedule}
          purchasedPackage={purchasedPackage}
          durationHours={durationHours}
          perSessionHours={activeDurationHours}
          isExistingPackage={isExistingPackage}
          isStandalone={isStandalone}
          displayPrice={isStandalone ? (servicePrice || 0) : displayPrice}
          eurPrice={isStandalone ? (servicePrice || 0) : (packageData?.price || 0)}
          userCurrency={userCurrency}
          formatCurrency={formatCurrency}
          priceCurrency={priceCurrency}
          instructorName={selectedInstructorId ? (instructorsData.find((i) => i.id === selectedInstructorId)?.name || `${instructorsData.find((i) => i.id === selectedInstructorId)?.first_name || ''} ${instructorsData.find((i) => i.id === selectedInstructorId)?.last_name || ''}`.trim() || null) : null}
          onClose={handleClose}
          sessions={sessions}
          groupPartnerMode={groupPartnerMode}
          includePartner={includePartner}
          partnerData={partnerData}
        />
      )}
    </Modal>

    {/* Iyzico Credit Card Payment Modal */}
    <IyzicoPaymentModal
      visible={showIyzicoModal}
      paymentPageUrl={iyzicoPaymentUrl}
      socketEventName="package:payment_confirmed"
      onSuccess={handleIyzicoSuccess}
      onClose={() => {
        iyzicoConfirmedRef.current = false;
        setShowIyzicoModal(false);
        setIyzicoPaymentUrl(null);
        if (pendingCustomerPackageId) {
          apiClient.post(`/services/customer-packages/${pendingCustomerPackageId}/cancel`).catch(() => {});
          setPendingCustomerPackageId(null);
          queryClient.invalidateQueries({ queryKey: ['quick-booking', 'owned-packages'] });
        }
      }}
      onError={(msg) => {
        iyzicoConfirmedRef.current = false;
        setShowIyzicoModal(false);
        setIyzicoPaymentUrl(null);
        if (pendingCustomerPackageId) {
          apiClient.post(`/services/customer-packages/${pendingCustomerPackageId}/cancel`).catch(() => {});
          setPendingCustomerPackageId(null);
          queryClient.invalidateQueries({ queryKey: ['quick-booking', 'owned-packages'] });
        }
        message.error(msg || 'Payment failed');
      }}
    />
  </>
  );
};

QuickBookingModal.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  packageData: PropTypes.object,   // raw package row from API (with id, name, price, prices, etc.)
  serviceId: PropTypes.string,     // resolved lesson service UUID
  durationHours: PropTypes.number, // selected duration in hours
  /** When set with a package purchase, server scales price by proRataTotalHours / package.total_hours */
  proRataTotalHours: PropTypes.number,
  servicePrice: PropTypes.number,  // price for standalone services (no package)
  serviceName: PropTypes.string,   // name for standalone services
};

export default QuickBookingModal;
