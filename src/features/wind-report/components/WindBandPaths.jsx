import React from 'react';
import { motion } from 'framer-motion';
import { WR_HEX, BRAND_CYAN } from '../utils/bandTheme';
import { lineD, areaD } from '../utils/curveGeometry';

// The band-coloured wind curve used by WindHistoryChart (the live-history chart): a soft
// filled area + a stroked line per wind-band run, so the chart renders the "colour = how
// windy" language. Callers pass the pre-split `runs` (from segmentsByBand) and the SVG
// baseline `baseY`.
const WindBandPaths = ({ runs, baseY, strokeWidth = 2.5, stagger = 0.06, reduce = false }) => (
  <>
    {runs.map((run, i) => (
      <path key={`wa${i}`} d={areaD(run.pts, baseY)} fill={WR_HEX[run.band] || BRAND_CYAN} fillOpacity="0.32" />
    ))}
    {runs.map((run, i) => (
      <motion.path
        key={`wl${i}`}
        d={lineD(run.pts)}
        fill="none"
        stroke={WR_HEX[run.band] || BRAND_CYAN}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={reduce ? false : { pathLength: 0, opacity: 0.4 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: reduce ? 0 : 0.6, ease: [0.22, 1, 0.36, 1], delay: reduce ? 0 : i * stagger }}
      />
    ))}
  </>
);

export default WindBandPaths;
