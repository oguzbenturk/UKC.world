/**
 * DownwinderBookingModal
 *
 * Purpose-built booking modal for downwinder (and camp) event packages.
 * Unlike the AllInclusiveBookingModal which handles multi-step accommodation +
 * rental + lesson scheduling, this modal is a streamlined single-view flow
 * since downwinders are fixed-date events with predetermined routes.
 *
 * Layout:
 *   - Event hero banner (image + name + type badge)
 *   - Event details card (date, route, skill level, capacity)
 *   - Itinerary preview (collapsible)
 *   - Price + Promo code
 *   - Payment method selection
 *   - Confirm button
 */

import { useState, useMemo, useEffect, useCallback } from 'react';
import { Modal, Button, Tag, Alert, App, Progress } from 'antd';
import {
  CheckCircleOutlined,
  WalletOutlined,
  CalendarOutlined,
  EnvironmentOutlined,
  TeamOutlined,
  ThunderboltFilled,
  ClockCircleOutlined,
  SafetyCertificateOutlined,
  RocketOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';

import { useAuth } from '@/shared/hooks/useAuth';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { PAY_AT_CENTER_ALLOWED_ROLES } from '@/shared/utils/roleUtils';
import PromoCodeInput from '@/shared/components/PromoCodeInput';

const SKILL_LEVEL_COLORS = {
  beginner: { bg: 'bg-green-500/15', border: 'border-green-500/30', text: 'text-green-400' },
  intermediate: { bg: 'bg-yellow-500/15', border: 'border-yellow-500/30', text: 'text-yellow-400' },
  advanced: { bg: 'bg-orange-500/15', border: 'border-orange-500/30', text: 'text-orange-400' },
  expert: { bg: 'bg-red-500/15', border: 'border-red-500/30', text: 'text-red-400' },
};

// Helper to get package price in specific currency
const getPackagePriceInCurrency = (pkg, targetCurrency, convertCurrencyFn) => {
  if (!pkg) return { price: 0, currency: 'EUR' };
  if (targetCurrency && pkg.prices && Array.isArray(pkg.prices)) {
    const cp = pkg.prices.find((p) => (p.currencyCode || p.currency_code) === targetCurrency);
    if (cp?.price > 0) return { price: cp.price, currency: targetCurrency };
  }
  const baseCurrency = pkg.currency || 'EUR';
  const basePrice = pkg.price || 0;
  if (convertCurrencyFn && targetCurrency && targetCurrency !== baseCurrency) {
    return { price: convertCurrencyFn(basePrice, baseCurrency, targetCurrency), currency: targetCurrency };
  }
  return { price: basePrice, currency: baseCurrency };
};

const getFallbackImage = (disciplineKey) => {
  if (disciplineKey === 'camps') return '/Images/ukc/team.png';
  return '/Images/ukc/rebel-dlab-header.jpg';
};

const formatEventDate = (dateStr) => {
  if (!dateStr) return null;
  const d = dayjs(dateStr);
  return d.isValid() ? d.format('ddd, DD MMM YYYY') : null;
};

const formatEventTime = (dateStr) => {
  if (!dateStr) return null;
  const d = dayjs(dateStr);
  return d.isValid() ? d.format('HH:mm') : null;
};

/* ═══════════════════════ MAIN MODAL ═══════════════════════ */
// eslint-disable-next-line complexity
const DownwinderBookingModal = ({
  open,
  onCancel,
  selectedPackage: pkg,
  walletBalance = 0,
  onPurchase,
  isPurchasing = false,
}) => {
  const { message } = App.useApp();
  const { user } = useAuth();
  const { userCurrency, formatCurrency, convertCurrency } = useCurrency();

  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('wallet');
  const [appliedVoucher, setAppliedVoucher] = useState(null);
  const [itineraryExpanded, setItineraryExpanded] = useState(false);

  // Trusted customer check
  const isTrustedCustomer = useMemo(() => {
    if (!user?.role) return false;
    return PAY_AT_CENTER_ALLOWED_ROLES.includes(user.role);
  }, [user?.role]);

  // Reset on open/close
  useEffect(() => {
    if (open) {
      setSelectedPaymentMethod('wallet');
      setAppliedVoucher(null);
      setItineraryExpanded(false);
    }
  }, [open]);

  // Package fields
  const eventStartDate = pkg?.eventStartDate || pkg?.event_start_date;
  const eventEndDate = pkg?.eventEndDate || pkg?.event_end_date;
  const departureLocation = pkg?.departureLocation || pkg?.departure_location;
  const destinationLocation = pkg?.destinationLocation || pkg?.destination_location;
  const eventLocation = pkg?.eventLocation || pkg?.event_location;
  const maxParticipants = Number(pkg?.maxParticipants || pkg?.max_participants || 0);
  const currentParticipants = Number(pkg?.currentParticipants || pkg?.current_participants || 0);
  const minSkillLevel = pkg?.minSkillLevel || pkg?.min_skill_level;
  const minAge = Number(pkg?.minAge || pkg?.min_age || 0);
  const itinerary = pkg?.itinerary;
  const eventStatus = pkg?.eventStatus || pkg?.event_status || 'scheduled';
  const packageType = (pkg?.packageType || pkg?.package_type || 'downwinders').toLowerCase();
  const isDownwinder = packageType === 'downwinders';

  const spotsLeft = maxParticipants > 0 ? Math.max(0, maxParticipants - currentParticipants) : null;
  const isFull = maxParticipants > 0 && spotsLeft === 0;
  const isCancelled = eventStatus === 'cancelled';
  const isPast = eventStartDate && dayjs(eventStartDate).isBefore(dayjs(), 'day');
  const canBook = !isFull && !isCancelled && !isPast;

  // Capacity percentage
  const capacityPercent = maxParticipants > 0
    ? Math.round((currentParticipants / maxParticipants) * 100)
    : 0;

  // Get display price
  const getDisplayPrice = useCallback(() => {
    const { price, currency } = getPackagePriceInCurrency(pkg, userCurrency, convertCurrency);
    let finalPrice = price;
    if (appliedVoucher) {
      if (appliedVoucher.discountType === 'percentage') {
        finalPrice = price * (1 - appliedVoucher.discountValue / 100);
      } else {
        finalPrice = Math.max(0, price - appliedVoucher.discountValue);
      }
    }
    return formatCurrency(finalPrice, currency);
  }, [pkg, userCurrency, convertCurrency, appliedVoucher, formatCurrency]);

  const getRawPrice = useCallback(() => {
    const { price } = getPackagePriceInCurrency(pkg, userCurrency, convertCurrency);
    let finalPrice = price;
    if (appliedVoucher) {
      if (appliedVoucher.discountType === 'percentage') {
        finalPrice = price * (1 - appliedVoucher.discountValue / 100);
      } else {
        finalPrice = Math.max(0, price - appliedVoucher.discountValue);
      }
    }
    return finalPrice;
  }, [pkg, userCurrency, convertCurrency, appliedVoucher]);

  // Itinerary preview
  const itineraryPreview = useMemo(() => {
    if (!itinerary) return '';
    const day2Index = itinerary.toLowerCase().indexOf('day 2');
    if (day2Index > 0) return itinerary.substring(0, day2Index).trim();
    return itinerary.length > 250 ? itinerary.substring(0, 250) + '...' : itinerary;
  }, [itinerary]);

  const hasLongItinerary = itinerary && (itinerary.toLowerCase().includes('day 2') || itinerary.length > 250);

  const handlePurchase = async () => {
    if (!canBook) {
      message.error('This event is no longer available for booking.');
      return;
    }

    onPurchase({
      packageId: pkg.id,
      paymentMethod: selectedPaymentMethod,
      voucherId: appliedVoucher?.id,
    });
  };

  // Cover image
  const coverImage = pkg?.imageUrl || getFallbackImage(packageType);
  const skillColors = SKILL_LEVEL_COLORS[minSkillLevel] || SKILL_LEVEL_COLORS.beginner;

  return (
    <Modal
      open={open}
      onCancel={onCancel}
      footer={null}
      width={560}
      destroyOnHidden
      closable
      className="downwinder-booking-modal"
      styles={{
        content: {
          background: '#13151a',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 20,
          padding: 0,
          overflow: 'hidden',
        },
        header: { display: 'none' },
        body: { padding: 0 },
      }}
    >
      {pkg && (
        <div className="flex flex-col max-h-[90vh]">
          {/* ── Hero Banner ──────────────────────────────────────────── */}
          <div className="relative h-44 sm:h-52 shrink-0 overflow-hidden">
            <img
              src={coverImage}
              alt={pkg.name}
              className="w-full h-full object-cover"
              onError={(e) => { e.target.onerror = null; e.target.src = getFallbackImage(packageType); }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#13151a] via-[#13151a]/60 to-transparent" />

            {/* Type badge */}
            <Tag className="absolute top-3 left-3 !bg-amber-500/20 !border-amber-500/40 !text-amber-300 !rounded-full !font-bold !text-xs backdrop-blur-sm">
              {isDownwinder ? 'Downwinder' : 'Camp'}
            </Tag>

            {/* Spots badge */}
            {spotsLeft !== null && (
              <div className={`absolute top-3 right-3 px-2.5 py-1 rounded-full text-xs font-bold backdrop-blur-sm ${
                isFull
                  ? 'bg-red-500/20 border border-red-500/40 text-red-400'
                  : spotsLeft <= 3
                    ? 'bg-orange-500/20 border border-orange-500/40 text-orange-300'
                    : 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'
              }`}>
                {isFull ? 'FULL' : `${spotsLeft} spot${spotsLeft !== 1 ? 's' : ''} left`}
              </div>
            )}

            {/* Title overlay */}
            <div className="absolute bottom-4 left-4 right-4 z-10">
              <h2 className="text-xl sm:text-2xl font-extrabold text-white leading-tight drop-shadow-lg line-clamp-2">
                {pkg.name}
              </h2>
            </div>
          </div>

          {/* ── Scrollable body ──────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-4">

            {/* Status alerts */}
            {isCancelled && (
              <Alert type="error" showIcon message="Event Cancelled" description="This event has been cancelled and is no longer available." className="!rounded-xl" />
            )}
            {isPast && !isCancelled && (
              <Alert type="warning" showIcon message="Event Has Passed" description="This event date has already passed." className="!rounded-xl" />
            )}
            {isFull && !isCancelled && !isPast && (
              <Alert type="warning" showIcon message="Fully Booked" description="All spots for this event have been taken. Check back later or try a different event." className="!rounded-xl" />
            )}

            {/* ── Event Info Grid ─────────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-2.5">
              {/* Date */}
              {eventStartDate && (
                <div className="col-span-2 flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="w-10 h-10 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">
                    <CalendarOutlined className="text-amber-400 text-lg" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Event Date</p>
                    <p className="text-white text-sm font-semibold truncate">
                      {formatEventDate(eventStartDate)}
                      {formatEventTime(eventStartDate) && (
                        <span className="text-amber-400 ml-1.5">{formatEventTime(eventStartDate)}</span>
                      )}
                    </p>
                    {eventEndDate && eventEndDate !== eventStartDate && (
                      <p className="text-gray-400 text-xs mt-0.5">
                        Until {formatEventDate(eventEndDate)}
                        {formatEventTime(eventEndDate) && ` ${formatEventTime(eventEndDate)}`}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Departure */}
              {departureLocation && (
                <div className="flex items-start gap-2.5 rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center shrink-0 mt-0.5">
                    <RocketOutlined className="text-blue-400 text-sm" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Start</p>
                    <p className="text-white text-sm font-medium leading-tight">{departureLocation}</p>
                  </div>
                </div>
              )}

              {/* Destination */}
              {destinationLocation && (
                <div className="flex items-start gap-2.5 rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center shrink-0 mt-0.5">
                    <EnvironmentOutlined className="text-emerald-400 text-sm" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Finish</p>
                    <p className="text-white text-sm font-medium leading-tight">{destinationLocation}</p>
                  </div>
                </div>
              )}

              {/* Event location (if separate) */}
              {eventLocation && !departureLocation && !destinationLocation && (
                <div className="col-span-2 flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-500/15 flex items-center justify-center shrink-0">
                    <EnvironmentOutlined className="text-blue-400 text-lg" />
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Location</p>
                    <p className="text-white text-sm font-semibold">{eventLocation}</p>
                  </div>
                </div>
              )}

              {/* Skill level */}
              {minSkillLevel && (
                <div className="flex items-start gap-2.5 rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className={`w-8 h-8 rounded-lg ${skillColors.bg} flex items-center justify-center shrink-0 mt-0.5`}>
                    <SafetyCertificateOutlined className={`${skillColors.text} text-sm`} />
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Level</p>
                    <p className={`text-sm font-semibold capitalize ${skillColors.text}`}>{minSkillLevel}+</p>
                  </div>
                </div>
              )}

              {/* Age requirement */}
              {minAge > 0 && (
                <div className="flex items-start gap-2.5 rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="w-8 h-8 rounded-lg bg-purple-500/15 flex items-center justify-center shrink-0 mt-0.5">
                    <TeamOutlined className="text-purple-400 text-sm" />
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Age</p>
                    <p className="text-white text-sm font-semibold">{minAge}+ years</p>
                  </div>
                </div>
              )}

              {/* Capacity bar */}
              {maxParticipants > 0 && (
                <div className="col-span-2 rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <TeamOutlined className="text-amber-400 text-sm" />
                      <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Capacity</span>
                    </div>
                    <span className="text-white text-sm font-semibold">
                      {currentParticipants} / {maxParticipants}
                    </span>
                  </div>
                  <Progress
                    percent={capacityPercent}
                    showInfo={false}
                    strokeColor={
                      capacityPercent >= 100 ? '#ef4444'
                        : capacityPercent >= 80 ? '#f59e0b'
                          : '#10b981'
                    }
                    trailColor="rgba(255,255,255,0.08)"
                    size="small"
                  />
                  {spotsLeft !== null && spotsLeft > 0 && spotsLeft <= 3 && (
                    <p className="text-orange-400 text-xs font-medium mt-1">
                      Hurry! Only {spotsLeft} spot{spotsLeft !== 1 ? 's' : ''} remaining
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* ── Description ──────────────────────────────────────────── */}
            {pkg.description && (
              <p className="text-gray-400 text-sm leading-relaxed">{pkg.description}</p>
            )}

            {/* ── Itinerary ───────────────────────────────────────────── */}
            {itinerary && (
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <h4 className="text-white font-bold text-xs uppercase tracking-wider flex items-center gap-2 mb-2.5">
                  <ThunderboltFilled className="text-amber-500" /> Itinerary
                </h4>
                <pre className="text-gray-300 whitespace-pre-wrap font-sans text-xs leading-relaxed mb-0">
                  {itineraryExpanded ? itinerary : itineraryPreview}
                </pre>
                {hasLongItinerary && (
                  <Button
                    type="link"
                    size="small"
                    onClick={() => setItineraryExpanded(!itineraryExpanded)}
                    className="!p-0 !mt-2 !text-amber-400 hover:!text-amber-300 !text-xs"
                  >
                    {itineraryExpanded ? 'Show Less' : 'Read Full Itinerary'}
                  </Button>
                )}
              </div>
            )}

            {/* ── Includes Tags (if it bundles lessons/rental) ─────────── */}
            {(pkg.totalHours > 0 || pkg.includesRental || pkg.includesAccommodation) && (
              <div className="flex flex-wrap gap-2">
                {pkg.totalHours > 0 && (
                  <Tag className="!bg-emerald-500/10 !border-emerald-500/30 !text-emerald-300 !rounded-full !text-xs">
                    <ClockCircleOutlined className="mr-1" />
                    {Math.round(Number(pkg.totalHours))}h Lessons
                  </Tag>
                )}
                {!!pkg.includesRental && (
                  <Tag className="!bg-orange-500/10 !border-orange-500/30 !text-orange-300 !rounded-full !text-xs">
                    Rental Included
                  </Tag>
                )}
                {!!pkg.includesAccommodation && (
                  <Tag className="!bg-blue-500/10 !border-blue-500/30 !text-blue-300 !rounded-full !text-xs">
                    Stay Included
                  </Tag>
                )}
              </div>
            )}

            {/* Only show payment section if event is bookable */}
            {canBook && (
              <>
                {/* ── Price + Promo ────────────────────────────────────── */}
                <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-amber-600/5 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-400/70 mb-0.5">Total Price</p>
                      <span className="text-2xl font-bold text-white">{getDisplayPrice()}</span>
                    </div>
                    {appliedVoucher && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-medium">
                        <CheckCircleOutlined className="text-[10px]" /> Discount
                      </span>
                    )}
                  </div>
                  <div className="[&_.ant-input]:!bg-white/5 [&_.ant-input]:!border-white/15 [&_.ant-input]:!text-white [&_.ant-input::placeholder]:!text-gray-500 [&_.ant-btn-primary]:!bg-amber-500 [&_.ant-btn-primary]:!border-amber-500 [&_.ant-btn-primary]:hover:!bg-amber-400 [&_.ant-btn-primary]:!text-black [&_.ant-btn-primary]:!font-semibold [&_.ant-input-prefix]:!text-gray-400">
                    <PromoCodeInput
                      onVoucherApplied={setAppliedVoucher}
                      onVoucherRemoved={() => setAppliedVoucher(null)}
                      packageId={pkg?.id}
                    />
                  </div>
                </div>

                {/* ── Payment Method ────────────────────────────────────── */}
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-2">Payment Method</p>
                  <div className={`grid gap-2 ${isTrustedCustomer ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    {/* Wallet */}
                    <button
                      type="button"
                      onClick={() => setSelectedPaymentMethod('wallet')}
                      className={`relative flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all text-center ${
                        selectedPaymentMethod === 'wallet'
                          ? 'border-blue-500 bg-blue-500/10 shadow-lg shadow-blue-500/10'
                          : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/8'
                      }`}
                    >
                      {selectedPaymentMethod === 'wallet' && (
                        <div className="absolute top-1.5 right-1.5 w-3.5 h-3.5 rounded-full bg-blue-500 flex items-center justify-center">
                          <CheckCircleOutlined className="text-white text-[7px]" />
                        </div>
                      )}
                      <WalletOutlined className={`text-lg ${selectedPaymentMethod === 'wallet' ? 'text-blue-400' : 'text-gray-500'}`} />
                      <span className={`text-xs font-semibold ${selectedPaymentMethod === 'wallet' ? 'text-blue-300' : 'text-gray-400'}`}>Wallet</span>
                      <span className={`text-[10px] ${selectedPaymentMethod === 'wallet' ? 'text-blue-400/80' : 'text-gray-500'}`}>
                        {formatCurrency(walletBalance, userCurrency)}
                      </span>
                    </button>

                    {/* Pay Later — trusted customers only */}
                    {isTrustedCustomer && (
                      <button
                        type="button"
                        onClick={() => setSelectedPaymentMethod('pay_later')}
                        className={`relative flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all text-center ${
                          selectedPaymentMethod === 'pay_later'
                            ? 'border-orange-500 bg-orange-500/10 shadow-lg shadow-orange-500/10'
                            : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/8'
                        }`}
                      >
                        {selectedPaymentMethod === 'pay_later' && (
                          <div className="absolute top-1.5 right-1.5 w-3.5 h-3.5 rounded-full bg-orange-500 flex items-center justify-center">
                            <CheckCircleOutlined className="text-white text-[7px]" />
                          </div>
                        )}
                        <CalendarOutlined className={`text-lg ${selectedPaymentMethod === 'pay_later' ? 'text-orange-400' : 'text-gray-500'}`} />
                        <span className={`text-xs font-semibold ${selectedPaymentMethod === 'pay_later' ? 'text-orange-300' : 'text-gray-400'}`}>Pay Later</span>
                        <span className={`text-[10px] ${selectedPaymentMethod === 'pay_later' ? 'text-orange-400/80' : 'text-gray-500'}`}>
                          At the center
                        </span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Insufficient wallet balance warning */}
                {selectedPaymentMethod === 'wallet' && getRawPrice() > walletBalance && (
                  <Alert
                    type="warning"
                    showIcon
                    className="!rounded-xl"
                    message="Insufficient Balance"
                    description={`Your wallet balance (${formatCurrency(walletBalance, userCurrency)}) is less than the price (${getDisplayPrice()}). Please top up or choose a different payment method.`}
                  />
                )}
              </>
            )}
          </div>

          {/* ── Footer Button ──────────────────────────────────────── */}
          <div className="shrink-0 px-5 pb-5 pt-2">
            {canBook ? (
              <Button
                type="primary"
                size="large"
                block
                loading={isPurchasing}
                onClick={handlePurchase}
                disabled={selectedPaymentMethod === 'wallet' && getRawPrice() > walletBalance}
                className="!bg-amber-500 !border-amber-500 hover:!bg-amber-400 !text-black !font-bold !rounded-xl !h-12 !text-base"
                icon={<CheckCircleOutlined />}
              >
                Confirm Booking — {getDisplayPrice()}
              </Button>
            ) : (
              <Button
                size="large"
                block
                disabled
                className="!rounded-xl !h-12"
              >
                {isCancelled ? 'Event Cancelled' : isFull ? 'Fully Booked' : 'Event Has Passed'}
              </Button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
};

export default DownwinderBookingModal;
