import { foldText, tokensOf } from './text';

// Sub-types are derived from the unit's name because the DB has no column for
// them (`model` is NULL on every row). Keywords are matched folded (see text.js),
// so "Can Yeleği", "Çocuk" and "5 İp" are matched by their ASCII forms. Within a
// type the `exclusive` rules pick the first hit only (a `fallback` rule catches the
// rest); `flags` are additive so "Çocuk Shorty" reads as shorty + kids.
const FIVE_LINE = ['5 ip', '5ip', '5-line', '5 line', 'five line'];

export const SUBTYPE_RULES = {
  harness: {
    exclusive: [
      { id: 'seat', words: ['seat', 'sit', 'oturak', 'oturma'] },
      { id: 'waist', words: ['belt', 'waist', 'bel', 'apex', 'riot', 'exo', 'freestyler', 'vartex', 'sol'] },
    ],
  },
  wetsuit: {
    exclusive: [
      { id: 'shorty', words: ['shorty', 'short', 'kisa', 'spring'] },
      // "Element 4'3" / "Wetsuit 5/4": a thickness token means a full suit.
      { id: 'full', words: ['full', 'long', 'uzun', 'steamer'], tokenRe: /^[3-6][/.']\d$/ },
    ],
    flags: [{ id: 'kids', words: ['cocuk', 'kids', 'kid', 'child', 'junior', 'jr'], sizeKeys: ['KIDS'] }],
  },
  'safety gear': {
    exclusive: [
      { id: 'impact', words: ['impact'] },
      { id: 'helmet', words: ['kask', 'helmet', 'casque'] },
      { id: 'lifevest', phrases: ['can yeleg', 'life vest', 'lifejacket', 'life jacket'], words: ['pfd', 'buoyancy', 'yelek'] },
    ],
  },
  board: {
    exclusive: [
      { id: 'directional', words: ['surf', 'directional', 'wave'], sizeKeys: ['directional'] },
      { id: 'twintip', fallback: true },
    ],
  },
  'control bar': {
    exclusive: [
      { id: '5line', phrases: FIVE_LINE },
      { id: '4line', fallback: true },
    ],
  },
  kite: {
    exclusive: [
      { id: '5line', phrases: FIVE_LINE },
      { id: 'trainer', words: ['trainer', 'egitim', 'antrenman'] },
    ],
  },
  'wing/foil': {
    exclusive: [
      { id: 'mast', words: ['mast', 'direk'] },
      { id: 'wing', words: ['wing', 'kanat', 'sky', 'skywing'] },
      { id: 'foil', words: ['foil', 'fuselage', 'plate', 'board', 'tahta'] },
    ],
  },
  accessory: {
    exclusive: [
      { id: 'pump', words: ['pompa', 'pump'] },
      { id: 'leash', words: ['leash', 'lish'] },
    ],
  },
};

export const SUBTYPE_IDS = new Set(
  Object.values(SUBTYPE_RULES).flatMap((r) => [...(r.exclusive || []), ...(r.flags || [])].map((x) => x.id))
);

// Rail order for a type: exclusive ids first, then flags.
export const subtypeOrder = (typeKey) => {
  const r = SUBTYPE_RULES[typeKey];
  return r ? [...(r.exclusive || []), ...(r.flags || [])].map((x) => x.id) : [];
};

// `unit` needs `typeKey`, `name` and `sizeKey`.
export const subtypesOf = (unit) => {
  const rules = SUBTYPE_RULES[unit.typeKey];
  if (!rules) return [];
  const folded = foldText(unit.name);
  const tokens = tokensOf(unit.name);
  const tokenSet = new Set(tokens);
  const hit = (r) =>
    (r.words && r.words.some((w) => tokenSet.has(w))) ||
    (r.phrases && r.phrases.some((p) => folded.includes(p))) ||
    (r.tokenRe && tokens.some((t) => r.tokenRe.test(t))) ||
    (r.sizeKeys && r.sizeKeys.includes(unit.sizeKey));
  const out = [];
  const exclusive = (rules.exclusive || []).find((r) => r.fallback || hit(r));
  if (exclusive) out.push(exclusive.id);
  for (const flag of rules.flags || []) if (hit(flag)) out.push(flag.id);
  return out;
};
