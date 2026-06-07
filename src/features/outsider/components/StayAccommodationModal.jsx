import { useState, useEffect, useMemo } from 'react';
import { Button, Image } from 'antd';
import {
  CheckOutlined,
  LeftOutlined,
  RightOutlined,
  HomeOutlined,
  TeamOutlined,
  StarFilled,
  InfoCircleOutlined,
  ThunderboltFilled,
  CalendarOutlined,
  PictureOutlined,
  RocketOutlined,
  ClockCircleOutlined,
  MinusOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import BrandPackageModalShell from './BrandPackageModalShell';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { imageRevisionFromRecord, resolvePublicUploadUrl } from '@/shared/utils/mediaUrl';
import { extractUnitMeta, pickOccupancyRate } from '@/shared/utils/accommodationPricing';

const ACCENT = '#00a8c4'; // duotone teal — single sharp accent, used sparingly on purpose

const toTitle = (v) =>
  String(v || '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();

/**
 * Light, Booking.com-style preview modal for Stay pages (stay_home / stay_hotel).
 *
 * Layout: photos + details on the left, a quiet booking rail on the right whose
 * centrepiece is a per-guest "rate ladder" (1 guest / 2 guests / …) — the row
 * matching the Guests stepper lights up in teal, and a fenced-off emerald weekly
 * row appears only when a 7-night length-of-stay discount is configured. Reuses
 * BrandPackageModalShell so it shares chrome/motion/a11y with ExperienceDetailModal.
 *
 * Props:
 *   unit        – raw accommodation unit object from the API
 *   pkg         – card data object built by buildAccommodationUnitCards()
 *   visible     – boolean
 *   onClose     – callback
 *   onBookNow   – callback(pkg)
 */
const StayAccommodationModal = ({ unit = {}, pkg = {}, visible, onClose, onBookNow }) => {
  const { formatDualCurrency } = useCurrency();
  const isHotel = (unit?.type || '').toLowerCase() === 'room';
  const capacity = Math.max(1, Number(unit.capacity) || 1);

  const [photoIndex, setPhotoIndex] = useState(0);
  const [guests, setGuests] = useState(1);
  const [nights, setNights] = useState(1);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);

  const pricePerNight = pkg.pricePerNight || parseFloat(unit.price_per_night || 0) || 0;

  useEffect(() => {
    if (visible) {
      setPhotoIndex(0);
      setGuests(1);
      setNights(1);
      setPreviewVisible(false);
      setPreviewIndex(0);
    }
  }, [visible, pkg.id]);

  // ─── Images ──────────────────────────────────────────────────────────────
  const allImages = useMemo(() => {
    const rev = imageRevisionFromRecord(unit);
    const resolve = (u) => (u ? resolvePublicUploadUrl(u, rev) : '');
    const rawImages = Array.isArray(unit.images) ? unit.images : [];
    const ordered = [unit.image_url, ...rawImages].map(resolve).filter(Boolean);
    return Array.from(new Set(ordered));
  }, [unit]);
  const hasGallery = allImages.length > 1;

  const prevPhoto = (e) => {
    e.stopPropagation();
    setPhotoIndex((i) => (i - 1 + allImages.length) % allImages.length);
  };
  const nextPhoto = (e) => {
    e.stopPropagation();
    setPhotoIndex((i) => (i + 1) % allImages.length);
  };

  // ─── Amenities ────────────────────────────────────────────────────────────
  const amenities = useMemo(() => {
    let list = [];
    if (Array.isArray(unit.amenities)) list = unit.amenities;
    else if (typeof unit.amenities === 'string') {
      try { list = JSON.parse(unit.amenities); } catch { return []; }
    }
    return list.filter((a) => typeof a === 'string' && a.trim() && !a.startsWith('__meta_'));
  }, [unit]);

  // ─── Pricing (occupancy-aware) ──────────────────────────────────────────────
  const meta = useMemo(() => extractUnitMeta(unit), [unit]);
  const occEnabled = !!meta.occupancy_pricing_enabled;
  const occList = occEnabled && Array.isArray(meta.occupancy_pricing) ? meta.occupancy_pricing : null;
  const discounts = Array.isArray(meta.custom_discounts) ? meta.custom_discounts : [];

  const formatPrice = (eurPrice) => formatDualCurrency(eurPrice, 'EUR');

  /** Per-guest nightly rate rows shown in the rate ladder. */
  const rateRows = useMemo(() => {
    if (occList) {
      const valid = occList
        .map((o) => ({ guests: Number(o.guests), price: parseFloat(o.price_per_night) }))
        .filter((o) => Number.isFinite(o.guests) && o.guests > 0 && Number.isFinite(o.price) && o.price > 0)
        .sort((a, b) => a.guests - b.guests);
      if (valid.length > 0) return valid;
    }
    return pricePerNight > 0 ? [{ guests: null, price: pricePerNight }] : [];
  }, [occList, pricePerNight]);

  /** Best length-of-stay discount for a given number of nights, or null. */
  const discountForNights = (n) =>
    discounts
      .filter((d) => Number(d.min_nights) > 0 && n >= Number(d.min_nights) && Number(d.discount_value) > 0)
      .sort((a, b) => Number(b.min_nights) - Number(a.min_nights))[0] || null;

  const applyDiscount = (sub, n, discount) => {
    if (!discount) return sub;
    const out = discount.discount_type === 'percentage'
      ? sub * (1 - Number(discount.discount_value) / 100)
      : sub - Number(discount.discount_value) * n;
    return Math.max(0, out);
  };

  const nightlyForSelected = pickOccupancyRate(occList, guests, pricePerNight);
  const subtotal = nightlyForSelected * nights;
  const stayDiscount = discountForNights(nights);
  const total = applyDiscount(subtotal, nights, stayDiscount);

  // Weekly price — shown ONLY when a length-of-stay discount applies at 7 nights ("if configured").
  const weeklyDiscount = discountForNights(7);
  const weeklyRow = useMemo(() => {
    if (!weeklyDiscount || pricePerNight <= 0) return null;
    const sub = pickOccupancyRate(occList, guests, pricePerNight) * 7;
    const tot = applyDiscount(sub, 7, weeklyDiscount);
    const pct = weeklyDiscount.discount_type === 'percentage'
      ? Math.round(Number(weeklyDiscount.discount_value))
      : Math.round((1 - tot / sub) * 100);
    return { total: tot, savePct: pct > 0 ? pct : null };
  }, [weeklyDiscount, occList, guests, pricePerNight]);

  const discountLabel = stayDiscount
    ? (stayDiscount.discount_type === 'percentage'
        ? `${Math.round(Number(stayDiscount.discount_value))}% off`
        : `${formatPrice(Number(stayDiscount.discount_value))}/night off`)
    : null;

  const heroFrom = rateRows[0]?.price ?? pricePerNight; // cheapest rate → the "from" anchor chip

  // formatDualCurrency returns "€X / ₺Y" for non-EUR users; split it so the figure and its
  // converted equivalent can stack instead of overflowing the photo chip / rate rows / total.
  const priceParts = (eur) => {
    const str = formatPrice(eur);
    const i = str.indexOf(' / ');
    return i === -1 ? { main: str, sub: null } : { main: str.slice(0, i), sub: str.slice(i + 3) };
  };
  const totalParts = priceParts(total);
  const weeklyParts = weeklyRow ? priceParts(weeklyRow.total) : null;

  // The occupancy tier pickOccupancyRate actually charges for the chosen guest count, so the
  // matching ladder row stays highlighted even when guests exceeds the configured tiers.
  const effectiveGuests = useMemo(() => {
    const valid = rateRows.filter((r) => r.guests != null);
    if (valid.length === 0) return null;
    const exact = valid.find((r) => r.guests === guests);
    if (exact) return exact.guests;
    const lower = valid.filter((r) => r.guests <= guests).sort((a, b) => b.guests - a.guests);
    if (lower.length) return lower[0].guests;
    return [...valid].sort((a, b) => a.guests - b.guests)[0].guests;
  }, [rateRows, guests]);

  const handleClose = () => {
    setPreviewVisible(false);
    onClose();
  };

  /** Lightbox config — raised above the shell (z-[1050]) so a photo opens full-screen. */
  const galleryPreviewConfig = {
    visible: previewVisible,
    current: previewIndex,
    onVisibleChange: (v) => setPreviewVisible(v),
    onChange: (idx) => setPreviewIndex(idx),
    zIndex: 1200,
    getContainer: () => document.body,
  };

  if (!visible && !pkg?.id) return null;

  return (
    <BrandPackageModalShell
      open={visible}
      onClose={handleClose}
      animationKey={pkg.id}
      ariaLabelledBy="stay-modal-title"
      maxWidthClass="max-w-[1040px]"
      escEnabled={!previewVisible}
    >
      <div className="flex flex-col lg:flex-row lg:min-h-0 w-full">
        {/* ── LEFT: Gallery + Details ── */}
        <div className="lg:w-[55%] bg-slate-50 flex flex-col lg:min-h-0 pkg-modal-scroll">

          {/* Photo Gallery */}
          <div className="relative shrink-0 aspect-[5/4] max-h-[22rem] sm:max-h-[24rem] overflow-hidden bg-slate-100">
            {allImages.length > 0 ? (
              <>
                {/* Hidden preview group — enables full-screen lightbox */}
                <div className="hidden">
                  <Image.PreviewGroup preview={galleryPreviewConfig}>
                    {allImages.map((src, idx) => (
                      <Image key={`img-${idx}-${src}`} src={src} />
                    ))}
                  </Image.PreviewGroup>
                </div>

                <img
                  key={allImages[photoIndex]}
                  src={allImages[photoIndex]}
                  alt={`${pkg.name || unit.name || 'Room'} – photo ${photoIndex + 1}`}
                  className="absolute inset-0 w-full h-full object-cover transition-opacity duration-300 cursor-zoom-in"
                  loading="eager"
                  onClick={() => { setPreviewIndex(photoIndex); setPreviewVisible(true); }}
                  onError={(e) => { e.target.style.display = 'none'; }}
                />

                {/* Prev / Next arrows */}
                {hasGallery && (
                  <>
                    <button
                      onClick={prevPhoto}
                      className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 hover:bg-white shadow-md flex items-center justify-center text-slate-700 transition-colors z-20"
                    >
                      <LeftOutlined className="text-xs" />
                    </button>
                    <button
                      onClick={nextPhoto}
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 hover:bg-white shadow-md flex items-center justify-center text-slate-700 transition-colors z-20"
                    >
                      <RightOutlined className="text-xs" />
                    </button>
                  </>
                )}

                {/* Top-left stack: POPULAR + photo counter (top-right is the shell's close button) */}
                <div className="absolute top-3 left-3 z-20 flex flex-col items-start gap-1.5">
                  {pkg.featured && (
                    <div className="bg-white/95 text-slate-900 px-2.5 py-0.5 rounded-full text-[10px] font-duotone-bold shadow-md flex items-center gap-1 border border-slate-200">
                      <StarFilled className="text-[10px] text-yellow-500" /> POPULAR
                    </div>
                  )}
                  {hasGallery && (
                    <div className="px-2 py-0.5 rounded-full bg-white/90 shadow-sm text-slate-600 text-[11px] flex items-center gap-1.5">
                      <PictureOutlined className="text-[10px]" /> {photoIndex + 1} / {allImages.length}
                    </div>
                  )}
                </div>

                {/* Dot indicators */}
                {hasGallery && (
                  <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5 z-10">
                    {allImages.map((img, i) => (
                      <button
                        key={`dot-${i}`}
                        onClick={(e) => { e.stopPropagation(); setPhotoIndex(i); }}
                        className="h-1.5 rounded-full transition-all"
                        style={{
                          width: i === photoIndex ? 16 : 6,
                          backgroundColor: i === photoIndex ? ACCENT : 'rgba(255,255,255,0.9)',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.25)',
                        }}
                      />
                    ))}
                  </div>
                )}

                {/* Grafted "from /night" glass price chip — the one teal touch on the photo */}
                {heroFrom > 0 && (
                  <div className="absolute bottom-3 right-3 z-20 flex items-baseline gap-1 whitespace-nowrap rounded-full bg-white/90 backdrop-blur-md px-3 py-1.5 shadow-[0_2px_10px_rgba(15,23,42,0.18)] ring-1 ring-[rgba(0,168,196,0.5)]">
                    <span className="text-[10px] uppercase tracking-wider font-duotone-bold text-slate-500">from</span>
                    <span className="text-sm font-duotone-bold-extended text-slate-900 leading-none">{priceParts(heroFrom).main}</span>
                    <span className="text-[11px] font-duotone-bold" style={{ color: '#007a8f' }}>/night</span>
                  </div>
                )}
              </>
            ) : (
              /* No images placeholder */
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-100">
                <HomeOutlined className="text-5xl text-slate-300 mb-2" />
                <p className="text-xs text-slate-400">No photos uploaded yet</p>
              </div>
            )}
          </div>

          {/* Thumbnail strip */}
          {allImages.length > 1 && (
            <div className="flex gap-2 px-4 pt-3 pb-0 overflow-x-auto scrollbar-thin">
              {allImages.map((img, i) => (
                <button
                  key={`thumb-${i}`}
                  onClick={() => setPhotoIndex(i)}
                  className="shrink-0 w-16 h-12 rounded-lg overflow-hidden border-2 transition-all"
                  style={{ borderColor: i === photoIndex ? ACCENT : 'transparent', opacity: i === photoIndex ? 1 : 0.55 }}
                >
                  <img src={img} alt="" className="w-full h-full object-cover" onError={(e) => { e.target.parentElement.style.display = 'none'; }} />
                </button>
              ))}
            </div>
          )}

          {/* Details section */}
          <div className="p-5 sm:p-6 flex-grow">
            {/* Title */}
            <div className="mb-4">
              <div
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-duotone-bold uppercase tracking-wider mb-2"
                style={{ backgroundColor: 'rgba(0,168,196,0.10)', color: '#007a8f' }}
              >
                {pkg.subtitle || toTitle(unit.type || 'Accommodation')}
              </div>
              <h2 id="stay-modal-title" className="text-2xl sm:text-3xl font-duotone-bold-extended text-slate-900 leading-tight">
                {pkg.name || unit.name}
              </h2>
            </div>

            {/* Quick stats row */}
            <div className="flex flex-wrap gap-2.5 mb-5">
              {unit.capacity && (
                <StatChip icon={<TeamOutlined style={{ color: ACCENT }} />}>
                  Up to <strong className="text-slate-900">{unit.capacity}</strong> guest{unit.capacity > 1 ? 's' : ''}
                </StatChip>
              )}
              {unit.type && (
                <StatChip icon={<HomeOutlined style={{ color: ACCENT }} />}>
                  <strong className="text-slate-900">{toTitle(unit.type)}</strong>
                </StatChip>
              )}
              {heroFrom > 0 && (
                <StatChip icon={<CalendarOutlined style={{ color: ACCENT }} />}>
                  From <strong className="text-slate-900">{priceParts(heroFrom).main}</strong> / night
                </StatChip>
              )}
            </div>

            {/* Description */}
            {(unit.description || pkg.description) && (
              <p className="text-slate-600 text-sm font-duotone-regular leading-relaxed mb-6">
                {unit.description || pkg.description}
              </p>
            )}

            {/* Amenities */}
            {amenities.length > 0 && (
              <div>
                <h4 className="text-slate-900 font-duotone-bold-extended mb-3 flex items-center gap-2 text-sm uppercase tracking-wide">
                  <ThunderboltFilled style={{ color: ACCENT }} /> Amenities &amp; Features
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5">
                  {amenities.map((a) => (
                    <div key={a} className="flex items-center gap-2 text-sm text-slate-600 font-duotone-regular">
                      <CheckOutlined className="text-[11px] shrink-0" style={{ color: ACCENT }} />{a}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Highlights (fallback when no amenities) */}
            {amenities.length === 0 && pkg.highlights?.length > 0 && (
              <div>
                <h4 className="text-slate-900 font-duotone-bold-extended mb-3 flex items-center gap-2 text-sm uppercase tracking-wide">
                  <ThunderboltFilled style={{ color: ACCENT }} /> What's Included
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5">
                  {pkg.highlights.map((h) => (
                    <div key={h} className="flex items-center gap-2 text-sm text-slate-600 font-duotone-regular">
                      <CheckOutlined className="text-[11px] shrink-0" style={{ color: ACCENT }} />{h}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: Booking Rail ── */}
        <div className="lg:w-[45%] bg-white border-t border-slate-100 lg:border-t-0 lg:border-l lg:border-slate-100 p-5 sm:p-6 lg:p-8 flex flex-col lg:min-h-0 pkg-modal-scroll">
          <h3 className="text-lg sm:text-xl font-duotone-bold-extended text-slate-900 mb-5 flex items-center gap-2">
            <ClockCircleOutlined style={{ color: ACCENT }} /> Choose your stay
          </h3>

          {/* The rate ladder — the memorable detail */}
          {rateRows.length > 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 mb-5">
              <p className="text-[11px] uppercase tracking-wider font-duotone-bold text-slate-500 mb-3">Per-night rate</p>
              <div className="space-y-1.5 max-h-[17rem] overflow-y-auto pkg-modal-scroll">
                {rateRows.map((r) => {
                  const isSel = r.guests != null && r.guests === effectiveGuests;
                  const { main, sub } = priceParts(r.price);
                  return (
                    <div
                      key={r.guests ?? 'flat'}
                      className="flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 transition-colors duration-200"
                      style={isSel
                        ? { backgroundColor: 'rgba(0,168,196,0.07)', border: '1px solid rgba(0,168,196,0.30)', boxShadow: 'inset 3px 0 0 0 #00a8c4' }
                        : { backgroundColor: '#fff', border: '1px solid rgba(15,23,42,0.06)' }}
                    >
                      <span
                        className="min-w-0 text-[11px] uppercase tracking-wider font-duotone-bold flex items-center gap-2"
                        style={{ color: isSel ? '#007a8f' : '#64748b' }}
                      >
                        <TeamOutlined className={isSel ? '' : 'text-slate-400'} style={isSel ? { color: ACCENT } : undefined} />
                        <span className="truncate">{r.guests != null ? `${r.guests} guest${r.guests > 1 ? 's' : ''}` : 'Per night'}</span>
                        {isSel && (
                          <span
                            className="ml-0.5 inline-flex items-center gap-0.5 text-[9px] font-duotone-bold px-1.5 py-0.5 rounded-full normal-case tracking-normal shrink-0"
                            style={{ backgroundColor: 'rgba(0,168,196,0.12)', color: '#007a8f' }}
                          >
                            <CheckOutlined className="text-[8px]" /> you
                          </span>
                        )}
                      </span>
                      <span className="text-right shrink-0 leading-tight">
                        <span className="text-sm font-duotone-bold text-slate-900">{main}<span className="text-slate-400 font-normal"> /night</span></span>
                        {sub && <span className="block text-[10px] font-duotone-regular text-slate-400">≈ {sub}</span>}
                      </span>
                    </div>
                  );
                })}

                {/* Weekly — only when a 7-night discount is configured */}
                {weeklyRow && (
                  <>
                    <div className="relative my-2 flex items-center">
                      <div className="flex-grow border-t border-dashed border-slate-200" />
                      <span className="px-2 text-[10px] uppercase tracking-wider text-slate-400 font-duotone-bold">or stay longer</span>
                      <div className="flex-grow border-t border-dashed border-slate-200" />
                    </div>
                    <div
                      className="flex items-center justify-between rounded-xl px-3 py-2.5"
                      style={{ backgroundColor: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.30)' }}
                    >
                      <span className="text-[11px] uppercase tracking-wider font-duotone-bold text-emerald-800 flex items-center gap-2">
                        <CalendarOutlined /> 7 nights
                        {weeklyRow.savePct ? (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 font-duotone-bold normal-case tracking-normal">
                            save {weeklyRow.savePct}%
                          </span>
                        ) : null}
                      </span>
                      <span className="text-right shrink-0 leading-tight">
                        <span className="text-sm font-duotone-bold text-emerald-800">{weeklyParts.main}</span>
                        {weeklyParts.sub && <span className="block text-[10px] font-duotone-regular text-emerald-600">≈ {weeklyParts.sub}</span>}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : (
            <p className="text-slate-500 text-sm mb-5 font-duotone-regular">Contact us for pricing and availability.</p>
          )}

          {/* Guests + Nights steppers */}
          <div className="grid grid-cols-2 gap-3 mb-5">
            <Stepper label="Guests" value={guests} min={1} max={capacity} onChange={setGuests} />
            <Stepper label="Nights" value={nights} min={1} max={60} onChange={setNights} />
          </div>

          {/* Spacer */}
          <div className="flex-grow min-h-2" />

          {/* Booking summary */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5 shadow-sm">
            <div className="flex justify-between items-end gap-3 mb-1">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wider font-duotone-bold text-slate-500">From</p>
                <p className="text-slate-400 text-xs font-duotone-regular">
                  {guests} guest{guests > 1 ? 's' : ''} · {nights} night{nights > 1 ? 's' : ''}
                </p>
              </div>
              <span className="text-right shrink-0">
                <span className="block text-[28px] leading-none sm:text-[32px] font-duotone-bold-extended text-slate-900 tracking-tight">{totalParts.main}</span>
                {totalParts.sub && <span className="block text-xs font-duotone-regular text-slate-400 mt-0.5">≈ {totalParts.sub}</span>}
              </span>
            </div>
            {stayDiscount && discountLabel && (
              <p className="text-right text-xs text-emerald-700 font-duotone-bold mt-1 mb-3">
                Includes {discountLabel} for {nights}+ nights
              </p>
            )}
            <Button
              block
              size="large"
              type="primary"
              icon={<RocketOutlined />}
              onClick={() => onBookNow?.(pkg)}
              className={`!h-12 sm:!h-14 !rounded-xl !text-base sm:!text-lg font-duotone-bold shadow-md transition-transform hover:scale-[1.01] active:scale-[0.99] ${stayDiscount ? '' : 'mt-3'}`}
              style={{
                backgroundColor: '#4b4f54',
                color: ACCENT,
                border: '1px solid rgba(0,168,196,0.5)',
                boxShadow: '0 0 12px rgba(0,168,196,0.25)',
              }}
            >
              {isHotel ? 'Request Booking' : 'Book Now'}
            </Button>
            <p className="text-center text-slate-400 text-[10px] mt-3 flex items-center justify-center gap-1 font-duotone-regular">
              <InfoCircleOutlined /> {isHotel
                ? 'This is a request. We will check hotel availability and confirm.'
                : 'No payment required today. Secure your spot now.'}
            </p>
          </div>
        </div>
      </div>
    </BrandPackageModalShell>
  );
};

/** Quick-stat chip used in the details column. */
const StatChip = ({ icon, children }) => (
  <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 shadow-sm">
    {icon}<span>{children}</span>
  </div>
);

/** Small +/- stepper used for guests and nights. */
const Stepper = ({ label, value, min, max, onChange }) => {
  const dec = () => onChange(Math.max(min, value - 1));
  const inc = () => onChange(Math.min(max, value + 1));
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-[11px] uppercase tracking-wider font-duotone-bold text-slate-500 mb-2">{label}</p>
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={dec}
          disabled={value <= min}
          className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 active:scale-[0.94] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center text-slate-700 transition-[transform,background-color]"
        >
          <MinusOutlined className="text-xs" />
        </button>
        <span className="text-xl font-duotone-bold-extended text-slate-900">{value}</span>
        <button
          onClick={inc}
          disabled={value >= max}
          className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 active:scale-[0.94] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center text-slate-700 transition-[transform,background-color]"
        >
          <PlusOutlined className="text-xs" />
        </button>
      </div>
    </div>
  );
};

export default StayAccommodationModal;
