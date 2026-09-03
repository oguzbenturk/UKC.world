import { foldText } from './text';

// Staff enter one model under several spellings: "Mono", "Mono 22", "Mono 22 Kite",
// "Mono 24"; "Tribord", "Tribord Wetsuit", "Wetsuit Tribord". Grouping on the raw
// name scatters a single model over five rows. The family name drops the brand, the
// type's own noun and year/size numbers, which folds those spellings into one "Mono"
// row. The original spelling stays on each unit and is shown as its entered name.
// All words are compared folded (see text.js), so "Uçurtma" and "ucurtma" both match.
export const TYPE_NOISE_WORDS = {
  kite: ['kite', 'kites', 'ucurtma'],
  wetsuit: ['wetsuit', 'wetsuits', 'suit', 'mono'],
  board: ['board', 'boards', 'tahta'],
  'control bar': ['bar', 'bars'],
  harness: ['harness', 'harnesses', 'trapez'],
  footwear: ['ayakkabi', 'shoe', 'shoes', 'boot', 'boots', 'bot'],
  'wing/foil': ['wing', 'wings', 'kanat', 'foil'],
};
export const BRAND_ALIASES = {
  'liquid force': ['lf'],
  'neil pryde': ['np'],
  duotone: ['dtk', 'dt'],
  "o'neill": ['oneill'],
};
// "22" / "2024" (a model year) and "15.5" / "9m" (a size typed into the name).
const YEAR_OR_SIZE_TOKEN = /^(?:(?:19|20)\d{2}|\d{1,2}(?:[.,]\d+)?m|\d{2}(?:[.,]\d+)?)$/;

const words = (s) => foldText(String(s || '').replace(/[(),]/g, ' ')).split(/\s+/).filter(Boolean);

export const familyName = (item) => {
  const type = String(item.typeKey || item.type || '').trim().toLowerCase();
  const brand = foldText(item.brand || '');
  const noise = new Set(TYPE_NOISE_WORDS[type] || []);
  const brandTokens = new Set(
    brand === 'other' ? [] : [...words(brand), ...(BRAND_ALIASES[brand] || [])]
  );
  return words(item.name)
    .filter((tok) => !noise.has(tok) && !brandTokens.has(tok) && !YEAR_OR_SIZE_TOKEN.test(tok))
    .join(' ');
};
