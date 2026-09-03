import { BLANK, CONDITION_VALUES, STATUS_VALUES } from './constants';
import { SUBTYPE_IDS } from './subtype';

// Filters live in the URL so a view like "kites, 7m, in maintenance" can be shared,
// survives a reload and is undone by Back. Display preferences (grid/list/cards,
// merge model years) are personal and stay in localStorage.
export const TABS = ['inventory', 'stocktake', 'planning'];
// grid = one row per model with its sizes as chips; matrix = model × size table.
export const VIEW_MODES = ['grid', 'matrix', 'list', 'cards'];

const NONE_TOKEN = 'none';
const list = (sp, key) => (sp.get(key) || '').split(',').map((s) => s.trim()).filter(Boolean);

export const filtersFromSearchParams = (sp, knownTypes = null) => {
  const rawType = sp.get('type');
  const type = rawType && (!knownTypes || knownTypes.has(rawType)) ? rawType : null;
  return {
    q: (sp.get('q') || '').trim(),
    type,
    // Sizes and sub-types are scoped to a type; without one they mean nothing.
    sizes: type ? list(sp, 'size').map((s) => (s === NONE_TOKEN ? BLANK : s)) : [],
    subtypes: type ? list(sp, 'sub').filter((s) => SUBTYPE_IDS.has(s)) : [],
    brands: list(sp, 'brand'),
    conditions: list(sp, 'cond').filter((c) => CONDITION_VALUES.includes(c)),
    statuses: list(sp, 'status').filter((s) => STATUS_VALUES.includes(s)),
  };
};

export const tabFromSearchParams = (sp) => (TABS.includes(sp.get('tab')) ? sp.get('tab') : 'inventory');

// Returns a new URLSearchParams with the filter keys rewritten and everything else
// kept. `tab` is only touched when given; 'inventory' is the default and is omitted.
export const writeFiltersToSearchParams = (prev, filters, tab) => {
  const next = new URLSearchParams(prev);
  const set = (key, value) => (value ? next.set(key, value) : next.delete(key));
  set('q', (filters.q || '').trim());
  set('type', filters.type || '');
  set('size', filters.type ? filters.sizes.map((s) => (s === BLANK ? NONE_TOKEN : s)).join(',') : '');
  set('sub', filters.type ? filters.subtypes.join(',') : '');
  set('brand', filters.brands.join(','));
  set('cond', filters.conditions.join(','));
  set('status', filters.statuses.join(','));
  if (tab !== undefined) set('tab', tab === 'inventory' ? '' : tab);
  return next;
};

export const readStoredPref = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw === null || raw === undefined ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
};

export const writeStoredPref = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
};

// Older builds stored 'table' and used the view switcher for stock-take/planning,
// which are tabs now.
export const migrateStoredView = (v) => (v === 'table' ? 'list' : VIEW_MODES.includes(v) ? v : 'grid');
