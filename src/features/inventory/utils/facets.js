import { sizeKey } from './sizeKeys';
import { subtypesOf } from './subtype';
import { familyName } from './familyName';
import { foldText } from './text';

export const EMPTY_FILTERS = Object.freeze({
  q: '',
  type: null,
  sizes: [],
  subtypes: [],
  brands: [],
  conditions: [],
  statuses: [],
});

// GET /equipment returns raw DB rows (snake_case): the status lives in `availability`
// and the asset code in `serial_number`. Everything the page needs is derived once
// here so every memo, chip and export works off the same shape.
export const normalizeUnit = (row) => {
  const typeKey = String(row.type || '').trim().toLowerCase() || 'other';
  const base = {
    ...row,
    typeKey,
    name: String(row.name || '').trim(),
    brand: String(row.brand || '').trim(),
    size: row.size == null ? '' : String(row.size).trim(),
    status: String(row.availability || row.status || 'available').toLowerCase(),
    condition: String(row.condition || '').toLowerCase(),
    serialNumber: row.serialNumber || row.serial_number || '',
    imageUrl: row.imageUrl || row.image_url || null,
  };
  base.sizeKey = sizeKey(base);
  base.subtypes = subtypesOf(base);
  base.family = familyName(base);
  base.searchBlob = foldText(
    [base.name, base.brand, base.size, base.sizeKey, base.serialNumber, row.notes, row.location, base.family].join(' ')
  );
  return base;
};

export const brandKey = (unit) => unit.brand || 'Other';

export const isFilterActive = (f) => Boolean(
  (f.q && f.q.trim()) || f.type || f.sizes.length || f.subtypes.length ||
  f.brands.length || f.conditions.length || f.statuses.length
);

const NONE = new Set();
const setOrNull = (list) => (list && list.length ? new Set(list) : null);

// `skip` names facets to ignore, which is how each facet is counted against the
// set filtered by every *other* facet.
export const applyFilters = (units, f, skip = NONE) => {
  const q = skip.has('q') ? '' : foldText(f.q || '');
  const type = skip.has('type') ? null : f.type;
  const sizes = skip.has('sizes') ? null : setOrNull(f.sizes);
  const subtypes = skip.has('subtypes') ? null : setOrNull(f.subtypes);
  const brands = skip.has('brands') ? null : setOrNull(f.brands);
  const conditions = skip.has('conditions') ? null : setOrNull(f.conditions);
  const statuses = skip.has('statuses') ? null : setOrNull(f.statuses);
  return units.filter((u) =>
    (!q || u.searchBlob.includes(q)) &&
    (!type || u.typeKey === type) &&
    (!sizes || sizes.has(u.sizeKey)) &&
    (!subtypes || u.subtypes.some((s) => subtypes.has(s))) &&
    (!brands || brands.has(brandKey(u))) &&
    (!conditions || conditions.has(u.condition)) &&
    (!statuses || statuses.has(u.status))
  );
};

export const countBy = (units, keyFn) => {
  const out = {};
  for (const u of units) {
    const k = keyFn(u);
    if (k === undefined || k === null) continue;
    out[k] = (out[k] || 0) + 1;
  }
  return out;
};

export const countByMulti = (units, keysFn) => {
  const out = {};
  for (const u of units) for (const k of keysFn(u) || []) out[k] = (out[k] || 0) + 1;
  return out;
};

export const buildFacets = (units, f) => {
  const src = (skip) => applyFilters(units, f, new Set(skip));
  return {
    result: applyFilters(units, f),
    type: countBy(src(['type', 'sizes', 'subtypes']), (u) => u.typeKey),
    size: f.type ? countBy(src(['sizes']), (u) => u.sizeKey) : null,
    subtype: f.type ? countByMulti(src(['subtypes']), (u) => u.subtypes) : null,
    brand: countBy(src(['brands']), brandKey),
    condition: countBy(src(['conditions']), (u) => u.condition),
    status: countBy(src(['statuses']), (u) => u.status),
  };
};

export const toggleIn = (list, value) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

// ── Status tallies shared by groups, grid cells and drawer slices ───────────
export const emptyCounts = () => ({ count: 0, available_count: 0, in_use_count: 0, maintenance_count: 0, retired_count: 0 });

export const tallyStatus = (target, status) => {
  target.count++;
  if (status === 'available') target.available_count++;
  else if (status === 'in-use') target.in_use_count++;
  else if (status === 'maintenance') target.maintenance_count++;
  else if (status === 'retired') target.retired_count++;
};

// The worst status in a cell decides its colour, so a size with one kite in the
// workshop reads orange even when the other three are on the beach.
export const cellColor = (c) =>
  c.maintenance_count > 0 ? 'warning'
    : c.in_use_count > 0 ? 'processing'
    : c.available_count > 0 ? 'success'
    : 'default';

// Recount a group (and its full `base` group, if sliced) after a unit changed status.
export const retally = (group) => {
  if (!group) return group;
  const next = { ...group, ...emptyCounts(), cells: {}, sizes: {} };
  for (const u of group.units) {
    tallyStatus(next, u.status);
    const cell = next.cells[u.sizeKey] || (next.cells[u.sizeKey] = { size: u.sizeKey, ...emptyCounts() });
    tallyStatus(cell, u.status);
    const sz = u.size || '—';
    next.sizes[sz] = (next.sizes[sz] || 0) + 1;
  }
  if (group.base) next.base = retally(group.base);
  return next;
};
