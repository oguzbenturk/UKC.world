// Style tokens for the earnings page.
// Brand teal is darkened for WCAG AA: #00798c for text/buttons on white,
// #0093ab only for non-text marks (lines, bars, progress).
export const BRAND_MARK = '#0093ab';

export const cardClass = 'rounded-2xl border border-slate-200 bg-white shadow-sm';

export const primaryButtonClass = [
  'inline-flex items-center justify-center gap-2 rounded-xl bg-[#00798c] px-5 font-semibold text-white shadow-sm',
  'hover:bg-[#006575] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00798c] focus-visible:ring-offset-2',
  'disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 disabled:shadow-none',
  'motion-safe:transition-colors',
].join(' ');

export const secondaryButtonClass = [
  'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 font-semibold text-slate-700 shadow-sm',
  'hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00798c] focus-visible:ring-offset-2',
  'disabled:cursor-not-allowed disabled:opacity-50 motion-safe:transition-colors',
].join(' ');
