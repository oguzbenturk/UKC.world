import { useMemo } from 'react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { useInstructorRatings } from '../hooks/useInstructorRatings';

const formatTimestamp = (isoString) => {
  if (!isoString) return 'Recently';
  try {
    return formatDistanceToNow(parseISO(isoString), { addSuffix: true });
  } catch {
    return 'Recently';
  }
};

const StarIcon = ({ filled = false, className = 'h-4 w-4' }) => (
  <svg className={`${className} ${filled ? 'text-amber-400' : 'text-slate-200'}`} viewBox="0 0 20 20" fill="currentColor">
    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
  </svg>
);

const MiniStars = ({ value = 0 }) => (
  <div className="flex gap-px">
    {[1, 2, 3, 4, 5].map((i) => (
      <StarIcon key={i} filled={i <= Math.round(value)} className="h-3 w-3" />
    ))}
  </div>
);

const barColors = { 5: 'bg-emerald-500', 4: 'bg-emerald-400', 3: 'bg-amber-400', 2: 'bg-orange-400', 1: 'bg-rose-400' };

const InstructorRatingsCard = ({ limit = 5 }) => {
  const { ratings, summary, stats, isLoading, error } = useInstructorRatings({ limit });
  const recentRatings = useMemo(() => ratings.slice(0, limit), [ratings, limit]);

  const averageRating = summary?.averageRating || 0;
  const distribution = useMemo(() => {
    if (!stats?.distribution) return [];
    return [5, 4, 3, 2, 1].map((s) => ({ star: s, count: stats.distribution[s] || 0 }));
  }, [stats?.distribution]);
  const totalRatings = distribution.reduce((s, d) => s + d.count, 0) || summary?.totalRatings || 0;
  const maxCount = Math.max(...distribution.map((d) => d.count), 1);

  if (isLoading) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm p-5 animate-pulse space-y-3">
        <div className="h-4 w-32 bg-slate-100 rounded" />
        <div className="h-16 bg-slate-100 rounded-xl" />
        <div className="h-12 bg-slate-100 rounded-xl" />
      </section>
    );
  }

  return (
    <section className="rounded-xl md:rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* Compact score header */}
      <div className="bg-gradient-to-r from-sky-50 via-white to-sky-50 px-3 sm:px-5 py-3 sm:py-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="flex items-baseline gap-1">
            <span className="text-2xl sm:text-3xl font-bold text-slate-900 tabular-nums">{averageRating.toFixed(1)}</span>
            <StarIcon filled className="h-4 w-4 sm:h-5 sm:w-5 -mt-1" />
          </div>
          <div>
            <MiniStars value={averageRating} />
            <p className="text-[10px] sm:text-[11px] text-slate-400 mt-0.5">{totalRatings} rating{totalRatings !== 1 ? 's' : ''}</p>
          </div>
        </div>
      </div>

      {/* Inline distribution bars */}
      {distribution.length > 0 && (
        <div className="px-3 sm:px-5 py-2 sm:py-3 border-b border-slate-50 space-y-1">
          {distribution.map(({ star, count }) => {
            const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
            return (
              <div key={star} className="flex items-center gap-2">
                <span className="text-xs text-slate-500 w-3 text-right tabular-nums">{star}</span>
                <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${barColors[star]}`}
                    style={{ width: `${pct}%`, minWidth: count > 0 ? '6px' : '0' }}
                  />
                </div>
                <span className="text-[10px] text-slate-400 w-4 text-right tabular-nums">{count}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Recent feedback - compact */}
      <div className="px-3 sm:px-5 py-2.5 sm:py-3">
        {error && (
          <p className="text-xs text-rose-500 mb-2">{error.message || 'Failed to load'}</p>
        )}
        {!recentRatings.length ? (
          <p className="text-xs text-slate-400 py-1">Feedback will appear here after lessons.</p>
        ) : (
          <div className="space-y-2.5">
            {recentRatings.map((rating) => {
              const name = rating.isAnonymous ? 'Anonymous' : (rating.studentName || 'Student');
              return (
                <div key={rating.id} className="flex items-start gap-2.5">
                  <div className="h-7 w-7 rounded-full bg-sky-50 flex items-center justify-center text-sky-600 text-[11px] font-semibold shrink-0 mt-0.5">
                    {name[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium text-slate-800 truncate">{name}</span>
                        <MiniStars value={rating.rating} />
                      </div>
                      <span className="text-[10px] text-slate-300 shrink-0">{formatTimestamp(rating.createdAt)}</span>
                    </div>
                    {rating.feedbackText && (
                      <p className="text-xs text-slate-400 leading-relaxed mt-0.5 line-clamp-2">&ldquo;{rating.feedbackText}&rdquo;</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};

export default InstructorRatingsCard;
