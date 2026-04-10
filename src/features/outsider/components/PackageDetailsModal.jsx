import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useLocation } from 'react-router-dom';
import { Button, InputNumber } from 'antd';
import {
  RocketOutlined,
  CheckOutlined,
  ClockCircleOutlined,
  InfoCircleOutlined,
  GiftOutlined,
} from '@ant-design/icons';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { useAuth } from '@/shared/hooks/useAuth';
import {
  subscribe,
  getPackageDetailsModalSnapshot,
  setPackageDetailsDuration,
  closePackageDetailsModal,
  resetPackageDetailsModalState,
} from '@/features/outsider/stores/packageDetailsModalStore';
import { imageRevisionFromRecord, resolvePublicUploadUrl } from '@/shared/utils/mediaUrl';
import {
  buildCustomProRataDuration,
  inferHourlyProRataBase,
  MAX_HOURS_FOR_HOURLY_PRO_RATA,
  roundCurrency,
} from '@/features/outsider/utils/packageDetailsModalDurationUtils';
import TwoColumnModal from '@/shared/components/ui/TwoColumnModal';

const defaultColors = {
  blue:   { text: 'text-blue-100',   bg: 'bg-blue-500',   border: 'border-blue-500',   soft: 'bg-blue-600/80'   },
  cyan:   { text: 'text-cyan-100',   bg: 'bg-cyan-500',   border: 'border-cyan-500',   soft: 'bg-cyan-600/80'   },
  purple: { text: 'text-purple-100', bg: 'bg-purple-500', border: 'border-purple-500', soft: 'bg-purple-600/80' },
  yellow: { text: 'text-yellow-100', bg: 'bg-yellow-500', border: 'border-yellow-500', soft: 'bg-yellow-600/80' },
  green:  { text: 'text-green-100',  bg: 'bg-green-500',  border: 'border-green-500',  soft: 'bg-green-600/80'  },
};

const getThemeColor = (pkg) => defaultColors[pkg?.color] || defaultColors.blue;

const DescriptionBlock = ({ text }) => {
  const [expanded, setExpanded] = useState(false);
  const handleToggle = () => setExpanded((prev) => !prev);
  return (
    <div className="mb-5 sm:mb-7">
      <div className="relative">
        <p
          className={`font-duotone-regular text-sm leading-relaxed text-slate-500 transition-all duration-300 ${
            expanded ? '' : 'pkg-desc-clamped'
          }`}
        >
          {text}
        </p>
        {!expanded && (
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-slate-50 to-transparent"
            aria-hidden
          />
        )}
      </div>
      <button
        type="button"
        className="mt-1.5 text-xs font-duotone-bold text-[#00a8c4] hover:underline focus-visible:outline-none focus-visible:underline"
        onClick={handleToggle}
      >
        {expanded ? 'Show less' : 'Read more'}
      </button>
    </div>
  );
};

/**
 * Lesson/rental package details modal.
 * Uses the shared TwoColumnModal shell — all animation, scroll lock, and Escape key
 * are handled there. This component only owns the content (duration picker, book button).
 * @param {{ current: { handleBookNow?: Function, ownedByPackageId?: Map } }} depsRef
 */
const PackageDetailsModal = ({ depsRef }) => {
  const location = useLocation();
  const pathnameRef = useRef(location.pathname);
  const { formatCurrency, convertCurrency, userCurrency } = useCurrency();
  const { user } = useAuth();
  const snap = useSyncExternalStore(subscribe, getPackageDetailsModalSnapshot, getPackageDetailsModalSnapshot);
  const { open, package: selectedPackage, selectedDuration } = snap;

  const [useCustomDuration, setUseCustomDuration] = useState(false);
  const [customHours, setCustomHours] = useState(2);

  useEffect(() => () => resetPackageDetailsModalState(), []);

  useEffect(() => {
    if (pathnameRef.current === location.pathname) return;
    pathnameRef.current = location.pathname;
    if (getPackageDetailsModalSnapshot().open) closePackageDetailsModal();
  }, [location.pathname]);

  useEffect(() => {
    if (!open) return;
    setUseCustomDuration(false);
    setCustomHours(2);
  }, [open, selectedPackage?.id]);

  const proRataBase = useMemo(
    () => selectedPackage?.durations?.length ? inferHourlyProRataBase(selectedPackage.durations) : null,
    [selectedPackage?.durations]
  );

  const customDurRow = useMemo(() => {
    if (!useCustomDuration || !proRataBase) return null;
    return buildCustomProRataDuration(proRataBase, customHours);
  }, [useCustomDuration, proRataBase, customHours]);

  const resolvedFooterDur = useMemo(() => {
    if (!selectedPackage) return null;
    if (customDurRow) return customDurRow;
    const idx = selectedDuration ?? 0;
    return selectedPackage.durations?.[idx] ?? null;
  }, [selectedPackage, selectedDuration, customDurRow]);

  const formatPrice = (eurPrice) => {
    const eurFormatted = formatCurrency(eurPrice, 'EUR');
    if (!userCurrency || userCurrency === 'EUR') return eurFormatted;
    const converted = convertCurrency(eurPrice, 'EUR', userCurrency);
    return `${eurFormatted} (~${formatCurrency(converted, userCurrency)})`;
  };

  const getCurrentPrice = () => {
    if (!selectedPackage) return 0;
    if (customDurRow) return roundCurrency(customDurRow.price);
    const duration = selectedPackage.durations[selectedDuration];
    return duration ? duration.price : 0;
  };

  const ownedByPackageId = depsRef?.current?.ownedByPackageId ?? new Map();

  const handleBookNowClick = () => {
    const fn = depsRef?.current?.handleBookNow;
    if (typeof fn !== 'function' || selectedPackage == null) return;
    if (!useCustomDuration && selectedDuration == null) return;
    const override = useCustomDuration && customDurRow ? customDurRow : null;
    fn(selectedPackage, selectedDuration ?? 0, override);
  };

  if (!selectedPackage) return null;

  const leftContent = (
    <>
      {/* Hero image */}
      <div className="relative h-48 shrink-0 sm:h-56 md:h-[min(42vh,22rem)]">
        {selectedPackage.image ? (
          <img
            key={`${selectedPackage.image}-${selectedPackage.imageRevision ?? imageRevisionFromRecord(selectedPackage)}`}
            src={resolvePublicUploadUrl(
              selectedPackage.image,
              selectedPackage.imageRevision ?? imageRevisionFromRecord(selectedPackage)
            )}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            decoding="async"
            fetchpriority="high"
          />
        ) : null}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-20 bg-gradient-to-t from-slate-50 via-slate-50/25 to-transparent"
          aria-hidden
        />
        <div className="absolute bottom-3 left-3 z-10 pr-12 sm:bottom-4 sm:left-4 max-w-[calc(100%-3rem)]">
          <div
            className={`mb-1.5 inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-duotone-bold uppercase tracking-wider truncate ${getThemeColor(selectedPackage).soft} ${getThemeColor(selectedPackage).text}`}
          >
            {selectedPackage.subtitle}
          </div>
          <h2
            id="package-details-modal-title"
            className="text-base font-duotone-bold-extended leading-snug text-slate-900 drop-shadow-sm sm:text-xl"
          >
            {selectedPackage.name}
          </h2>
        </div>
      </div>

      {/* Scrollable description */}
      <div className="tcm-scroll p-4 sm:p-5 md:min-h-0 md:flex-1 md:overflow-y-auto md:p-7">
        <DescriptionBlock text={selectedPackage.description} />
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
          <CheckOutlined className="shrink-0 text-[#00a8c4]" />
          <span className="font-duotone-regular text-sm text-slate-600">All equipment &amp; materials included</span>
        </div>
      </div>
    </>
  );

  const rightContent = (
    <>
      {/* Duration picker */}
      <div className="tcm-scroll space-y-3 px-4 pt-5 pb-4 sm:px-5 sm:pt-6 md:min-h-0 md:flex-1 md:overflow-y-auto md:px-7 md:pt-8">
        <h3 className="flex items-center gap-2 text-base font-duotone-bold-extended text-slate-900 sm:text-lg">
          <ClockCircleOutlined className="text-slate-400" /> Choose duration
        </h3>

        <div className="flex flex-col gap-2">
          {selectedPackage.durations.map((dur, durIdx) => {
            const isSelected = !useCustomDuration && selectedDuration === durIdx;
            const ownedPkg =
              !dur.isCustomProRata && dur.packageId
                ? ownedByPackageId.get(String(dur.packageId))
                : null;
            const ownedRemaining = ownedPkg ? (parseFloat(ownedPkg.remainingHours ?? ownedPkg.remaining_hours) || 0) : 0;
            const ownedUsed     = ownedPkg ? (parseFloat(ownedPkg.usedHours     ?? ownedPkg.used_hours)      || 0) : 0;
            const ownedTotal    = ownedPkg ? (parseFloat(ownedPkg.totalHours    ?? ownedPkg.total_hours)     || 0) : 0;
            const ownedLessonsFullyScheduledPending =
              !!ownedPkg && ownedRemaining <= 0 && ownedTotal > 0 && ownedUsed > 0;
            const rowBase =
              'relative flex w-full cursor-pointer items-center gap-3 rounded-xl border p-3 text-left transition-all duration-200';
            const rowState = ownedPkg
              ? isSelected
                ? 'border-emerald-500 bg-emerald-100 ring-2 ring-emerald-400/40'
                : 'border-emerald-400 bg-emerald-50 hover:border-emerald-500 hover:bg-emerald-100'
              : isSelected
                ? 'border-[rgba(0,168,196,0.55)] bg-[rgba(0,168,196,0.07)] shadow-[0_0_0_1px_rgba(0,168,196,0.12)]'
                : 'border-slate-200 bg-slate-50/80 hover:border-slate-300 hover:bg-white';
            const handleDurationClick = () => {
              setUseCustomDuration(false);
              setPackageDetailsDuration(durIdx);
            };
            const handleDurationKeyDown = (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setUseCustomDuration(false);
                setPackageDetailsDuration(durIdx);
              }
            };
            return (
              <div
                key={`${selectedPackage.id}-${dur.serviceId || dur.hours}-${durIdx}`}
                role="button"
                tabIndex={0}
                onClick={handleDurationClick}
                onKeyDown={handleDurationKeyDown}
                className={`${rowBase} ${rowState}`}
              >
                <div
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                    ownedPkg
                      ? isSelected ? 'border-emerald-500 bg-emerald-500' : 'border-emerald-400 bg-emerald-100'
                      : isSelected ? 'border-[#00a8c4] bg-[#00a8c4]'    : 'border-slate-300 bg-white'
                  }`}
                >
                  {isSelected ? <CheckOutlined className="text-[10px] text-white" /> : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`font-duotone-bold text-sm ${isSelected || ownedPkg ? 'text-slate-900' : 'text-slate-600'}`}>
                      {dur.hours}
                    </span>
                    {dur.tag ? (
                      <span className={`rounded border px-2 py-0.5 text-[10px] font-duotone-regular ${isSelected || ownedPkg ? 'border-slate-300 text-slate-700' : 'border-slate-200 text-slate-500'}`}>
                        {dur.tag}
                      </span>
                    ) : null}
                    {dur.isPackage ? (
                      <span className="rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-duotone-bold text-amber-700">
                        Package
                      </span>
                    ) : null}
                  </div>
                  {dur.label ? (
                    <p className={`mt-0.5 truncate text-xs font-duotone-regular ${isSelected || ownedPkg ? 'text-slate-600' : 'text-slate-500'}`}>
                      {dur.label}
                    </p>
                  ) : null}
                  <p className="mt-0.5 text-[11px] text-slate-400 font-duotone-regular">{dur.sessions}</p>
                  {ownedPkg ? (
                    <div className="mt-1.5 flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500 bg-emerald-500 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm">
                        <GiftOutlined className="text-[10px]" /> Owned
                      </span>
                      <span className="text-[10px] font-semibold text-emerald-600">
                        {ownedRemaining > 0
                          ? `${ownedRemaining}h remaining`
                          : ownedLessonsFullyScheduledPending
                            ? `${ownedUsed}h of ${ownedTotal}h scheduled`
                            : ownedTotal > 0 ? 'No hours remaining' : ''}
                      </span>
                    </div>
                  ) : null}
                </div>
                <div className="shrink-0 text-right">
                  {ownedPkg ? null : (
                    <>
                      <span className="font-duotone-bold-extended text-sm text-slate-900 sm:text-base">{formatPrice(dur.price)}</span>
                      {dur.perPerson ? <span className="ml-1 text-[10px] font-duotone-regular text-slate-400">/pp</span> : null}
                    </>
                  )}
                </div>
              </div>
            );
          })}

          {proRataBase && !selectedPackage?.isRentalCard ? (
            <div
              role="button"
              tabIndex={0}
              onClick={() => setUseCustomDuration(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setUseCustomDuration(true); }
              }}
              className={`relative flex w-full cursor-pointer items-center gap-3 rounded-xl border p-3 text-left transition-all duration-200 ${
                useCustomDuration
                  ? 'border-[rgba(0,168,196,0.55)] bg-[rgba(0,168,196,0.07)] shadow-[0_0_0_1px_rgba(0,168,196,0.12)]'
                  : 'border-slate-200 bg-slate-50/80 hover:border-slate-300 hover:bg-white'
              }`}
            >
              <div
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                  useCustomDuration ? 'border-[#00a8c4] bg-[#00a8c4]' : 'border-slate-300 bg-white'
                }`}
              >
                {useCustomDuration ? <CheckOutlined className="text-[10px] text-white" /> : null}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`font-duotone-bold text-sm ${useCustomDuration ? 'text-slate-900' : 'text-slate-600'}`}>
                    Custom length
                  </span>
                  <span className="text-[10px] font-duotone-regular uppercase tracking-wide text-slate-400">
                    Pro-rata from base
                  </span>
                </div>
              </div>
              <div
                className="flex shrink-0 items-center gap-2"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                role="presentation"
              >
                <InputNumber
                  min={0.5}
                  max={MAX_HOURS_FOR_HOURLY_PRO_RATA}
                  step={0.5}
                  value={customHours}
                  onChange={(v) => {
                    if (v != null && Number.isFinite(Number(v))) {
                      setCustomHours(Number(v));
                      setUseCustomDuration(true);
                    }
                  }}
                  className="!w-[88px]"
                  size="small"
                  aria-label="Custom hours"
                />
                <span className="text-xs font-duotone-regular text-slate-500">hours</span>
                <span className="font-duotone-bold-extended text-sm text-slate-900 sm:text-base">
                  {customDurRow ? formatPrice(roundCurrency(customDurRow.price)) : '—'}
                </span>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Sticky "Book Now" footer */}
      <div className="shrink-0 border-t border-slate-200 bg-slate-50 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] shadow-[0_-4px_24px_rgba(15,23,42,0.06)] sm:px-5 sm:pt-4 sm:pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] md:px-7 md:py-5">
        {(() => {
          const selDur = resolvedFooterDur;
          const selOwned =
            selDur?.isCustomProRata || !selDur?.packageId
              ? null
              : ownedByPackageId.get(String(selDur.packageId));
          const selOwnedRemaining = selOwned ? (parseFloat(selOwned.remainingHours ?? selOwned.remaining_hours) || 0) : 0;
          const selOwnedUsed      = selOwned ? (parseFloat(selOwned.usedHours      ?? selOwned.used_hours)      || 0) : 0;
          const selOwnedTotal     = selOwned ? (parseFloat(selOwned.totalHours     ?? selOwned.total_hours)     || 0) : 0;
          const selLessonsFullyScheduledPending =
            !!selOwned && selOwnedRemaining <= 0 && selOwnedTotal > 0 && selOwnedUsed > 0;
          return (
            <>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  {selOwned ? (
                    <>
                      <p className="text-sm font-duotone-bold uppercase tracking-wider text-emerald-600">You own this package</p>
                      <p className="text-sm font-duotone-regular text-emerald-600/90">
                        {selLessonsFullyScheduledPending
                          ? `${selOwnedUsed}h of ${selOwnedTotal}h scheduled — pending staff confirmation`
                          : `${selOwnedRemaining}h remaining — schedule a session`}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-xs font-duotone-bold uppercase tracking-wider text-slate-500">Total</p>
                      <p className="text-xs font-duotone-regular text-slate-400">{selDur?.sessions}</p>
                    </>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  {selOwned ? (
                    <span className="flex items-center justify-end gap-1.5 rounded-xl bg-emerald-500 px-3 py-1.5 text-sm font-bold text-white shadow-sm">
                      <GiftOutlined /> Owned
                    </span>
                  ) : (
                    <>
                      <span className="font-duotone-bold-extended text-xl tracking-tight text-slate-900 sm:text-2xl">
                        {formatPrice(getCurrentPrice())}
                      </span>
                      {selDur?.perPerson ? <p className="text-[10px] text-slate-400">per person</p> : null}
                    </>
                  )}
                </div>
              </div>
              <Button
                block
                size="large"
                type="primary"
                icon={selOwned ? <ClockCircleOutlined /> : <RocketOutlined />}
                onClick={handleBookNowClick}
                className="!h-12 !rounded-xl !text-base font-duotone-bold shadow-md transition-transform hover:scale-[1.01] active:scale-[0.99]"
                style={{
                  backgroundColor: '#4b4f54',
                  color: '#00a8c4',
                  border: '1px solid rgba(0,168,196,0.5)',
                  boxShadow: '0 0 12px rgba(0,168,196,0.25)',
                }}
              >
                {selOwned
                  ? selLessonsFullyScheduledPending ? 'View in dashboard' : 'Schedule Session'
                  : 'Book Now'}
              </Button>
              <p className="mt-2.5 flex items-center justify-center gap-1 text-center text-[10px] font-duotone-regular text-slate-400">
                <InfoCircleOutlined />
                {selOwned
                  ? selLessonsFullyScheduledPending
                    ? 'Your package sessions are booked and awaiting confirmation.'
                    : 'Use your existing package hours — no extra charge.'
                  : user
                    ? 'Pick your date & time in the next step.'
                    : 'Sign in to secure your spot.'}
              </p>
            </>
          );
        })()}
      </div>
    </>
  );

  return (
    <TwoColumnModal
      open={open}
      onClose={closePackageDetailsModal}
      maxWidth={1000}
      ariaLabelledBy="package-details-modal-title"
      leftContent={leftContent}
      rightContent={rightContent}
    />
  );
};

export default PackageDetailsModal;
