import { useState, useEffect, useMemo } from 'react';
import { Button, Image, Tag } from 'antd';
import BrandPackageModalShell from './BrandPackageModalShell';
import {
  CheckOutlined,
  LeftOutlined,
  RightOutlined,
  RocketOutlined,
  StarFilled,
  ThunderboltFilled,
  PictureOutlined,
  CalendarOutlined,
  TeamOutlined,
  EnvironmentOutlined,
  ClockCircleOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import { useCurrency } from '@/shared/contexts/CurrencyContext';

const EXPERIENCE_TYPE_LABELS = {
  all_inclusive: 'All Inclusive',
  lesson_rental: 'Lessons + Rental',
  accommodation_lesson: 'Lessons + Stay',
  accommodation_rental: 'Rental + Stay',
  downwinders: 'Downwinders',
  camps: 'Camps',
  lesson: 'Lessons',
  rental: 'Rental',
  accommodation: 'Stay',
};

const normalize = (v) => String(v || '').toLowerCase();

const pkgIncludesStay = (pkg) => {
  if (!pkg) return false;
  if (pkg.includesAccommodation === true || pkg.includes_accommodation === true) return true;
  const unitId = pkg.accommodationUnitId ?? pkg.accommodation_unit_id;
  if (unitId != null && String(unitId).trim() !== '') return true;
  const nights = Number(pkg.accommodationNights ?? pkg.accommodation_nights);
  return Number.isFinite(nights) && nights > 0;
};

const toImageArray = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.filter(Boolean);
      if (parsed) return [parsed];
      return [];
    } catch {
      return value.trim() ? [value.trim()] : [];
    }
  }
  return [];
};

const getFallbackImage = (disciplineKey) => {
  if (disciplineKey === 'wing') return '/Images/ukc/wing-header.png';
  if (disciplineKey === 'downwinders') return '/Images/ukc/rebel-dlab-header.jpg';
  if (disciplineKey === 'camps') return '/Images/ukc/team.png';
  return '/Images/ukc/kite-header.jpg.png';
};

/**
 * Full-page-style detail modal for Experience packages.
 * Same two-panel layout as StayAccommodationModal but with amber/yellow theming.
 *
 * Props:
 *   pkg            – selected experience package object
 *   visible        – boolean
 *   onClose        – callback
 *   onBuy          – callback(pkg) to trigger purchase
 *   disciplineKey  – string for fallback image selection
 */
const ExperienceDetailModal = ({ pkg = null, visible, onClose, onBuy, disciplineKey }) => {
  const { formatCurrency, convertCurrency, userCurrency } = useCurrency();

  const [photoIndex, setPhotoIndex] = useState(0);
  const [itineraryExpanded, setItineraryExpanded] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);

  // Reset on open
  useEffect(() => {
    if (visible) {
      setPhotoIndex(0);
      setItineraryExpanded(false);
      setPreviewVisible(false);
      setPreviewIndex(0);
    }
  }, [visible, pkg?.id]);

  const fallback = getFallbackImage(disciplineKey);
  /** Stay bundles: accommodation gallery only (no service/package marketing image). */
  const displayImages = useMemo(() => {
    if (!pkg) return [fallback];
    const accomCoverUrl = pkg.accommodationImageUrl || pkg.accommodation_image_url;
    const accomCover = accomCoverUrl ? [accomCoverUrl] : [];
    const accomGallery = toImageArray(pkg.accommodationImages || pkg.accommodation_images);
    const accomOnly = [...accomCover, ...accomGallery].filter(Boolean);
    let list;
    if (pkgIncludesStay(pkg)) {
      list = Array.from(new Set(accomOnly));
    } else {
      const pkgCoverUrl = pkg.imageUrl || pkg.image_url;
      const pkgCover = pkgCoverUrl ? [pkgCoverUrl] : [];
      list = Array.from(new Set([...accomOnly, ...pkgCover].filter(Boolean)));
    }
    return list.length > 0 ? list : [fallback];
  }, [pkg, fallback]);

  useEffect(() => {
    setPhotoIndex((i) => (displayImages.length ? Math.min(i, displayImages.length - 1) : 0));
    setPreviewIndex((i) => (displayImages.length ? Math.min(i, displayImages.length - 1) : 0));
  }, [displayImages]);

  const formatPrice = (eurPrice) => {
    const eurFormatted = formatCurrency(eurPrice, 'EUR');
    if (!userCurrency || userCurrency === 'EUR') return eurFormatted;
    const converted = convertCurrency(eurPrice, 'EUR', userCurrency);
    return `${eurFormatted} (~${formatCurrency(converted, userCurrency)})`;
  };

  const hasGallery = displayImages.length > 1;

  /** Ant Design preview mounts below our portal modal (z-[1050]) unless raised */
  const galleryPreviewConfig = {
    visible: previewVisible,
    current: previewIndex,
    onVisibleChange: (v) => setPreviewVisible(v),
    onChange: (idx) => setPreviewIndex(idx),
    zIndex: 1200,
    getContainer: () => document.body,
  };

  const prevPhoto = (e) => {
    e.stopPropagation();
    setPhotoIndex((i) => (i - 1 + displayImages.length) % displayImages.length);
  };
  const nextPhoto = (e) => {
    e.stopPropagation();
    setPhotoIndex((i) => (i + 1) % displayImages.length);
  };

  if (!pkg) return null;

  const isEvent = normalize(pkg.packageType) === 'downwinders' || normalize(pkg.packageType) === 'camps';
  const bundleType = pkg.bundleType || normalize(pkg.packageType);
  const typeLabel = EXPERIENCE_TYPE_LABELS[bundleType] || 'Experience';

  const itineraryPreview = (() => {
    if (!pkg.itinerary) return '';
    const text = pkg.itinerary;
    const day2Index = text.toLowerCase().indexOf('day 2');
    if (day2Index > 0) return text.substring(0, day2Index).trim();
    return text.length > 300 ? text.substring(0, 300) + '...' : text;
  })();

  const stays = pkgIncludesStay(pkg);

  return (
    <BrandPackageModalShell
      open={visible}
      onClose={onClose}
      animationKey={pkg.id}
      ariaLabelledBy="experience-detail-modal-title"
      maxWidthClass="max-w-[1040px]"
    >
      <div className="flex flex-col lg:flex-row min-h-0 w-full">
          {/* ── LEFT: Gallery + Details (same sections as before; chrome matches package modal) ── */}
          <div className="lg:w-[60%] bg-slate-50 flex flex-col min-h-0 pkg-modal-scroll">

            {/* Photo gallery */}
            <div className="relative shrink-0 aspect-[5/4] max-h-[22rem] sm:max-h-[24rem] lg:max-h-[26rem] overflow-hidden">
              {/* Hidden preview group — enables full-screen lightbox */}
              <div className="hidden">
                <Image.PreviewGroup preview={galleryPreviewConfig}>
                  {displayImages.map((src) => (
                    <Image key={src} src={src} />
                  ))}
                </Image.PreviewGroup>
              </div>

              <img
                key={displayImages[photoIndex]}
                src={displayImages[photoIndex]}
                alt={`${pkg.name} – photo ${photoIndex + 1}`}
                className="absolute inset-0 w-full h-full object-cover transition-opacity duration-300 cursor-zoom-in"
                loading="eager"
                onClick={() => { setPreviewIndex(photoIndex); setPreviewVisible(true); }}
                onError={(e) => {
                  if (e.target.src !== fallback) { e.target.src = fallback; }
                }}
              />
              {/* Thin bottom fog — matches package modal; keeps gallery image visible */}
              <div
                className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-20 max-h-[22%] sm:h-24 sm:max-h-[20%] md:h-28 md:max-h-[18%] bg-gradient-to-t from-slate-50 via-slate-50/25 to-transparent"
                aria-hidden
              />

              {/* Arrows */}
              {hasGallery && (
                <>
                  <button
                    onClick={prevPhoto}
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center text-white transition-colors z-20 backdrop-blur-sm"
                  >
                    <LeftOutlined className="text-xs" />
                  </button>
                  <button
                    onClick={nextPhoto}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center text-white transition-colors z-20 backdrop-blur-sm"
                  >
                    <RightOutlined className="text-xs" />
                  </button>
                </>
              )}

              {/* Dots */}
              {hasGallery && (
                <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5 z-20">
                  {displayImages.map((img, i) => (
                    <button
                      key={img}
                      onClick={(e) => { e.stopPropagation(); setPhotoIndex(i); }}
                      className={`w-1.5 h-1.5 rounded-full transition-all ${i === photoIndex ? 'w-4 bg-[#00a8c4]' : 'bg-white/40'}`}
                    />
                  ))}
                </div>
              )}

              {/* Counter — left side so it does not overlap shell close */}
              {hasGallery && (
                <div className="absolute top-14 left-2.5 px-2 py-0.5 rounded-full bg-black/45 backdrop-blur-sm text-white text-[10px] flex items-center gap-1 z-20">
                  <PictureOutlined className="text-[10px]" /> {photoIndex + 1}/{displayImages.length}
                </div>
              )}

              {/* Title overlay — compact so more of the photo stays visible */}
              <div className="absolute bottom-3 left-3 z-10 pr-10 max-w-[min(100%,18rem)] sm:bottom-4 sm:left-4 sm:max-w-[min(100%,20rem)]">
                <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-duotone-bold uppercase tracking-wider mb-1.5 border border-cyan-500/40 bg-cyan-500/15 text-cyan-100">
                  {typeLabel}
                </div>
                <h2 id="experience-detail-modal-title" className="text-lg sm:text-xl font-duotone-bold-extended text-white leading-snug drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]">
                  {pkg.name}
                </h2>
              </div>

              {/* Featured badge */}
              {pkg.featured && (
                <div className="absolute top-2.5 left-2.5 bg-white/95 backdrop-blur-md text-slate-900 px-2 py-0.5 rounded-full text-[10px] font-duotone-bold shadow-md flex items-center gap-0.5 z-20 border border-slate-200">
                  <StarFilled className="text-[10px] text-yellow-500" /> FEATURED
                </div>
              )}
            </div>

            {/* Thumbnail strip */}
            {displayImages.length > 1 && (
              <div className="flex gap-2 px-4 pt-3 overflow-x-auto scrollbar-thin">
                {displayImages.map((img, i) => (
                  <button
                    key={img}
                    onClick={() => setPhotoIndex(i)}
                    className={`shrink-0 w-14 h-10 rounded-lg overflow-hidden border-2 transition-all ${i === photoIndex ? 'border-[#00a8c4] opacity-100' : 'border-transparent opacity-50 hover:opacity-80'}`}
                  >
                    <img src={img} alt="" className="w-full h-full object-cover" onError={(e) => { e.target.parentElement.style.display = 'none'; }} />
                  </button>
                ))}
              </div>
            )}

            {/* Details */}
            <div className="p-5 flex-grow overflow-y-auto pkg-modal-scroll">
              {/* Quick stats */}
              <div className="flex flex-wrap gap-3 mb-5">
                {pkg.totalHours > 0 && (
                  <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 shadow-sm">
                    <ClockCircleOutlined className="text-[#00a8c4]" />
                    <span><strong className="text-slate-900">{Math.round(Number(pkg.totalHours))}h</strong> lessons</span>
                  </div>
                )}
                {pkg.accommodationNights > 0 && (
                  <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 shadow-sm">
                    <CalendarOutlined className="text-[#00a8c4]" />
                    <span><strong className="text-slate-900">{pkg.accommodationNights}</strong> nights</span>
                  </div>
                )}
                {pkg.rentalDays > 0 && (
                  <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 shadow-sm">
                    <ThunderboltFilled className="text-[#00a8c4]" />
                    <span><strong className="text-slate-900">{pkg.rentalDays}</strong> rental days</span>
                  </div>
                )}
                {pkg.maxParticipants > 0 && (
                  <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 shadow-sm">
                    <TeamOutlined className="text-[#00a8c4]" />
                    <span>Max <strong className="text-slate-900">{pkg.maxParticipants}</strong> riders</span>
                  </div>
                )}
              </div>

              {/* Description */}
              {pkg.description && (
                <p className="text-slate-600 text-sm font-duotone-regular leading-relaxed mb-5">{pkg.description}</p>
              )}

              {/* Includes badges */}
              <div className="flex flex-wrap gap-2 mb-5">
                {pkg.includesLessons !== false && <Tag className="!bg-emerald-500/10 !border-emerald-500/30 !text-emerald-800 !rounded-full">Lessons</Tag>}
                {!!pkg.includesRental && <Tag className="!bg-orange-500/10 !border-orange-500/30 !text-orange-800 !rounded-full">Rental</Tag>}
                {stays && <Tag className="!bg-sky-500/10 !border-sky-500/30 !text-sky-800 !rounded-full">Stay</Tag>}
              </div>

              {/* Event-specific details */}
              {isEvent && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
                  {pkg.departureLocation && (
                    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <p className="text-slate-500 text-xs uppercase tracking-wide mb-1 font-duotone-regular">Departure</p>
                      <p className="text-slate-900 text-sm font-medium font-duotone-regular">{pkg.departureLocation}</p>
                    </div>
                  )}
                  {pkg.destinationLocation && (
                    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <p className="text-slate-500 text-xs uppercase tracking-wide mb-1 font-duotone-regular">Destination</p>
                      <p className="text-slate-900 text-sm font-medium font-duotone-regular">{pkg.destinationLocation}</p>
                    </div>
                  )}
                  {pkg.eventLocation && (
                    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <p className="text-slate-500 text-xs uppercase tracking-wide mb-1 flex items-center gap-1 font-duotone-regular"><EnvironmentOutlined /> Location</p>
                      <p className="text-slate-900 text-sm font-medium font-duotone-regular">{pkg.eventLocation}</p>
                    </div>
                  )}
                  {pkg.minSkillLevel && (
                    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <p className="text-slate-500 text-xs uppercase tracking-wide mb-1 font-duotone-regular">Skill Level</p>
                      <p className="text-slate-900 text-sm font-medium capitalize font-duotone-regular">{pkg.minSkillLevel}</p>
                    </div>
                  )}
                  {(pkg.eventStartDate || pkg.eventEndDate) && (
                    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:col-span-2">
                      <p className="text-slate-500 text-xs uppercase tracking-wide mb-1 font-duotone-regular">Event Dates</p>
                      <p className="text-slate-900 text-sm font-medium font-duotone-regular">
                        {pkg.eventStartDate && new Date(pkg.eventStartDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        {pkg.eventStartDate && pkg.eventEndDate && ' → '}
                        {pkg.eventEndDate && new Date(pkg.eventEndDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Regular package service details */}
              {!isEvent && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
                  {pkg.includesLessons && pkg.lessonServiceName && (
                    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <p className="text-slate-500 text-xs uppercase tracking-wide mb-1 font-duotone-regular">Lesson Service</p>
                      <p className="text-slate-900 text-sm font-medium font-duotone-regular">{pkg.lessonServiceName}</p>
                    </div>
                  )}
                  {stays && pkg.accommodationUnitName && (
                    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <p className="text-slate-500 text-xs uppercase tracking-wide mb-1 font-duotone-regular">Accommodation</p>
                      <p className="text-slate-900 text-sm font-medium font-duotone-regular">{pkg.accommodationUnitName}</p>
                    </div>
                  )}
                  {pkg.includesRental && (pkg.rentalServiceName || pkg.equipmentName) && (
                    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <p className="text-slate-500 text-xs uppercase tracking-wide mb-1 font-duotone-regular">Rental Option</p>
                      <p className="text-slate-900 text-sm font-medium font-duotone-regular">{pkg.rentalServiceName || pkg.equipmentName}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Itinerary */}
              {isEvent && pkg.itinerary && (
                <div>
                  <h4 className="text-slate-900 font-duotone-bold-extended mb-3 flex items-center gap-2 text-sm uppercase tracking-wide">
                    <ThunderboltFilled className="text-[#00a8c4]" /> Itinerary
                  </h4>
                  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <pre className="text-slate-700 whitespace-pre-wrap font-sans text-sm leading-relaxed mb-0 font-duotone-regular">
                      {itineraryExpanded ? pkg.itinerary : itineraryPreview}
                    </pre>
                    {(pkg.itinerary.toLowerCase().includes('day 2') || pkg.itinerary.length > 300) && (
                      <Button
                        type="link"
                        onClick={() => setItineraryExpanded(!itineraryExpanded)}
                        className="!p-0 !mt-3 !text-[#00a8c4] hover:!text-[#0088a0]"
                      >
                        {itineraryExpanded ? 'Show Less' : 'Read Full Itinerary'}
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── RIGHT: Booking Panel (unchanged feature set; styling aligned with package modal) ── */}
          <div className="lg:w-[40%] bg-white border-t border-slate-100 lg:border-t-0 lg:border-l lg:border-slate-100 p-5 sm:p-6 lg:p-8 flex flex-col min-h-0 pkg-modal-scroll">
            <h3 className="text-lg sm:text-xl font-duotone-bold-extended text-slate-900 mb-5 flex items-center gap-2">
              <RocketOutlined className="text-[#00a8c4]" /> Package Details
            </h3>

            {/* What's included breakdown */}
            <div className="space-y-3 mb-6">
              {pkg.includesLessons !== false && (
                <div className="flex items-start gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-4">
                  <div className="w-8 h-8 rounded-full bg-emerald-500/15 flex items-center justify-center shrink-0 mt-0.5">
                    <CheckOutlined className="text-emerald-600 text-xs" />
                  </div>
                  <div>
                    <p className="text-slate-900 text-sm font-duotone-bold">Lessons Included</p>
                    <p className="text-slate-600 text-xs mt-0.5 font-duotone-regular">
                      {pkg.totalHours ? `${Math.round(Number(pkg.totalHours))} hours of professional instruction` : pkg.lessonServiceName || 'Professional instruction'}
                    </p>
                  </div>
                </div>
              )}
              {stays && (
                <div className="flex items-start gap-3 rounded-xl border border-sky-500/25 bg-sky-500/[0.06] p-4">
                  <div className="w-8 h-8 rounded-full bg-sky-500/15 flex items-center justify-center shrink-0 mt-0.5">
                    <CheckOutlined className="text-sky-600 text-xs" />
                  </div>
                  <div>
                    <p className="text-slate-900 text-sm font-duotone-bold">Accommodation</p>
                    <p className="text-slate-600 text-xs mt-0.5 font-duotone-regular">
                      {pkg.accommodationNights ? `${pkg.accommodationNights} night${pkg.accommodationNights !== 1 ? 's' : ''} stay` : pkg.accommodationUnitName || 'Stay included'}
                    </p>
                  </div>
                </div>
              )}
              {!!pkg.includesRental && (
                <div className="flex items-start gap-3 rounded-xl border border-orange-500/25 bg-orange-500/[0.06] p-4">
                  <div className="w-8 h-8 rounded-full bg-orange-500/15 flex items-center justify-center shrink-0 mt-0.5">
                    <CheckOutlined className="text-orange-600 text-xs" />
                  </div>
                  <div>
                    <p className="text-slate-900 text-sm font-duotone-bold">Equipment Rental</p>
                    <p className="text-slate-600 text-xs mt-0.5 font-duotone-regular">
                      {pkg.rentalDays ? `${pkg.rentalDays} rental day${pkg.rentalDays !== 1 ? 's' : ''}` : pkg.rentalServiceName || 'Equipment included'}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Spacer */}
            <div className="flex-grow min-h-4" />

            {/* Booking summary */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5 mt-4 shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <p className="text-slate-500 text-xs uppercase tracking-wider font-duotone-bold">Package Price</p>
                  <p className="text-slate-400 text-xs font-duotone-regular">{typeLabel}</p>
                </div>
                <div className="text-right">
                  <span className="text-2xl sm:text-3xl font-duotone-bold-extended text-slate-900 tracking-tight">
                    {formatPrice(Number(pkg.price) || 0)}
                  </span>
                </div>
              </div>

              <Button
                block
                size="large"
                type="primary"
                icon={<RocketOutlined />}
                onClick={() => onBuy(pkg)}
                className="!h-12 sm:!h-14 !rounded-xl !text-base sm:!text-lg font-duotone-bold shadow-md transition-transform hover:scale-[1.01] active:scale-[0.99]"
                style={{
                  backgroundColor: '#4b4f54',
                  color: '#00a8c4',
                  border: '1px solid rgba(0,168,196,0.5)',
                  boxShadow: '0 0 12px rgba(0,168,196,0.25)',
                }}
              >
                Buy This Package
              </Button>
              <p className="text-center text-slate-400 text-[10px] mt-3 flex items-center justify-center gap-1 font-duotone-regular">
                <InfoCircleOutlined /> No payment required today. Secure your spot now.
              </p>
            </div>
          </div>
        </div>
    </BrandPackageModalShell>
  );
};

export default ExperienceDetailModal;
