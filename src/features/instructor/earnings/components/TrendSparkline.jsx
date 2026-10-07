import { useId, useMemo } from 'react';
import { BRAND_MARK } from './earningsStyles';
import { dec } from '../earningsFormat';

/**
 * 12-week earnings trend (area + line). Pure SVG so it renders without layout
 * measurement and has no animation (prefers-reduced-motion friendly).
 * Optional dashed threshold line (desktop board: "payout minimum €200").
 */
export default function TrendSparkline({ points = [], width = 320, height = 64, threshold = null, thresholdLabel = '', label }) {
  const gradientId = useId().replace(/:/g, '');

  const geometry = useMemo(() => {
    const values = points.map((p) => dec(p.total));
    if (!values.length) return null;
    const pad = 6;
    const thresholdValue = threshold != null ? dec(threshold) : null;
    let max = values.reduce((acc, v) => (v.gt(acc) ? v : acc), dec(0));
    if (thresholdValue && thresholdValue.gt(max)) max = thresholdValue;
    if (max.lte(0)) max = dec(1);
    const stepX = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0;
    const usable = height - pad * 2;
    const y = (v) => pad + usable - v.div(max).times(usable).toNumber();
    const coords = values.map((v, i) => [pad + i * stepX, y(v)]);
    const line = coords.map(([cx, cy], i) => `${i === 0 ? 'M' : 'L'}${cx.toFixed(1)} ${cy.toFixed(1)}`).join(' ');
    const area = `${line} L${coords[coords.length - 1][0].toFixed(1)} ${height} L${coords[0][0].toFixed(1)} ${height} Z`;
    return {
      line,
      area,
      last: coords[coords.length - 1],
      thresholdY: thresholdValue ? y(thresholdValue) : null,
    };
  }, [points, width, height, threshold]);

  if (!geometry) return null;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" role="img" aria-label={label} className="block overflow-visible">
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={BRAND_MARK} stopOpacity="0.2" />
          <stop offset="1" stopColor={BRAND_MARK} stopOpacity="0" />
        </linearGradient>
      </defs>
      {geometry.thresholdY != null && (
        <g aria-hidden="true">
          <line x1="0" x2={width} y1={geometry.thresholdY} y2={geometry.thresholdY} stroke="#d97706" strokeWidth="1.5" strokeDasharray="5 5" />
          {thresholdLabel && (
            <text x={width - 4} y={Math.max(geometry.thresholdY - 6, 12)} textAnchor="end" fontSize="12" fill="#92400e">
              {thresholdLabel}
            </text>
          )}
        </g>
      )}
      <path d={geometry.area} fill={`url(#${gradientId})`} />
      <path d={geometry.line} fill="none" stroke={BRAND_MARK} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={geometry.last[0]} cy={geometry.last[1]} r="4" fill={BRAND_MARK} />
    </svg>
  );
}
