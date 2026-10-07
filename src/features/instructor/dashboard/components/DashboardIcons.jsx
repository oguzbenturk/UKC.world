// Inline stroke icons for the "My day" dashboard (decorative: aria-hidden).
// The earnings page icons (Check/Clock/Alert/…) are reused from ../../earnings.
const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: 'false',
};

const Icon = ({ size = 16, strokeWidth = 2, className, style, children }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" strokeWidth={strokeWidth} className={className} style={style} {...base}>
    {children}
  </svg>
);

export const WarningIcon = (props) => (
  <Icon {...props}><path d="M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" /></Icon>
);

export const MessageIcon = (props) => (
  <Icon {...props}><path d="M21 12a8 8 0 01-11.6 7.1L4 21l1.9-5.4A8 8 0 1121 12z" /></Icon>
);

export const ChevronRightIcon = (props) => (
  <Icon {...props}><path d="M9 6l6 6-6 6" /></Icon>
);

export const PlusIcon = (props) => (
  <Icon strokeWidth={2.4} {...props}><path d="M12 5v14M5 12h14" /></Icon>
);

/** Arrow pointing "up"; rotate it to show where the wind blows to. */
export const ArrowIcon = (props) => (
  <Icon {...props}><path d="M12 3v18M6 9l6-6 6 6" /></Icon>
);

export const WindIcon = (props) => (
  <Icon {...props}><path d="M3 8h11a3 3 0 10-3-3M3 12h16a3 3 0 11-3 3M3 16h7" /></Icon>
);

export const StarIcon = (props) => (
  <Icon {...props}><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" /></Icon>
);

export const NoteIcon = (props) => (
  <Icon {...props}><path d="M4 20h4L19 9a2.8 2.8 0 00-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></Icon>
);

export const LogOutIcon = (props) => (
  <Icon {...props}><path d="M9 21H6a2 2 0 01-2-2V5a2 2 0 012-2h3M16 17l5-5-5-5M21 12H9" /></Icon>
);

export const LogInIcon = (props) => (
  <Icon {...props}><path d="M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3M10 17l5-5-5-5M15 12H3" /></Icon>
);

export const PinIcon = (props) => (
  <Icon {...props}><path d="M12 21s-7-6.2-7-11.5A7 7 0 0112 2.5a7 7 0 017 7C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></Icon>
);

export const BoxIcon = (props) => (
  <Icon {...props}><path d="M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8" /></Icon>
);

