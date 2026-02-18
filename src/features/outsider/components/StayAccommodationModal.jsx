import { useState, useEffect } from 'react';
import { Button, Modal, Tag } from 'antd';
import {
  CheckOutlined,
  CloseOutlined,
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
import { useCurrency } from '@/shared/contexts/CurrencyContext';

const themeColors = {
  blue:   { text: 'text-blue-400',   bg: 'bg-blue-500',   border: 'border-blue-500',   soft: 'bg-blue-500/10'   },
  cyan:   { text: 'text-cyan-400',   bg: 'bg-cyan-500',   border: 'border-cyan-500',   soft: 'bg-cyan-500/10'   },
  purple: { text: 'text-purple-400', bg: 'bg-purple-500', border: 'border-purple-500', soft: 'bg-purple-500/10' },
  green:  { text: 'text-green-400',  bg: 'bg-green-500',  border: 'border-green-500',  soft: 'bg-green-500/10'  },
};

const toTitle = (v) =>
  String(v || '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();

/**
 * Dedicated modal for Stay pages (stay_home / stay_hotel).
 * Shows a photo gallery, room details, amenities and booking selector.
 *
 * Props:
 *   unit        – raw accommodation unit object from the API
 *   pkg         – card data object built by buildAccommodationUnitCards()
 *   visible     – boolean
 *   onClose     – callback
 */
const StayAccommodationModal = ({ unit = {}, pkg = {}, visible, onClose }) => {
  const { formatCurrency, convertCurrency, userCurrency } = useCurrency();
  const [photoIndex, setPhotoIndex] = useState(0);
  const [selectedKey, setSelectedKey] = useState('1night');
  const [customNights, setCustomNights] = useState(3);

  const theme = themeColors[pkg.color] || themeColors.blue;
  const pricePerNight = pkg.pricePerNight || parseFloat(unit.price_per_night || 0);
  const durations = pkg.durations || [];

  // Reset state whenever the modal opens for a new unit
  useEffect(() => {
    if (visible) {
      setPhotoIndex(0);
      setSelectedKey('1night');
      setCustomNights(3);
    }
  }, [visible, pkg.id]);

  // ─── Images ──────────────────────────────────────────────────────────────
  const rawImages = Array.isArray(unit.images) ? unit.images : [];
  const primaryImage = unit.image_url || null;
  const allImages = [
    ...(primaryImage ? [primaryImage] : []),
    ...rawImages.filter((img) => img !== primaryImage),
  ].filter(Boolean);
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
  const amenities = (() => {
    if (Array.isArray(unit.amenities)) return unit.amenities;
    if (typeof unit.amenities === 'string') {
      try { return JSON.parse(unit.amenities); } catch { return []; }
    }
    return [];
  })();

  // ─── Price helpers ────────────────────────────────────────────────────────
  const formatPrice = (eurPrice) => {
    const converted = convertCurrency(eurPrice, 'EUR', userCurrency);
    return formatCurrency(converted, userCurrency);
  };

  const getCurrentPrice = () => {
    if (selectedKey === 'custom') return pricePerNight * customNights;
    const dur = durations.find((d) => d.key === selectedKey);
    return dur ? dur.price : 0;
  };

  const getCurrentSessions = () => {
    if (selectedKey === 'custom') return `${customNights} night${customNights !== 1 ? 's' : ''}`;
    const dur = durations.find((d) => d.key === selectedKey);
    return dur?.sessions || '—';
  };

  const handleClose = () => {
    onClose();
  };

  return (
    <Modal
      open={visible}
      onCancel={handleClose}
      footer={null}
      width={1000}
      centered
      className="stay-accommodation-modal"
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
        {/* ── LEFT: Gallery + Details ── */}
        <div className="lg:w-[55%] bg-[#0f1013] flex flex-col">

          {/* Photo Gallery */}
          <div className="relative shrink-0 aspect-[4/3] max-h-72 lg:max-h-80 overflow-hidden">
            {allImages.length > 0 ? (
              <>
                <img
                  key={allImages[photoIndex]}
                  src={allImages[photoIndex]}
                  alt={`${pkg.name || 'Room'} – photo ${photoIndex + 1}`}
                  className="absolute inset-0 w-full h-full object-cover transition-opacity duration-300"
                  loading="eager"
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
                {/* Gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/20 to-[#0f1013]" />

                {/* Prev / Next arrows */}
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

                {/* Dot indicators */}
                {hasGallery && (
                  <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5 z-20">
                    {allImages.map((_, i) => (
                      <button
                        key={i}
                        onClick={(e) => { e.stopPropagation(); setPhotoIndex(i); }}
                        className={`w-1.5 h-1.5 rounded-full transition-all ${i === photoIndex ? 'bg-white w-4' : 'bg-white/40'}`}
                      />
                    ))}
                  </div>
                )}

                {/* Photo counter badge */}
                {hasGallery && (
                  <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-black/50 backdrop-blur-sm text-white text-xs flex items-center gap-1.5 z-20">
                    <PictureOutlined /> {photoIndex + 1} / {allImages.length}
                  </div>
                )}
              </>
            ) : (
              /* No images placeholder */
              <div className={`absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br ${pkg.gradient || 'from-gray-700 to-gray-900'}`}>
                <HomeOutlined className="text-5xl text-white/30 mb-2" />
                <p className="text-xs text-white/50">No photos uploaded yet</p>
              </div>
            )}

            {/* Unit name overlay */}
            <div className="absolute bottom-4 left-4 z-10 pr-12">
              <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-2 ${theme.soft} ${theme.text}`}>
                {pkg.subtitle || toTitle(unit.type || 'Accommodation')}
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-white leading-tight drop-shadow-lg">
                {pkg.name || unit.name}
              </h2>
            </div>

            {/* Popular badge */}
            {pkg.featured && (
              <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-md text-black px-3 py-1 rounded-full text-xs font-bold shadow-lg flex items-center gap-1 z-20">
                <StarFilled className="text-yellow-500" /> POPULAR
              </div>
            )}
          </div>

          {/* Thumbnail strip */}
          {allImages.length > 1 && (
            <div className="flex gap-2 px-4 pt-3 pb-0 overflow-x-auto scrollbar-thin">
              {allImages.map((img, i) => (
                <button
                  key={i}
                  onClick={() => setPhotoIndex(i)}
                  className={`shrink-0 w-14 h-10 rounded-lg overflow-hidden border-2 transition-all ${i === photoIndex ? `${theme.border} opacity-100` : 'border-transparent opacity-50 hover:opacity-80'}`}
                >
                  <img src={img} alt="" className="w-full h-full object-cover" onError={(e) => { e.target.parentElement.style.display = 'none'; }} />
                </button>
              ))}
            </div>
          )}

          {/* Details section */}
          <div className="p-5 flex-grow overflow-y-auto">
            {/* Quick stats row */}
            <div className="flex flex-wrap gap-3 mb-5">
              {unit.capacity && (
                <div className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2 text-sm text-gray-300">
                  <TeamOutlined className={theme.text} />
                  <span>Up to <strong className="text-white">{unit.capacity}</strong> guest{unit.capacity > 1 ? 's' : ''}</span>
                </div>
              )}
              {unit.type && (
                <div className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2 text-sm text-gray-300">
                  <HomeOutlined className={theme.text} />
                  <span><strong className="text-white">{toTitle(unit.type)}</strong></span>
                </div>
              )}
              {unit.price_per_night && (
                <div className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2 text-sm text-gray-300">
                  <CalendarOutlined className={theme.text} />
                  <span><strong className="text-white">{formatPrice(parseFloat(unit.price_per_night))}</strong> / night</span>
                </div>
              )}
            </div>

            {/* Description */}
            {(unit.description || pkg.description) && (
              <p className="text-gray-400 text-sm leading-relaxed mb-5">
                {unit.description || pkg.description}
              </p>
            )}

            {/* Amenities */}
            {amenities.length > 0 && (
              <div>
                <h4 className="text-white font-bold mb-3 flex items-center gap-2 text-sm uppercase tracking-wide">
                  <ThunderboltFilled className="text-yellow-500" /> Amenities & Features
                </h4>
                <div className="flex flex-wrap gap-2">
                  {amenities.map((a) => (
                    <Tag
                      key={a}
                      className={`!rounded-full !px-3 !py-0.5 !text-xs !font-medium !border ${theme.soft} ${theme.text} !border-current`}
                    >
                      <CheckOutlined className="mr-1 text-[10px]" />{a}
                    </Tag>
                  ))}
                </div>
              </div>
            )}

            {/* Highlights (fallback when no amenities) */}
            {amenities.length === 0 && pkg.highlights?.length > 0 && (
              <div>
                <h4 className="text-white font-bold mb-3 flex items-center gap-2 text-sm uppercase tracking-wide">
                  <ThunderboltFilled className="text-yellow-500" /> What's Included
                </h4>
                <ul className="space-y-2">
                  {pkg.highlights.map((h) => (
                    <li key={h} className="flex items-start gap-3 text-sm text-gray-300">
                      <div className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${theme.soft}`}>
                        <CheckOutlined className={`text-xs ${theme.text}`} />
                      </div>
                      {h}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: Booking Panel ── */}
        <div className="lg:w-[45%] bg-[#13151a] p-5 sm:p-6 lg:p-8 flex flex-col">
          <h3 className="text-lg sm:text-xl font-bold text-white mb-5 flex items-center gap-2">
            <ClockCircleOutlined className="text-gray-500" /> Choose Your Stay
          </h3>

          {/* Duration tiles */}
          {durations.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              {durations.map((dur) => {
                const isSelected = selectedKey === dur.key;
                const isCustom = dur.key === 'custom';
                return (
                  <div
                    key={dur.key}
                    onClick={() => setSelectedKey(dur.key)}
                    className={`relative cursor-pointer rounded-xl p-4 border-2 transition-all duration-300
                      ${isSelected
                        ? `${theme.border} ${theme.soft}`
                        : 'border-white/5 bg-[#1a1d26] hover:border-white/10 hover:bg-[#20242e]'}`}
                  >
                    {isSelected && !isCustom && (
                      <div className={`absolute top-2 right-2 w-4 h-4 rounded-full ${theme.bg} flex items-center justify-center`}>
                        <CheckOutlined className="text-white text-[10px]" />
                      </div>
                    )}
                    <div className="flex justify-between items-start mb-2">
                      <span className={`text-sm font-bold ${isSelected ? 'text-white' : 'text-gray-400'}`}>
                        {dur.label}
                      </span>
                      {dur.tag && (
                        <span className={`text-[10px] px-2 py-0.5 rounded border ${isSelected ? 'border-white/20 text-white' : 'border-white/5 text-gray-600'}`}>
                          {dur.tag}
                        </span>
                      )}
                    </div>
                    {isCustom ? (
                      <p className="text-[11px] text-gray-500">Enter number of nights below</p>
                    ) : (
                      <>
                        <div>
                          <span className="text-xl font-bold text-white">{formatPrice(dur.price)}</span>
                        </div>
                        <p className="text-[11px] text-gray-500 mt-1">{dur.sessions}</p>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-gray-500 text-sm mb-6">Contact us for pricing and availability.</p>
          )}

          {/* Custom nights stepper — shown only when custom is selected */}
          {selectedKey === 'custom' && (
            <div className={`rounded-xl border-2 p-4 mb-4 ${theme.border} ${theme.soft}`}>
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-3 font-semibold">How many nights?</p>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setCustomNights((n) => Math.max(1, n - 1))}
                  className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
                >
                  <MinusOutlined className="text-xs" />
                </button>
                <div className="flex-1 text-center">
                  <span className="text-3xl font-extrabold text-white">{customNights}</span>
                  <span className="text-sm text-gray-400 ml-2">night{customNights !== 1 ? 's' : ''}</span>
                </div>
                <button
                  onClick={() => setCustomNights((n) => n + 1)}
                  className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
                >
                  <PlusOutlined className="text-xs" />
                </button>
              </div>
              {pricePerNight > 0 && (
                <p className="text-center text-xs text-gray-500 mt-2">
                  {formatPrice(pricePerNight)} × {customNights} = <span className="text-white font-semibold">{formatPrice(pricePerNight * customNights)}</span>
                </p>
              )}
            </div>
          )}

          {/* Spacer */}
          <div className="flex-grow" />

          {/* Booking summary */}
          <div className="bg-[#0f1013] rounded-2xl p-4 sm:p-5 border border-white/5 mt-4">
            <div className="flex justify-between items-center mb-4">
              <div>
                <p className="text-gray-400 text-xs uppercase tracking-wider font-semibold">Total Price</p>
                <p className="text-gray-500 text-xs">{getCurrentSessions()}</p>
              </div>
              <div className="text-right">
                <span className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                  {formatPrice(getCurrentPrice())}
                </span>
              </div>
            </div>

            <Button
              block
              size="large"
              type="primary"
              icon={<RocketOutlined />}
              className={`!h-12 sm:!h-14 !rounded-xl !text-base sm:!text-lg !font-bold !border-none shadow-lg transition-transform active:scale-95 bg-gradient-to-r ${pkg.gradient || 'from-blue-600 to-sky-500'}`}
            >
              Book Now
            </Button>
            <p className="text-center text-gray-600 text-[10px] mt-3 flex items-center justify-center gap-1">
              <InfoCircleOutlined /> No payment required today. Secure your spot now.
            </p>
          </div>
        </div>
      </div>

      <style>{`
        .stay-accommodation-modal .ant-modal-content {
          padding: 0;
          background: transparent;
        }
        .stay-accommodation-modal ::-webkit-scrollbar { width: 4px; }
        .stay-accommodation-modal ::-webkit-scrollbar-track { background: transparent; }
        .stay-accommodation-modal ::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.1);
          border-radius: 10px;
        }
        .stay-accommodation-modal ::-webkit-scrollbar-thumb:hover {
          background: rgba(255,255,255,0.2);
        }
      `}</style>
    </Modal>
  );
};

export default StayAccommodationModal;

