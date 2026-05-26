// Shared warranty-email helpers — status labels and the customer/staff URLs
// every warranty email needs to render. Imported by every warranty*.js
// template module so we don't repeat the per-language label map.

export const FRONTEND_BASE = (
  process.env.APP_BASE_URL
  || process.env.FRONTEND_URL
  || process.env.PUBLIC_APP_URL
  || 'https://ukc.plannivo.com'
).replace(/\/$/, '');

export function customerTrackUrl(token) {
  return `${FRONTEND_BASE}/care/track/${token}`;
}

export function staffPortalUrl(token) {
  return `${FRONTEND_BASE}/care/staff/${token}`;
}

const STATUS_LABELS = {
  tr: {
    submitted:         'Talep alındı',
    under_review:      'İnceleniyor',
    approved:          'Onaylandı',
    with_manufacturer: 'Üreticide',
    awaiting_customer: 'Sizden bilgi bekleniyor',
    resolved:          'Çözüldü',
    rejected:          'Reddedildi',
    closed:            'Kapatıldı'
  },
  en: {
    submitted:         'Submitted',
    under_review:      'Under review',
    approved:          'Approved',
    with_manufacturer: 'With manufacturer',
    awaiting_customer: 'Waiting for your reply',
    resolved:          'Resolved',
    rejected:          'Rejected',
    closed:            'Closed'
  }
};

export function statusLabel(status, lang = 'en') {
  const langLabels = STATUS_LABELS[lang] || STATUS_LABELS.en;
  return langLabels[status] || status;
}

export const SUPPORT_EMAIL = 'info@plannivo.com';
