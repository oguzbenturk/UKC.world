/**
 * Scroll hint: wide downward chevron (broad “V”), no label — motion + aria-label only.
 */
const FuturisticScrollCue = ({
  onActivate,
  className = '',
  ariaLabel = 'Scroll down to explore more sections',
}) => (
  <>
    <style>{`
      @keyframes futuristic-chevron-nudge {
        0%, 100% { transform: translateY(0); opacity: 0.88; }
        50% { transform: translateY(8px); opacity: 1; }
      }
      .futuristic-scroll-cue__chevron {
        animation: futuristic-chevron-nudge 1.85s ease-in-out infinite;
      }
      @media (prefers-reduced-motion: reduce) {
        .futuristic-scroll-cue__chevron {
          animation: none;
          opacity: 0.95;
        }
      }
    `}</style>
    <button
      type="button"
      onClick={onActivate}
      className={`group rounded-full p-2 transition-transform duration-200 hover:scale-105 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-duotone-blue/70 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent ${className}`}
      aria-label={ariaLabel}
    >
      <svg
        className="futuristic-scroll-cue__chevron w-[4.25rem] h-9 text-duotone-blue transition-colors group-hover:text-cyan-300 sm:w-[4.75rem] sm:h-10"
        viewBox="0 0 76 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
        style={{
          filter: 'drop-shadow(0 0 10px rgba(30, 58, 138, 0.45))',
        }}
      >
        {/* Wide “V” — shallow angle, long arms */}
        <path
          d="M 6 12 L 38 34 L 70 12"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </button>
  </>
);

export default FuturisticScrollCue;
