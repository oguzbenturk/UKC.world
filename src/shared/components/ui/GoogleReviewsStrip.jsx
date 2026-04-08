import { useEffect, useState } from 'react';
import { StarFilled, StarOutlined, GoogleOutlined } from '@ant-design/icons';

const StarRating = ({ rating }) => (
  <span className="flex gap-0.5">
    {[1, 2, 3, 4, 5].map(i => (
      i <= rating
        ? <StarFilled key={i} className="text-yellow-400 text-xs" />
        : <StarOutlined key={i} className="text-yellow-400/40 text-xs" />
    ))}
  </span>
);

const ReviewCard = ({ review }) => (
  <div className="flex-shrink-0 w-72 sm:w-80 rounded-xl bg-white/5 border border-white/10 p-5 flex flex-col gap-3 hover:border-white/20 transition-colors duration-200">
    <div className="flex items-center gap-3">
      {review.avatar ? (
        <img
          src={review.avatar}
          alt={review.author}
          className="w-9 h-9 rounded-full object-cover flex-shrink-0"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center flex-shrink-0">
          <span className="text-white text-sm font-bold">{review.author?.[0] ?? '?'}</span>
        </div>
      )}
      <div className="min-w-0">
        <p className="text-white text-sm font-semibold truncate">{review.author}</p>
        <p className="text-white/40 text-xs">{review.relativeTime}</p>
      </div>
    </div>
    <StarRating rating={review.rating} />
    <p className="text-white/70 text-sm leading-relaxed line-clamp-4">{review.text}</p>
  </div>
);

/**
 * GoogleReviewsStrip
 * Fetches reviews from /api/google-reviews (backend proxies Places API, cached 1h).
 * Shows a horizontal scrollable strip of review cards with aggregate rating header.
 */
const GoogleReviewsStrip = ({ className = '' }) => {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/google-reviews')
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(json => { if (!cancelled) setData(json); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, []);

  // Don't render anything if not configured or failed
  if (error || (data && !data.reviews?.length)) return null;

  const googleUrl = data?.googleUrl || 'https://www.google.com/search?q=Urla+Kite+Center';

  return (
    <section className={`py-14 bg-[#0d1511] ${className}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
          <div>
            <span className="text-xs font-duotone-regular uppercase tracking-widest text-[#00a8c4] mb-1 block">
              What our students say
            </span>
            <div className="flex items-baseline gap-3">
              <h2 className="text-xl sm:text-2xl font-duotone-bold-extended text-white">
                Google Reviews
              </h2>
              {data?.rating && (
                <span className="flex items-center gap-1.5">
                  <StarFilled className="text-yellow-400 text-base" />
                  <span className="text-white font-duotone-bold text-lg">{data.rating.toFixed(1)}</span>
                  {data.totalReviews && (
                    <span className="text-white/40 text-sm font-duotone-regular">
                      ({data.totalReviews.toLocaleString()})
                    </span>
                  )}
                </span>
              )}
            </div>
          </div>
          <a
            href={googleUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm font-duotone-regular text-[#00a8c4] hover:underline underline-offset-4 self-start sm:self-auto"
          >
            <GoogleOutlined />
            See all reviews
          </a>
        </div>

        {/* Loading skeleton */}
        {!data && (
          <div className="flex gap-4 overflow-hidden">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex-shrink-0 w-72 sm:w-80 h-44 rounded-xl bg-white/5 animate-pulse" />
            ))}
          </div>
        )}

        {/* Review cards */}
        {data?.reviews?.length > 0 && (
          <div
            className="flex gap-4 overflow-x-auto pb-3 no-scrollbar"
            style={{ scrollbarWidth: 'none' }}
          >
            {data.reviews.map((review, i) => (
              <ReviewCard key={i} review={review} />
            ))}
            {/* CTA card */}
            <a
              href={googleUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-shrink-0 w-56 rounded-xl border border-dashed border-white/20 flex flex-col items-center justify-center gap-3 p-6 text-center hover:border-[#00a8c4]/50 hover:bg-white/5 transition-all duration-200 group"
            >
              <GoogleOutlined className="text-2xl text-white/30 group-hover:text-[#00a8c4] transition-colors" />
              <span className="text-white/50 text-sm font-duotone-regular group-hover:text-white/70 transition-colors leading-snug">
                Read all reviews on Google
              </span>
            </a>
          </div>
        )}
      </div>

      <style>{`.no-scrollbar::-webkit-scrollbar{display:none}`}</style>
    </section>
  );
};

export default GoogleReviewsStrip;
