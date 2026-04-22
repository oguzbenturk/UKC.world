import React from 'react';
import { useTranslation } from 'react-i18next';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { calcKiteSize, MIN_KITE_SQM, MAX_KITE_SQM } from '../utils/kiteSize';

const KiteRecommendation = ({ weight, windKn, timeLabel }) => {
  const { t } = useTranslation('common');

  const recommended = calcKiteSize(weight, windKn);
  const rangeLow = recommended != null ? Math.max(MIN_KITE_SQM, recommended - 1) : null;
  const rangeHigh = recommended != null ? Math.min(MAX_KITE_SQM, recommended + 1) : null;

  // Spring count-up on kite size change — the "futuristic instrument" moment
  const count = useMotionValue(recommended ?? 0);
  const display = useTransform(count, (v) => Math.round(v));
  const [pulse, setPulse] = React.useState(false);
  const prevRef = React.useRef(recommended);

  React.useEffect(() => {
    if (recommended == null) return undefined;
    const controls = animate(count, recommended, {
      duration: 0.5,
      ease: [0.34, 1.56, 0.64, 1],
    });
    if (prevRef.current != null && prevRef.current !== recommended) {
      setPulse(true);
      const id = setTimeout(() => setPulse(false), 320);
      prevRef.current = recommended;
      return () => { controls.stop(); clearTimeout(id); };
    }
    prevRef.current = recommended;
    return () => controls.stop();
  }, [recommended, count]);

  return (
    <div className="flex flex-col items-end">
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-gotham-medium uppercase tracking-[0.3em] text-slate-500">
          {t('windReport.kiteSizer.recommended')}
        </span>
        {timeLabel && (
          <span className="inline-flex items-center gap-1 rounded-full bg-sky-100/80 ring-1 ring-sky-200/70 px-1.5 py-0.5 text-[9px] font-gotham-medium uppercase tracking-[0.2em] text-sky-700 tabular-nums">
            <span className="inline-block h-1 w-1 animate-pulse rounded-full bg-[#00a8c4]" />
            {timeLabel}
          </span>
        )}
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        {recommended == null ? (
          <span className="font-duotone-bold-extended text-[56px] leading-none text-slate-900 tabular-nums">
            —
          </span>
        ) : (
          <motion.span
            className="font-duotone-bold-extended text-[56px] leading-none text-slate-900 tabular-nums"
            animate={{ scale: pulse ? 1.08 : 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 18 }}
          >
            {display}
          </motion.span>
        )}
        <span className="font-duotone-bold text-sm text-slate-500">m²</span>
      </div>
      {rangeLow != null && (
        <div className="mt-0.5 text-[10px] font-gotham-medium text-slate-500 tabular-nums">
          {rangeLow}–{rangeHigh} m² · {weight}kg @ {windKn}kn
        </div>
      )}
      <div
        className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/70 px-2 py-0.5 backdrop-blur-sm"
        title={t('windReport.kiteSizer.info')}
      >
        <span className="inline-block h-1 w-1 rounded-full bg-emerald-500" />
        <span className="text-[8.5px] font-gotham-medium uppercase tracking-[0.25em] text-slate-600">
          {t('windReport.kiteSizer.brand')}
        </span>
      </div>
    </div>
  );
};

export default KiteRecommendation;
