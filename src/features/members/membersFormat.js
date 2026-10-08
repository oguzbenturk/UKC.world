// Pure helpers for the staff Members page (no React).
//
// Every status here is EFFECTIVE (expiry-aware): the backend sends computed_status
// (cancelled / expired / stored status), and the page refines "active" into
// "expiring" (ends within 7 days) and "upcoming" (starts in the future).

export const DAY_MS = 24 * 3600 * 1000;
export const EXPIRING_DAYS = 7;
export const RECENT_EXPIRED_DAYS = 30;

export const VIEWS = ['all', 'active', 'expiring', 'expired', 'storage', 'beach'];
export const SORTS = ['attention', 'expiry', 'purchased', 'name'];

/** Whole days from now until `iso` (negative = in the past), or null. */
export const daysUntil = (iso, now = Date.now()) => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.ceil((t - now) / DAY_MS);
};

/**
 * Display state of a purchase:
 *   cancelled | pending | expired | upcoming | expiring | active
 */
export function memberState(p, now = Date.now()) {
  const cs = p?.computed_status || p?.status;
  if (cs === 'cancelled') return 'cancelled';
  if (cs === 'pending' || cs === 'pending_payment') return 'pending';
  if (cs === 'expired') return 'expired';
  const startsIn = daysUntil(p?.purchased_at, now);
  if (startsIn != null && startsIn > 0) return 'upcoming';
  const left = daysUntil(p?.expires_at, now);
  if (left != null && left <= EXPIRING_DAYS) return 'expiring';
  return 'active';
}

/** Family of a purchase: beach | storage | other (backend offering_family). */
export const familyOf = (p) => p?.offering_family || (p?.offering_category === 'storage' ? 'storage' : 'other');

export const typeKeyOf = (p) => `${familyOf(p)}:${p?.offering_duration || 'other'}`;

/** Does the purchase belong to the chip `view`? */
export function inView(p, view, now = Date.now()) {
  const state = memberState(p, now);
  switch (view) {
    // Same as the stats endpoint: effective active, including ending soon and starting later.
    case 'active': return state === 'active' || state === 'expiring' || state === 'upcoming';
    case 'expiring': return state === 'expiring';
    case 'expired': return state === 'expired';
    case 'storage': return familyOf(p) === 'storage';
    case 'beach': return familyOf(p) === 'beach';
    default: return true;
  }
}

const matchesQuery = (p, q) => {
  if (!q) return true;
  const hay = [
    p.user_name, p.user_email, p.user_phone, p.offering_name, p.current_offering_name,
    p.storage_unit != null ? `#${p.storage_unit}` : null,
  ].filter(Boolean).join(' ').toLocaleLowerCase();
  return q.toLocaleLowerCase().split(/\s+/).filter(Boolean).every((part) => hay.includes(part));
};

// "Needs attention first": ending soonest → recently expired → starting soon →
// the rest by expiry → long-expired / cancelled last.
const ATTENTION_RANK = { expiring: 0, expired: 1, upcoming: 2, pending: 2, active: 3, cancelled: 5 };

const expiryMs = (p) => (p?.expires_at ? new Date(p.expires_at).getTime() : Infinity);

export function selectMembers(list = [], { view = 'all', type = 'all', query = '', sort = 'attention' } = {}, now = Date.now()) {
  const out = list.filter((p) => inView(p, view, now)
    && (type === 'all' || typeKeyOf(p) === type)
    && matchesQuery(p, query.trim()));
  const rank = (p) => {
    const state = memberState(p, now);
    if (state === 'expired') {
      const ago = -(daysUntil(p.expires_at, now) ?? 9999);
      return ago <= RECENT_EXPIRED_DAYS ? 1 : 4;
    }
    return ATTENTION_RANK[state] ?? 3;
  };
  const cmp = {
    attention: (a, b) => rank(a) - rank(b)
      || (rank(a) === 1 || rank(a) === 4 ? expiryMs(b) - expiryMs(a) : expiryMs(a) - expiryMs(b)),
    expiry: (a, b) => expiryMs(a) - expiryMs(b),
    purchased: (a, b) => new Date(b.purchased_at || 0) - new Date(a.purchased_at || 0),
    name: (a, b) => String(a.user_name || '').localeCompare(String(b.user_name || ''), undefined, { sensitivity: 'base' }),
  }[sort] || (() => 0);
  return out.sort((a, b) => cmp(a, b) || (a.id - b.id));
}

/** Counts per chip view for the loaded purchases (matches the stats endpoint). */
export function countViews(list = [], now = Date.now()) {
  const counts = Object.fromEntries(VIEWS.map((v) => [v, 0]));
  list.forEach((p) => VIEWS.forEach((v) => { if (inView(p, v, now)) counts[v] += 1; }));
  return counts;
}

/** Start date for a renewal: the day after the current one ends, or today if already over. */
export function renewalStart(p, now = Date.now()) {
  const ends = p?.expires_at ? new Date(p.expires_at).getTime() : null;
  const from = ends && ends > now ? ends : now;
  return new Date(from).toISOString().slice(0, 10);
}

/** Shared box: more than one live holder on the same storage unit. */
export function sharedUnits(list = [], now = Date.now()) {
  const counts = {};
  list.forEach((p) => {
    const state = memberState(p, now);
    if (p.storage_unit != null && ['active', 'expiring', 'upcoming', 'pending'].includes(state)) {
      counts[p.storage_unit] = (counts[p.storage_unit] || 0) + 1;
    }
  });
  return new Set(Object.keys(counts).filter((k) => counts[k] > 1).map(Number));
}
