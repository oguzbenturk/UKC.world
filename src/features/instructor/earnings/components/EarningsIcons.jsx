// Small inline stroke icons for the earnings page (decorative: aria-hidden).
const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: 'false',
};

const Icon = ({ size = 16, strokeWidth = 2, className, children }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" strokeWidth={strokeWidth} className={className} {...base}>
    {children}
  </svg>
);

export const ClockIcon = (props) => (
  <Icon strokeWidth={2.2} {...props}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Icon>
);

export const CheckIcon = (props) => (
  <Icon strokeWidth={2.4} {...props}><path d="M5 12l4 4L19 6" /></Icon>
);

export const ArrowUpRightIcon = (props) => (
  <Icon strokeWidth={2.4} {...props}><path d="M7 17L17 7M9 7h8v8" /></Icon>
);

export const ArrowDownRightIcon = (props) => (
  <Icon strokeWidth={2.4} {...props}><path d="M7 7l10 10M17 9v8H9" /></Icon>
);

export const BankIcon = (props) => (
  <Icon {...props}><path d="M3 10h18M5 10v8M19 10v8M9 10v8M15 10v8M3 20h18M12 3l9 5H3z" /></Icon>
);

export const PayoutIcon = (props) => (
  <Icon {...props}><path d="M12 3v14M6 11l6 6 6-6M5 21h14" /></Icon>
);

export const MinusIcon = (props) => (
  <Icon {...props}><path d="M5 12h14" /></Icon>
);

export const ChevronDownIcon = (props) => (
  <Icon {...props}><path d="M6 9l6 6 6-6" /></Icon>
);

export const SearchIcon = (props) => (
  <Icon {...props}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></Icon>
);

export const DownloadIcon = (props) => (
  <Icon {...props}><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></Icon>
);

export const DocumentIcon = (props) => (
  <Icon {...props}><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></Icon>
);

export const AlertIcon = (props) => (
  <Icon {...props}><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16.5v.01" /></Icon>
);

export const SendIcon = (props) => (
  <Icon {...props}><path d="M4 12l16-8-6 16-2.5-6.5z" /></Icon>
);
