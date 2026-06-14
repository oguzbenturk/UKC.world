// Centralised constants — kept in sync with backend/services/warrantyService.js
// and backend/services/warrantyMediaService.js. Update both when changing.

export const STATUSES = [
  'submitted',
  'under_review',
  'approved',
  'with_manufacturer',
  'awaiting_customer',
  'resolved',
  'rejected',
  'closed'
];

export const STAFF_ALLOWED_STATUSES = new Set([
  'under_review', 'approved', 'with_manufacturer', 'awaiting_customer', 'resolved'
]);

export const STATUS_TRANSITIONS = {
  submitted:         ['under_review', 'rejected', 'closed'],
  under_review:      ['approved', 'rejected', 'with_manufacturer', 'awaiting_customer'],
  approved:          ['with_manufacturer', 'resolved', 'awaiting_customer'],
  with_manufacturer: ['awaiting_customer', 'resolved', 'rejected'],
  awaiting_customer: ['under_review', 'resolved', 'rejected', 'closed'],
  resolved:          ['closed'],
  rejected:          ['closed'],
  closed:            []
};

export function legalNextStatuses(currentStatus, { isStaff = false } = {}) {
  const next = STATUS_TRANSITIONS[currentStatus] || [];
  if (isStaff) return next.filter((s) => STAFF_ALLOWED_STATUSES.has(s));
  return next;
}

export const STATUS_PALETTE = {
  submitted:         { tag: 'blue',    bg: 'bg-blue-50',    text: 'text-blue-700',    dot: 'bg-blue-500' },
  under_review:      { tag: 'cyan',    bg: 'bg-cyan-50',    text: 'text-cyan-700',    dot: 'bg-cyan-500' },
  approved:          { tag: 'green',   bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  with_manufacturer: { tag: 'purple',  bg: 'bg-violet-50',  text: 'text-violet-700',  dot: 'bg-violet-500' },
  awaiting_customer: { tag: 'gold',    bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-500' },
  resolved:          { tag: 'green',   bg: 'bg-emerald-100', text: 'text-emerald-800', dot: 'bg-emerald-600' },
  rejected:          { tag: 'red',     bg: 'bg-rose-50',    text: 'text-rose-700',    dot: 'bg-rose-500' },
  closed:            { tag: 'default', bg: 'bg-slate-100',  text: 'text-slate-700',   dot: 'bg-slate-500' }
};

// Mirror of backend/services/warrantyMediaService.js — kept here so the
// client can reject oversized files BEFORE starting an upload that would
// be rejected on the server.
export const MAX_PHOTO_SIZE = 30 * 1024 * 1024;
export const MAX_VIDEO_SIZE = 500 * 1024 * 1024;
export const MAX_DOCUMENT_SIZE = 50 * 1024 * 1024;
export const MAX_TOTAL_PER_CLAIM = 1500 * 1024 * 1024;
export const MAX_PHOTOS = 10;
export const MAX_VIDEOS = 3;
export const MAX_DOCUMENTS = 20;
export const MAX_FILES_PER_REQUEST = MAX_PHOTOS + MAX_VIDEOS + MAX_DOCUMENTS;

export const PHOTO_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
export const VIDEO_MIMES = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo'];
// "Product Bill" documents — PDF only, staff/admin contexts only.
export const DOCUMENT_MIMES = ['application/pdf'];
export const ACCEPT_ATTRIBUTE = [...PHOTO_MIMES, ...VIDEO_MIMES].join(',');
export const ACCEPT_ATTRIBUTE_WITH_DOCS = [...PHOTO_MIMES, ...VIDEO_MIMES, ...DOCUMENT_MIMES].join(',');

export const TOKEN_REGEX = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/;

export function kindForMime(mime) {
  const m = (mime || '').toLowerCase();
  if (PHOTO_MIMES.includes(m)) return 'photo';
  if (VIDEO_MIMES.includes(m)) return 'video';
  if (DOCUMENT_MIMES.includes(m)) return 'document';
  return null;
}

export function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = Number(bytes);
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  const fixed = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(fixed)} ${units[i]}`;
}
