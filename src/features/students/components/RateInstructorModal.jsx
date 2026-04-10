import { useEffect, useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import { Modal } from 'antd';
import { useSubmitRating } from '../hooks/useRatings';

/* ── Rating config ── */
const RATINGS = [
  { value: 1, label: 'Poor',     emoji: '\u{1F61E}', color: '#ef4444', bg: 'rgba(239,68,68,0.07)'  },
  { value: 2, label: 'Fair',     emoji: '\u{1F615}', color: '#f97316', bg: 'rgba(249,115,22,0.07)' },
  { value: 3, label: 'Good',     emoji: '\u{1F60A}', color: '#eab308', bg: 'rgba(234,179,8,0.07)'  },
  { value: 4, label: 'Great',    emoji: '\u{1F604}', color: '#22c55e', bg: 'rgba(34,197,94,0.07)'  },
  { value: 5, label: 'Amazing!', emoji: '\u{1F929}', color: '#00a8c4', bg: 'rgba(0,168,196,0.08)'  },
];

/* ── Custom star ── */
const Star = ({ filled, hovered, index, onClick, onHover, onLeave, color }) => (
  <button
    type="button"
    onClick={() => onClick(index + 1)}
    onMouseEnter={() => onHover(index + 1)}
    onMouseLeave={onLeave}
    className="relative p-0.5 outline-none focus-visible:ring-2 focus-visible:ring-duotone-blue rounded-lg"
    style={{
      transform: filled || hovered ? 'scale(1.15)' : 'scale(1)',
      transition: `transform 220ms cubic-bezier(.34,1.56,.64,1) ${index * 35}ms`,
    }}
    aria-label={`Rate ${index + 1} star${index > 0 ? 's' : ''}`}
  >
    <svg
      viewBox="0 0 24 24"
      className="w-10 h-10 sm:w-11 sm:h-11"
      style={{
        fill: filled ? color : 'transparent',
        stroke: filled ? color : hovered ? `${color}90` : '#cbd5e1',
        strokeWidth: 1.5,
        filter: filled ? `drop-shadow(0 2px 6px ${color}40)` : 'none',
        transition: `all 250ms cubic-bezier(.4,0,.2,1) ${index * 35}ms`,
      }}
    >
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  </button>
);

/* ── Success overlay ── */
const SuccessState = () => (
  <div className="flex flex-col items-center justify-center py-20 px-8 text-center">
    <div
      className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mb-5"
      style={{ animation: 'rateSuccessPop 400ms cubic-bezier(.34,1.56,.64,1) forwards' }}
    >
      <svg className="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M5 13l4 4L19 7"
          style={{
            strokeDasharray: 24,
            strokeDashoffset: 24,
            animation: 'rateCheckDraw 500ms 200ms ease forwards',
          }}
        />
      </svg>
    </div>
    <h3 className="font-duotone-bold text-xl text-slate-800 mb-1">Thank you!</h3>
    <p className="text-slate-500 text-sm font-gotham-medium">Your feedback helps us ride bigger waves.</p>
  </div>
);

/* ── Main component ── */
export const RateInstructorModal = ({ open = false, booking = null, onClose = undefined }) => {
  const [rating, setRating] = useState(5);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [feedbackText, setFeedbackText] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const { mutateAsync, isPending } = useSubmitRating({
    onSuccess: () => {
      setSubmitted(true);
      setTimeout(() => {
        setSubmitted(false);
        onClose?.(true);
      }, 1800);
    },
  });

  const shouldShowModal = open && Boolean(booking);

  useEffect(() => {
    if (shouldShowModal) {
      setRating(5);
      setHoveredRating(0);
      setFeedbackText('');
      setIsAnonymous(false);
      setSubmitted(false);
    }
  }, [shouldShowModal]);

  const instructorName = booking?.instructor?.name ?? 'Instructor';
  const serviceName = booking?.service?.name ?? 'Lesson';
  const activeRating = hoveredRating || rating;
  const info = RATINGS[activeRating - 1] || RATINGS[4];

  const canSubmit = rating > 0 && (rating >= 5 || feedbackText.trim().length > 0);

  const handleSubmit = useCallback(async () => {
    if (!booking || !canSubmit) return;
    try {
      await mutateAsync({
        bookingId: booking.bookingId,
        rating: Number(rating),
        feedbackText: feedbackText.trim() || undefined,
        isAnonymous: Boolean(isAnonymous),
        serviceType: booking.service?.type ?? 'lesson',
      });
    } catch {
      // mutation errors surfaced via toast; keep modal open
    }
  }, [booking, rating, feedbackText, isAnonymous, canSubmit, mutateAsync]);

  return (
    <Modal
      open={shouldShowModal}
      title={null}
      destroyOnHidden
      footer={null}
      onCancel={() => onClose?.(false)}
      width={440}
      centered
      closable={false}
      styles={{
        body: { padding: 0 },
        content: {
          borderRadius: 24,
          overflow: 'hidden',
          background: '#ffffff',
          boxShadow: '0 25px 60px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.04)',
        },
      }}
    >
      {/* Inline keyframes */}
      <style>{`
        @keyframes rateSuccessPop  { 0% { transform: scale(0); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
        @keyframes rateCheckDraw   { to { stroke-dashoffset: 0; } }
        @keyframes rateGlowPulse  { 0%,100% { opacity: .15; } 50% { opacity: .3; } }
      `}</style>

      {submitted ? (
        <SuccessState />
      ) : booking ? (
        <div className="relative overflow-hidden">
          {/* ── Close ── */}
          <button
            type="button"
            onClick={() => onClose?.(false)}
            className="absolute top-4 right-4 z-20 w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-all duration-150"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* ── Header with soft gradient ── */}
          <div className="relative px-8 pt-10 pb-5 text-center bg-gradient-to-b from-slate-50/80 to-white">
            {/* Soft ambient glow behind avatar */}
            <div
              className="absolute left-1/2 top-4 -translate-x-1/2 w-44 h-44 rounded-full blur-[70px] pointer-events-none"
              style={{ background: info.color, animation: 'rateGlowPulse 3s ease-in-out infinite', opacity: 0.15 }}
            />

            {/* Avatar with subtle ring */}
            <div className="relative mx-auto mb-5 w-[88px] h-[88px]">
              <div
                className="absolute -inset-1 rounded-full transition-all duration-500"
                style={{
                  background: `conic-gradient(from 180deg, ${info.color}60, transparent 70%)`,
                  opacity: 0.6,
                  filter: 'blur(5px)',
                }}
              />
              {booking.instructor?.avatar ? (
                <img
                  src={booking.instructor.avatar}
                  alt={instructorName}
                  className="relative w-[88px] h-[88px] rounded-full object-cover ring-[3px] ring-white shadow-lg"
                />
              ) : (
                <div className="relative w-[88px] h-[88px] rounded-full bg-gradient-to-br from-duotone-blue to-cyan-600 flex items-center justify-center ring-[3px] ring-white shadow-lg">
                  <span className="font-duotone-bold text-3xl text-white">
                    {(instructorName)[0].toUpperCase()}
                  </span>
                </div>
              )}
            </div>

            <h2 className="font-duotone-bold text-[1.15rem] text-slate-800 leading-tight mb-1.5">
              How was your session?
            </h2>
            <p className="text-slate-500 text-sm">
              with{' '}
              <span className="text-duotone-blue font-gotham-medium">{instructorName}</span>
            </p>

            {/* Lesson tag */}
            <div className="inline-flex items-center gap-1.5 mt-3 px-3 py-1 rounded-full bg-slate-50 border border-slate-100">
              <span className="w-1.5 h-1.5 rounded-full bg-duotone-blue" />
              <span className="text-[11px] text-slate-500 font-gotham-medium tracking-wide">
                {serviceName}
                {booking.date && <> &middot; {booking.date}</>}
              </span>
            </div>
          </div>

          {/* ── Star rating ── */}
          <div className="px-8 pb-1 text-center">
            <div className="flex items-center justify-center gap-0.5">
              {RATINGS.map((_, i) => (
                <Star
                  key={i}
                  index={i}
                  filled={i < (hoveredRating || rating)}
                  hovered={hoveredRating > 0 && i < hoveredRating}
                  color={info.color}
                  onClick={setRating}
                  onHover={setHoveredRating}
                  onLeave={() => setHoveredRating(0)}
                />
              ))}
            </div>

            {/* Emoji pill */}
            <div
              className="inline-flex items-center gap-2 mt-3 px-4 py-1.5 rounded-full transition-all duration-300"
              style={{ background: info.bg }}
            >
              <span
                className="text-lg leading-none transition-transform duration-300"
                style={{ transform: hoveredRating ? 'scale(1.25) rotate(-6deg)' : 'scale(1) rotate(0)' }}
              >
                {info.emoji}
              </span>
              <span
                className="text-sm font-gotham-medium transition-colors duration-300"
                style={{ color: info.color }}
              >
                {info.label}
              </span>
            </div>
          </div>

          {/* ── Divider ── */}
          <div className="mx-8 my-4 h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />

          {/* ── Feedback textarea ── */}
          <div className="px-8 pb-2">
            <label className="block mb-2">
              <span className="text-[10px] font-gotham-medium uppercase tracking-[0.12em] text-slate-400">
                {rating < 5 ? (
                  <>How can we earn 5 stars? <span className="text-duotone-blue">*</span></>
                ) : (
                  'Share your experience'
                )}
              </span>
            </label>
            <textarea
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              maxLength={2000}
              rows={3}
              placeholder={
                rating < 5
                  ? "We'd love to do better \u2014 what could we improve?"
                  : 'What made this session great?'
              }
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-800 placeholder-slate-400 resize-none outline-none transition-all duration-200 focus:border-duotone-blue/50 focus:bg-white focus:ring-1 focus:ring-duotone-blue/20"
            />
            <div className="flex items-center justify-between mt-1 px-0.5">
              {rating < 5 && !feedbackText.trim() && (
                <span className="text-[11px] text-amber-600 font-gotham-medium">
                  Required for ratings under 5 stars
                </span>
              )}
              <span className="text-[11px] text-slate-400 ml-auto tabular-nums">
                {feedbackText.length} / 2000
              </span>
            </div>
          </div>

          {/* ── Anonymous toggle ── */}
          <div className="px-8 py-3">
            <button
              type="button"
              onClick={() => setIsAnonymous(!isAnonymous)}
              className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-2xl border transition-all duration-200 ${
                isAnonymous
                  ? 'bg-duotone-blue/[0.05] border-duotone-blue/30'
                  : 'bg-slate-50 border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="text-left">
                <p className={`text-sm font-gotham-medium transition-colors duration-200 ${isAnonymous ? 'text-duotone-blue' : 'text-slate-700'}`}>
                  Submit anonymously
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Your rating counts, your name stays private
                </p>
              </div>
              <div
                className={`relative shrink-0 w-11 h-6 rounded-full transition-colors duration-200 ${
                  isAnonymous ? 'bg-duotone-blue' : 'bg-slate-300'
                }`}
              >
                <div
                  className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                    isAnonymous ? 'translate-x-[22px]' : 'translate-x-0.5'
                  }`}
                />
              </div>
            </button>
          </div>

          {/* ── Actions ── */}
          <div className="px-8 pt-1 pb-8">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isPending || !canSubmit}
              className="group relative w-full h-12 rounded-2xl font-duotone-bold text-sm tracking-wide overflow-hidden transition-all duration-200 disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer"
              style={{
                background: canSubmit
                  ? 'linear-gradient(135deg, #00a8c4 0%, #0891b2 100%)'
                  : '#e2e8f0',
                color: canSubmit ? '#ffffff' : '#94a3b8',
                boxShadow: canSubmit ? '0 4px 16px rgba(0,168,196,0.3)' : 'none',
              }}
            >
              <span className="relative z-10 flex items-center justify-center gap-2">
                {isPending ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Submitting&hellip;
                  </>
                ) : (
                  <>
                    <svg
                      className="w-4 h-4 transition-transform duration-200 group-hover:scale-110"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z"
                        clipRule="evenodd"
                      />
                    </svg>
                    Submit Rating
                  </>
                )}
              </span>
              {/* Hover shimmer */}
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-r from-transparent via-white/15 to-transparent" />
            </button>

            <button
              type="button"
              onClick={() => onClose?.(false)}
              disabled={isPending}
              className="w-full mt-2 py-2.5 text-sm text-slate-400 hover:text-slate-600 transition-colors duration-150 disabled:cursor-not-allowed font-gotham-medium"
            >
              Maybe later
            </button>
          </div>
        </div>
      ) : (
        <div className="py-12 px-8 text-center">
          <p className="text-slate-500 text-sm">We couldn&apos;t find details for this lesson.</p>
        </div>
      )}
    </Modal>
  );
};

RateInstructorModal.propTypes = {
  open: PropTypes.bool,
  booking: PropTypes.shape({
    bookingId: PropTypes.string.isRequired,
    date: PropTypes.string,
    instructor: PropTypes.shape({
      id: PropTypes.string,
      name: PropTypes.string,
      avatar: PropTypes.string,
    }),
    service: PropTypes.shape({
      id: PropTypes.string,
      name: PropTypes.string,
      type: PropTypes.string,
    }),
  }),
  onClose: PropTypes.func,
};

export default RateInstructorModal;
