import { BLANK } from './constants';
import { foldText } from './text';

// One canonical size bucket per unit. The same key drives the grid columns, the
// size chips, the URL `size=` values and the season-plan rows, so "7m", "7",
// "7.0m" and "7 m" all land in the 7m column instead of four.
export const APPAREL_ORDER = ['KIDS', 'XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
// Board keys are ASCII so they survive URLs; labels come from i18n (`inventory.bands.*`).
export const BOARD_BANDS = ['<=134', '135-140', '141-145', '146+', 'directional'];
const BAND_LABEL_ID = { '<=134': 'small', '135-140': 'medium', '141-145': 'large', '146+': 'xl', directional: 'directional' };

const APPAREL_ALIASES = {
  COCUK: 'KIDS', KID: 'KIDS', KIDS: 'KIDS', CHILD: 'KIDS', JUNIOR: 'KIDS', JR: 'KIDS',
  SMALL: 'S', MEDIUM: 'M', LARGE: 'L', XLARGE: 'XL', 'X-LARGE': 'XL',
};

export const parseMetres = (raw) => {
  const m = String(raw ?? '').trim().replace(',', '.').match(/^(\d{1,2}(?:\.\d+)?)\s*(?:m|m2|m²|qm|sqm)?$/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
};

const metresKey = (n) => `${Number(n.toFixed(2))}m`;

// Boards are stored as their own dimension string (136cm, 136x40cm, 138x41.5cm), so
// grouping on it raw would make every board its own size. They are bucketed into the
// length bands a school plans around; directionals (feet-inch) are their own band.
export const boardBand = (raw) => {
  const s = String(raw ?? '').trim();
  if (!s) return BLANK;
  if (s.includes("'") || s.includes('"') || /^\d{1,2}'\d/.test(s)) return 'directional';
  const length = parseInt(s, 10);
  if (!Number.isFinite(length)) return s;
  if (length <= 134) return '<=134';
  if (length <= 140) return '135-140';
  if (length <= 145) return '141-145';
  return '146+';
};

const rangeKey = (s, anchored) => {
  const m = s.match(anchored ? /^(\d{2})(?:\s*-\s*(\d{2}))?$/ : /^(\d{2})(?:\s*-\s*(\d{2}))?/);
  if (!m) return null;
  return m[2] ? `${m[1]}-${m[2]}` : m[1];
};

// `item.typeKey` (or `item.type`) must already be the lower-cased type value.
export function sizeKey(item) {
  const type = String(item.typeKey || item.type || '').trim().toLowerCase();
  const raw = String(item.size ?? '').trim();
  if (!raw) return BLANK;
  switch (type) {
    case 'kite':
    case 'wing/foil': {
      const n = parseMetres(raw);
      return n === null ? raw : metresKey(n);
    }
    case 'board':
      return boardBand(raw);
    case 'control bar':
      return rangeKey(raw, false) || raw;
    case 'footwear':
      return rangeKey(raw, true) || raw;
    case 'harness':
    case 'wetsuit':
    case 'safety gear': {
      const upper = foldText(raw).toUpperCase();
      return APPAREL_ALIASES[upper] || upper;
    }
    default:
      return raw;
  }
}

const BAND_FALLBACK = {
  '<=134': '≤134 cm (small)', '135-140': '135–140 cm (medium)', '141-145': '141–145 cm (large)', '146+': '146+ cm (XL)', directional: 'Directional',
};

export function sizeLabel(key, type, t) {
  if (key === BLANK) return t('common:inventory.noSize', { defaultValue: 'No size' });
  if (key === 'KIDS') return t('common:inventory.sizeKids', { defaultValue: 'Kids' });
  if (type === 'board' && BAND_LABEL_ID[key]) {
    return t(`common:inventory.bands.${BAND_LABEL_ID[key]}`, { defaultValue: BAND_FALLBACK[key] });
  }
  if (type === 'control bar' && /^\d{2}(-\d{2})?$/.test(key)) return `${key.replace('-', '–')} cm`;
  if (type === 'footwear' && /^\d{2}(-\d{2})?$/.test(key)) return `EU ${key.replace('-', '–')}`;
  return key;
}

const leadingNumber = (s) => parseFloat(String(s).replace(/^[≤<>=]+/, '').replace(',', '.'));

export function compareSizes(a, b) {
  if (a === b) return 0;
  if (a === BLANK) return 1;
  if (b === BLANK) return -1;
  const ia = APPAREL_ORDER.indexOf(String(a).toUpperCase());
  const ib = APPAREL_ORDER.indexOf(String(b).toUpperCase());
  if (ia !== -1 || ib !== -1) return ia === -1 ? 1 : ib === -1 ? -1 : ia - ib;
  const ba = BOARD_BANDS.indexOf(a);
  const bb = BOARD_BANDS.indexOf(b);
  if (ba !== -1 || bb !== -1) return ba === -1 ? 1 : bb === -1 ? -1 : ba - bb;
  const na = leadingNumber(a);
  const nb = leadingNumber(b);
  const aNum = Number.isFinite(na);
  const bNum = Number.isFinite(nb);
  if (aNum && bNum && na !== nb) return na - nb;
  if (aNum !== bNum) return aNum ? -1 : 1;
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}
