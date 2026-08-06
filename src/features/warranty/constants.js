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

/**
 * Turn an upload failure into something a human can act on.
 *
 * Every warranty upload surface used to do `err?.response?.data?.error || generic`,
 * which silently collapses to the generic message whenever the response body is
 * NOT the API's JSON — and that is exactly what happens on the failures that
 * matter most for video uploads:
 *   • 413 from nginx  → an HTML error page, no `.error` field
 *   • request never completed (dropped mobile uplink, axios timeout) → no response at all
 * Both used to read as "Could not submit your claim. Please try again.", which
 * told the customer nothing and sent them into an endless retry loop.
 */
export function uploadErrorMessage(err, t, fallback) {
  const generic = fallback
    || t('public:warranty.upload.errorGeneric', 'Upload failed. Please try again.');

  const res = err?.response;

  if (!res) {
    const timedOut = err?.code === 'ECONNABORTED'
      || /timeout/i.test(err?.message || '');
    return timedOut
      ? t('public:warranty.upload.errorTimeout',
          'The upload timed out. Large videos need a stable connection — try again on Wi-Fi, or attach a shorter clip.')
      : t('public:warranty.upload.errorNetwork',
          'The connection dropped while uploading. Please check your internet and try again.');
  }

  // The API answers with structured JSON — always prefer its precise message.
  const data = res.data;
  if (data && typeof data === 'object' && (data.error || data.message)) {
    return data.error || data.message;
  }

  switch (res.status) {
    case 413:
      return t('public:warranty.upload.errorTooLarge',
        'The files are too large to upload. Videos may be up to {{video}} MB each and photos up to {{photo}} MB.',
        {
          video: Math.round(MAX_VIDEO_SIZE / 1024 / 1024),
          photo: Math.round(MAX_PHOTO_SIZE / 1024 / 1024)
        });
    case 415:
      return t('public:warranty.upload.errorType',
        'One of the files is a type we cannot accept. Photos: JPG, PNG, WEBP, HEIC. Videos: MP4, MOV, WEBM.');
    case 429:
      return t('public:warranty.upload.errorRateLimit',
        'Too many attempts from this connection. Please wait a while and try again.');
    default:
      if (res.status >= 500) {
        return t('public:warranty.upload.errorServer',
          'Our server could not accept the upload. Please try again in a moment.');
      }
      return generic;
  }
}
