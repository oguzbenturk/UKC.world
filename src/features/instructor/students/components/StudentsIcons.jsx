// Inline stroke icons for the students pages (decorative: aria-hidden).
// Shared ones (Check, Clock, Alert, Search, Message, Plus, Chevron…) come from
// ../../earnings and ../../dashboard.
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

export const CloseIcon = (props) => (
  <Icon strokeWidth={2.2} {...props}><path d="M6 6l12 12M18 6L6 18" /></Icon>
);

export const ArrowLeftIcon = (props) => (
  <Icon strokeWidth={2.2} {...props}><path d="M19 12H5M11 6l-6 6 6 6" /></Icon>
);

export const PhoneIcon = (props) => (
  <Icon {...props}><path d="M5 3h3l2 5-2.5 1.5a11 11 0 006 6L15 13l5 2v3a2 2 0 01-2 2A16 16 0 013 5a2 2 0 012-2z" /></Icon>
);

export const MailIcon = (props) => (
  <Icon {...props}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></Icon>
);

export const WhatsAppIcon = (props) => (
  <Icon {...props}><path d="M3.5 20.5l1.3-4A8.5 8.5 0 1112 20.5a8.4 8.4 0 01-4.3-1.2z" /><path d="M9 8.5c0 3.5 3 6.5 6.5 6.5l1-1.6-2-1-1 .8a4.5 4.5 0 01-2.2-2.2l.8-1-1-2z" /></Icon>
);

export const UsersIcon = (props) => (
  <Icon {...props}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0113 0M16 4.6a3.5 3.5 0 010 6.8M18 14a6.5 6.5 0 013.5 6" /></Icon>
);

export const TrashIcon = (props) => (
  <Icon {...props}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></Icon>
);

export const LockIcon = (props) => (
  <Icon {...props}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></Icon>
);

export const EyeIcon = (props) => (
  <Icon {...props}><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></Icon>
);

export const CalendarIcon = (props) => (
  <Icon {...props}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></Icon>
);

export const GiftIcon = (props) => (
  <Icon {...props}><rect x="3" y="8" width="18" height="5" rx="1" /><path d="M5 13v8h14v-8M12 8v13M12 8S10.5 3 8 3.5 7 8 12 8zM12 8s1.5-5 4-4.5S17 8 12 8z" /></Icon>
);

export const TrophyIcon = (props) => (
  <Icon {...props}><path d="M8 4h8v5a4 4 0 01-8 0zM8 6H4a3 3 0 003 4M16 6h4a3 3 0 01-3 4M12 13v4M8 21h8M9 17h6" /></Icon>
);

export const SortIcon = (props) => (
  <Icon {...props}><path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4" /></Icon>
);
