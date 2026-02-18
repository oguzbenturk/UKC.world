import { useState, useEffect, useMemo } from 'react';
import { Button, Image, Modal, Tag } from 'antd';
import {
  CheckOutlined,
  CloseOutlined,
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

  const formatPrice = (eurPrice) => {
    const converted = convertCurrency(eurPrice, 'EUR', userCurrency);
    return formatCurrency(converted, userCurrency);
  };

  // ─── Images ──────────────────────────────────────────────────────────────────
  // Prefer the linked accommodation unit's images (same photos as hotel/home modal).
  // Fall back to the package's own cover image, then discipline fallback.
  const allImages = useMemo(() => {
    if (!pkg) return [];
    // Accommodation unit images — highest priority (linked room/unit photos)
    const accomCover = pkg.accommodationImageUrl ? [pkg.accommodationImageUrl] : [];
    const accomGallery = toImageArray(pkg.accommodationImages);
    // Package's own cover image — used when no accommodation unit is linked
    const pkgCover = pkg.imageUrl ? [pkg.imageUrl] : [];
    const merged = [...accomCover, ...accomGallery, ...pkgCover].filter(Boolean);
    return Array.from(new Set(merged));
  }, [pkg]);

  const fallback = getFallbackImage(disciplineKey);
  const displayImages = allImages.length > 0 ? allImages : [fallback];
  const hasGallery = displayImages.length > 1;

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

  return (
    <Modal
      open={visible}
      onCancel={onClose}
      footer={null}
      width={1000}
      centered
      destroyOnHidden
      className="experience-detail-modal"
      closeIcon={
        <div className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors">
          <CloseOutlined />
        </div>
      }
      styles={{
        content: {
          backgroundColor: '#13151a',
          border: '1px solid rgba(255,255,255,0.08)',
          padding: 0,
          borderRadius: '24px',
          overflow: 'hidden',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.6)',
        },
        body: { padding: 0, maxHeight: '92vh', overflowY: 'auto' },
      }}
    >
      <div className="flex flex-col lg:flex-row">
          {/* ── LEFT: Gallery + Details ─────────────────────────────────── */}
          <div className="lg:w-[55%] bg-[#0f1013] flex flex-col overflow-y-auto">

            {/* Photo gallery */}
            <div className="relative shrink-0 aspect-[4/3] max-h-72 lg:max-h-80 overflow-hidden">
              {/* Hidden preview group — enables full-screen lightbox */}
              <div className="hidden">
                <Image.PreviewGroup
                  preview={{
                    visible: previewVisible,
                    current: previewIndex,
                    onVisibleChange: (v) => setPreviewVisible(v),
                    onChange: (idx) => setPreviewIndex(idx),
                  }}
                >
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
              {/* Gradient */}
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/20 to-[#0f1013]" />

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
                      className={`w-1.5 h-1.5 rounded-full transition-all ${i === photoIndex ? 'bg-amber-400 w-4' : 'bg-white/40'}`}
                    />
                  ))}
                </div>
              )}

              {/* Counter */}
              {hasGallery && (
                <div className="absolute top-3 right-12 px-2.5 py-1 rounded-full bg-black/50 backdrop-blur-sm text-white text-xs flex items-center gap-1.5 z-20">
                  <PictureOutlined /> {photoIndex + 1} / {displayImages.length}
                </div>
              )}

              {/* Close button */}
              <button
                onClick={onClose}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center text-white transition-colors z-20 backdrop-blur-sm"
              >
                <CloseOutlined className="text-xs" />
              </button>

              {/* Title overlay */}
              <div className="absolute bottom-4 left-4 z-10 pr-12">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-2 bg-amber-500/10 text-amber-400">
                  {typeLabel}
                </div>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-white leading-tight drop-shadow-lg">
                  {pkg.name}
                </h2>
              </div>

              {/* Featured badge */}
              {pkg.featured && (
                <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-md text-black px-3 py-1 rounded-full text-xs font-bold shadow-lg flex items-center gap-1 z-20">
                  <StarFilled className="text-yellow-500" /> FEATURED
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
                    className={`shrink-0 w-14 h-10 rounded-lg overflow-hidden border-2 transition-all ${i === photoIndex ? 'border-amber-500 opacity-100' : 'border-transparent opacity-50 hover:opacity-80'}`}
                  >
                    <img src={img} alt="" className="w-full h-full object-cover" onError={(e) => { e.target.parentElement.style.display = 'none'; }} />
                  </button>
                ))}
              </div>
            )}

            {/* Details */}
            <div className="p-5 flex-grow overflow-y-auto">
              {/* Quick stats */}
              <div className="flex flex-wrap gap-3 mb-5">
                {pkg.totalHours > 0 && (
                  <div className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2 text-sm text-gray-300">
                    <ClockCircleOutlined className="text-amber-400" />
                    <span><strong className="text-white">{Math.round(Number(pkg.totalHours))}h</strong> lessons</span>
                  </div>
                )}
                {pkg.accommodationNights > 0 && (
                  <div className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2 text-sm text-gray-300">
                    <CalendarOutlined className="text-amber-400" />
                    <span><strong className="text-white">{pkg.accommodationNights}</strong> nights</span>
                  </div>
                )}
                {pkg.rentalDays > 0 && (
                  <div className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2 text-sm text-gray-300">
                    <ThunderboltFilled className="text-amber-400" />
                    <span><strong className="text-white">{pkg.rentalDays}</strong> rental days</span>
                  </div>
                )}
                {pkg.maxParticipants > 0 && (
                  <div className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2 text-sm text-gray-300">
                    <TeamOutlined className="text-amber-400" />
                    <span>Max <strong className="text-white">{pkg.maxParticipants}</strong> riders</span>
                  </div>
                )}
              </div>

              {/* Description */}
              {pkg.description && (
                <p className="text-gray-400 text-sm leading-relaxed mb-5">{pkg.description}</p>
              )}

              {/* Includes badges */}
              <div className="flex flex-wrap gap-2 mb-5">
                {pkg.includesLessons !== false && <Tag className="!bg-emerald-500/10 !border-emerald-500/30 !text-emerald-300 !rounded-full">Lessons</Tag>}
                {!!pkg.includesRental && <Tag className="!bg-orange-500/10 !border-orange-500/30 !text-orange-300 !rounded-full">Rental</Tag>}
                {!!pkg.includesAccommodation && <Tag className="!bg-blue-500/10 !border-blue-500/30 !text-blue-300 !rounded-full">Accommodation</Tag>}
              </div>

              {/* Event-specific details */}
              {isEvent && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
                  {pkg.departureLocation && (
                    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                      <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Departure</p>
                      <p className="text-white text-sm font-medium">{pkg.departureLocation}</p>
                    </div>
                  )}
                  {pkg.destinationLocation && (
                    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                      <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Destination</p>
                      <p className="text-white text-sm font-medium">{pkg.destinationLocation}</p>
                    </div>
                  )}
                  {pkg.eventLocation && (
                    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                      <p className="text-gray-400 text-xs uppercase tracking-wide mb-1 flex items-center gap-1"><EnvironmentOutlined /> Location</p>
                      <p className="text-white text-sm font-medium">{pkg.eventLocation}</p>
                    </div>
                  )}
                  {pkg.minSkillLevel && (
                    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                      <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Skill Level</p>
                      <p className="text-white text-sm font-medium capitalize">{pkg.minSkillLevel}</p>
                    </div>
                  )}
                  {(pkg.eventStartDate || pkg.eventEndDate) && (
                    <div className="rounded-xl border border-white/10 bg-white/5 p-4 sm:col-span-2">
                      <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Event Dates</p>
                      <p className="text-white text-sm font-medium">
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
                    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                      <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Lesson Service</p>
                      <p className="text-white text-sm font-medium">{pkg.lessonServiceName}</p>
                    </div>
                  )}
                  {pkg.includesAccommodation && pkg.accommodationUnitName && (
                    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                      <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Accommodation</p>
                      <p className="text-white text-sm font-medium">{pkg.accommodationUnitName}</p>
                    </div>
                  )}
                  {pkg.includesRental && (pkg.rentalServiceName || pkg.equipmentName) && (
                    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                      <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Rental Option</p>
                      <p className="text-white text-sm font-medium">{pkg.rentalServiceName || pkg.equipmentName}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Itinerary */}
              {isEvent && pkg.itinerary && (
                <div>
                  <h4 className="text-white font-bold mb-3 flex items-center gap-2 text-sm uppercase tracking-wide">
                    <ThunderboltFilled className="text-amber-500" /> Itinerary
                  </h4>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <pre className="text-gray-200 whitespace-pre-wrap font-sans text-sm leading-relaxed mb-0">
                      {itineraryExpanded ? pkg.itinerary : itineraryPreview}
                    </pre>
                    {(pkg.itinerary.toLowerCase().includes('day 2') || pkg.itinerary.length > 300) && (
                      <Button
                        type="link"
                        onClick={() => setItineraryExpanded(!itineraryExpanded)}
                        className="!p-0 !mt-3 !text-amber-400 hover:!text-amber-300"
                      >
                        {itineraryExpanded ? 'Show Less' : 'Read Full Itinerary'}
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── RIGHT: Booking Panel ─────────────────────────────────────── */}
          <div className="lg:w-[45%] bg-[#13151a] p-5 sm:p-6 lg:p-8 flex flex-col">
            <h3 className="text-lg sm:text-xl font-bold text-white mb-5 flex items-center gap-2">
              <RocketOutlined className="text-amber-400" /> Package Details
            </h3>

            {/* What's included breakdown */}
            <div className="space-y-3 mb-6">
              {pkg.includesLessons !== false && (
                <div className="flex items-start gap-3 bg-emerald-500/5 border border-emerald-500/15 rounded-xl p-4">
                  <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0 mt-0.5">
                    <CheckOutlined className="text-emerald-400 text-xs" />
                  </div>
                  <div>
                    <p className="text-white text-sm font-semibold">Lessons Included</p>
                    <p className="text-gray-400 text-xs mt-0.5">
                      {pkg.totalHours ? `${Math.round(Number(pkg.totalHours))} hours of professional instruction` : pkg.lessonServiceName || 'Professional instruction'}
                    </p>
                  </div>
                </div>
              )}
              {!!pkg.includesAccommodation && (
                <div className="flex items-start gap-3 bg-blue-500/5 border border-blue-500/15 rounded-xl p-4">
                  <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0 mt-0.5">
                    <CheckOutlined className="text-blue-400 text-xs" />
                  </div>
                  <div>
                    <p className="text-white text-sm font-semibold">Accommodation</p>
                    <p className="text-gray-400 text-xs mt-0.5">
                      {pkg.accommodationNights ? `${pkg.accommodationNights} night${pkg.accommodationNights !== 1 ? 's' : ''} stay` : pkg.accommodationUnitName || 'Stay included'}
                    </p>
                  </div>
                </div>
              )}
              {!!pkg.includesRental && (
                <div className="flex items-start gap-3 bg-orange-500/5 border border-orange-500/15 rounded-xl p-4">
                  <div className="w-8 h-8 rounded-full bg-orange-500/10 flex items-center justify-center shrink-0 mt-0.5">
                    <CheckOutlined className="text-orange-400 text-xs" />
                  </div>
                  <div>
                    <p className="text-white text-sm font-semibold">Equipment Rental</p>
                    <p className="text-gray-400 text-xs mt-0.5">
                      {pkg.rentalDays ? `${pkg.rentalDays} rental day${pkg.rentalDays !== 1 ? 's' : ''}` : pkg.rentalServiceName || 'Equipment included'}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Spacer */}
            <div className="flex-grow" />

            {/* Booking summary */}
            <div className="bg-[#0f1013] rounded-2xl p-4 sm:p-5 border border-white/5 mt-4">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <p className="text-gray-400 text-xs uppercase tracking-wider font-semibold">Package Price</p>
                  <p className="text-gray-500 text-xs">{typeLabel}</p>
                </div>
                <div className="text-right">
                  <span className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
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
                className="!h-12 sm:!h-14 !rounded-xl !text-base sm:!text-lg !font-bold !border-none shadow-lg transition-transform active:scale-95 !bg-gradient-to-r !from-amber-500 !to-yellow-400 !text-black hover:!from-amber-400 hover:!to-yellow-300"
              >
                Buy This Package
              </Button>
              <p className="text-center text-gray-600 text-[10px] mt-3 flex items-center justify-center gap-1">
                <InfoCircleOutlined /> No payment required today. Secure your spot now.
              </p>
            </div>
          </div>
        </div>

      <style>{`
        .experience-detail-modal .ant-modal-content { padding: 0; background: transparent; }
        .experience-detail-modal ::-webkit-scrollbar { width: 4px; }
        .experience-detail-modal ::-webkit-scrollbar-track { background: transparent; }
        .experience-detail-modal ::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.1);
          border-radius: 10px;
        }
        .experience-detail-modal ::-webkit-scrollbar-thumb:hover {
          background: rgba(255,255,255,0.2);
        }
      `}</style>
    </Modal>
  );
};

export default ExperienceDetailModal;
