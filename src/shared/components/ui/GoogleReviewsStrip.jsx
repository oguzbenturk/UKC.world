import { useRef } from 'react';
import { StarFilled, StarOutlined, GoogleOutlined, LeftOutlined, RightOutlined } from '@ant-design/icons';

// ─── Your Google Maps link ────────────────────────────────────────────────────
const GOOGLE_MAPS_URL = 'https://www.google.com/maps/place/?q=place_id:ChIJiQeJHuGQuxQR3G-yQjApfgA';

// ─── Aggregate rating ─────────────────────────────────────────────────────────
const AGGREGATE = { rating: 4.8, totalReviews: 284 };

// ─── Customer reviews ─────────────────────────────────────────────────────────
const REVIEWS = [
  {
    author: 'Rachelle',
    rating: 5,
    relativeTime: 'June 2025',
    text: 'This location is perfect — consistent wind, not too deep, and top notch equipment. Plus it costs less than other places. I brought along my two 14 year old boys to learn as well. They were impressed with the young men teaching there and got up on their 3rd day! Super fun family holiday!',
  },
  {
    author: 'Andrew B.',
    rating: 5,
    relativeTime: 'July 2025',
    text: 'I went with a small group of friends to try kite surfing for the first time. Pierre is a superb coach who is incredibly safety conscious and ensured we were given the correct guidance from the outset. Excellent 1-on-1 coaching and equipment. I am really looking forward to going again!!',
  },
  {
    author: 'Hande Ö.',
    rating: 5,
    relativeTime: 'July 2025',
    text: 'Every summer I was planning to start kitesurfing but always intimidated by the challenges. The teachers are very patient, helpful and always very careful. Equipment is provided and instructor Buğra especially was excellent — taught everything in English. Thanks for everything!',
  },
  {
    author: 'Funda G.',
    rating: 5,
    relativeTime: 'August 2025',
    text: 'This is one of the best spots in Turkey, especially if you are a freestyle rider or if you\'d like to start learning. No other place to go for kitesurfing in this region!!',
  },
];

// ─────────────────────────────────────────────────────────────────────────────

const StarRating = ({ rating }) => (
  <span className="inline-flex gap-0.5">
    {[1, 2, 3, 4, 5].map(i => (
      i <= rating
        ? <StarFilled key={i} className="text-yellow-400 text-[11px]" />
        : <StarOutlined key={i} className="text-yellow-400/40 text-[11px]" />
    ))}
  </span>
);

const ReviewCard = ({ review }) => (
  <div className="flex-shrink-0 w-[280px] sm:w-[320px] snap-start rounded-xl bg-white/[0.04] border border-white/10 p-5 flex flex-col gap-3 hover:border-white/20 transition-colors duration-200">
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center flex-shrink-0">
        <span className="text-white text-sm font-bold">{review.author?.[0] ?? '?'}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-white text-sm font-semibold truncate">{review.author}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <StarRating rating={review.rating} />
          <span className="text-white/30 text-[10px]">{review.relativeTime}</span>
        </div>
      </div>
    </div>
    <p className="text-white/60 text-[13px] leading-relaxed line-clamp-5 flex-1">{review.text}</p>
  </div>
);

const GoogleReviewsStrip = ({ className = '' }) => {
  const scrollRef = useRef(null);

  const scroll = (dir) => {
    if (!scrollRef.current) return;
    const cardW = scrollRef.current.querySelector(':scope > div,a')?.offsetWidth || 300;
    scrollRef.current.scrollBy({ left: dir * (cardW + 16), behavior: 'smooth' });
  };

  return (
    <section className={`py-12 sm:py-16 bg-[#0d1511] ${className}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="flex items-end justify-between gap-4 mb-6 sm:mb-8">
          <div className="min-w-0">
            <span className="text-[10px] sm:text-xs font-duotone-regular uppercase tracking-widest text-[#00a8c4] mb-1 block">
              What our students say
            </span>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h2 className="text-lg sm:text-2xl font-duotone-bold-extended text-white whitespace-nowrap">
                Google Reviews
              </h2>
              <span className="flex items-center gap-1.5">
                <StarFilled className="text-yellow-400 text-sm sm:text-base" />
                <span className="text-white font-duotone-bold text-base sm:text-lg">{AGGREGATE.rating}</span>
                <span className="text-white/40 text-xs sm:text-sm font-duotone-regular">
                  ({AGGREGATE.totalReviews} reviews)
                </span>
              </span>
            </div>
          </div>

          {/* Desktop arrows + link */}
          <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              aria-label="Scroll left"
              onClick={() => scroll(-1)}
              className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/60 hover:bg-white/10 hover:text-white transition-colors"
            >
              <LeftOutlined className="text-xs" />
            </button>
            <button
              type="button"
              aria-label="Scroll right"
              onClick={() => scroll(1)}
              className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/60 hover:bg-white/10 hover:text-white transition-colors"
            >
              <RightOutlined className="text-xs" />
            </button>
            <a
              href={GOOGLE_MAPS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-2 inline-flex items-center gap-1.5 text-sm font-duotone-regular text-[#00a8c4] hover:underline underline-offset-4"
            >
              <GoogleOutlined />
              See all
            </a>
          </div>
        </div>

        {/* Scrollable cards */}
        <div className="relative group/reviews">
          <div
            ref={scrollRef}
            className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory scroll-pl-4"
            style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
          >
            {REVIEWS.map((review, i) => (
              <ReviewCard key={i} review={review} />
            ))}

            {/* CTA card */}
            <a
              href={GOOGLE_MAPS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-shrink-0 w-[220px] sm:w-[260px] snap-start rounded-xl border border-dashed border-white/15 flex flex-col items-center justify-center gap-3 p-6 text-center hover:border-[#00a8c4]/40 hover:bg-white/[0.03] transition-all duration-200 group"
            >
              <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-[#00a8c4]/10 transition-colors">
                <GoogleOutlined className="text-xl text-white/30 group-hover:text-[#00a8c4] transition-colors" />
              </div>
              <span className="text-white/40 text-sm font-duotone-regular group-hover:text-white/60 transition-colors leading-snug">
                Read all {AGGREGATE.totalReviews} reviews on Google
              </span>
            </a>

            {/* Spacer so last card isn't cut off */}
            <div className="flex-shrink-0 w-1" aria-hidden />
          </div>

          {/* Fade edges */}
          <div className="pointer-events-none absolute inset-y-0 right-0 w-12 sm:w-16 bg-gradient-to-l from-[#0d1511] to-transparent z-[1]" />
        </div>

        {/* Mobile: Google link below */}
        <div className="mt-3 sm:hidden">
          <a
            href={GOOGLE_MAPS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-duotone-regular text-[#00a8c4] hover:underline underline-offset-4"
          >
            <GoogleOutlined />
            See all {AGGREGATE.totalReviews} reviews on Google
          </a>
        </div>
      </div>

      <style>{`
        .scroll-pl-4 { scroll-padding-left: 1rem; }
        div[style*="scrollbarWidth"]::-webkit-scrollbar { display: none; }
      `}</style>
    </section>
  );
};

export default GoogleReviewsStrip;
