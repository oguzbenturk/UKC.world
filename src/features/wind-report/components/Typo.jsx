import React from 'react';

/**
 * Shared text primitives for the Wind Report page. They exist so the page can never
 * drift back into the old 8–10px / 0.3em-tracking / slate-400 micro-label habit that
 * was unreadable on a phone in sunlight.
 *
 * Hard floors enforced here:
 *  - size ≥ 11px
 *  - tracking ≤ 0.12em
 *  - colour ≥ slate-500 (passes WCAG AA on white / sky-50)
 *  - UPPERCASE only on short eyebrow tokens; never on full sentences (kills TR/DE strings).
 */

// Section heads, "LIVE NOW", "TODAY" — the ONLY place caps + tracking survive.
export const Eyebrow = ({ children, className = '', as: As = 'span', ...rest }) => (
  <As
    className={`text-[11px] font-gotham-medium uppercase tracking-[0.12em] text-slate-500 ${className}`}
    {...rest}
  >
    {children}
  </As>
);

// Every metric caption, footer note and detail label. Normal-case, i18n-safe.
export const DataLabel = ({ children, className = '', as: As = 'span', ...rest }) => (
  <As
    className={`text-[11px] font-gotham-medium tracking-normal text-slate-600 ${className}`}
    {...rest}
  >
    {children}
  </As>
);
