// Shared design tokens + structural constants for the Teklif (proposal) feature.
// Used by the HTML preview AND the jsPDF generator so they stay visually in sync.
// Palette = Duotone brand (Antrasit + Duotone Blue) blended with the billing PDF polish.

export const BRAND = {
  antrasit: '#4B4F54',
  antrasitDk: '#383B40',
  antrasitLt: '#6B6F75',
  blue: '#009EE2',
  blueDk: '#0077B0',
  blueTint: '#EAF6FC',
  blueTextSoft: '#CDEBF8',
  ink: '#3A3D42',
  muted: '#6B6F75',
  rowLight: '#F4F5F6',
  rowStripe: '#FBFBFC',
  border: '#DCDEE1',
  white: '#FFFFFF',
};

// Languages the PDF/preview can be generated in (matches app SUPPORTED_LANGUAGES).
export const OUTPUT_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'tr', label: 'Türkçe' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'ru', label: 'Русский' },
  { code: 'es', label: 'Español' },
];

// Section order + which sections render numbered. (terms is unnumbered, like the prototype.)
export const SECTION_ORDER = [
  'intro', 'package_items', 'price_summary', 'included', 'schedule', 'benefits', 'terms',
];

export const DEFAULT_BRAND = {
  title: 'DUOTONE PRO CENTER URLA',
  subtitle: 'UKC  -  Urla, Izmir, Turkey',
  website: 'ukc.plannivo.com',
  footer_left: 'Duotone Pro Center Urla  (UKC)  |  Urla, Izmir, Turkey',
  footer_right: '',
};

/** Fresh empty document (mirrors backend buildDefaultContent). */
export function buildDefaultContent() {
  return {
    brand: { ...DEFAULT_BRAND },
    sections: {
      intro: true,
      package_items: true,
      price_summary: true,
      included: true,
      schedule: true,
      benefits: true,
      terms: true,
    },
    intro: {},
    package_items: [],
    price_summary: {
      regular_total: '',
      savings: '',
      cash_price: '',
      regular_sub: {},
      savings_sub: {},
      cash_sub: {},
      _auto: { regular_total: true, savings: true, cash_price: true },
      _amounts: { regular_total: 0, savings: 0, cash_price: 0 },
    },
    included: [],
    schedule_note: {},
    schedule: [],
    benefits: [],
    terms: [],
  };
}

/** Convert "#RRGGBB" → [r,g,b] for jsPDF. */
export function hexToRgb(hex) {
  const h = String(hex || '').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
