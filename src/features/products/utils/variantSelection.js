// src/features/products/utils/variantSelection.js
//
// Pure helpers for picking a (colour, size) combination at point of sale.
// Shared by the admin New Sale drawer and the front-desk Quick Sale modal so
// the colour×size matrix stock/price logic lives in exactly one place.
//
// A "matrix" product carries a `color` on its variants, so stock and price
// depend on BOTH colour and size, and the available sizes must be filtered by
// the chosen colour. Older size-only products keep an independent size list
// (from variants[].label or sizes[]) plus a separate colour list.

export function parseJSON(field) {
  if (!field) return null;
  if (typeof field === 'string') {
    try { return JSON.parse(field); } catch { return null; }
  }
  return field;
}

/** Colours as a flat string list — handles [{name,code}] objects or strings. */
export function normalizeColors(raw) {
  const parsed = parseJSON(raw);
  if (!Array.isArray(parsed) || parsed.length === 0) return [];
  if (typeof parsed[0] === 'string') return parsed;
  return parsed.map((c) => c.name || c.label || c.code || String(c)).filter(Boolean);
}

/** Flat size-only options for a legacy product: [{ label, stock, price }]. */
export function buildSizeOptions(product) {
  const variants = parseJSON(product.variants);
  if (Array.isArray(variants) && variants.length > 0) {
    return variants
      .filter((v) => v.label || v.size)
      .map((v) => ({
        label: v.label || v.size || String(v.key),
        stock: v.quantity ?? v.stock ?? 0,
        price: v.price ?? v.price_final ?? null,
      }));
  }
  const sizes = parseJSON(product.sizes);
  if (Array.isArray(sizes) && sizes.length > 0) {
    const labels = typeof sizes[0] === 'string'
      ? sizes
      : sizes.map((s) => s.label || s.name || s.size || String(s)).filter(Boolean);
    return labels.map((s) => ({ label: s, stock: null, price: null }));
  }
  return [];
}

/** Classify a product's variant model. Returns { isMatrix, variants, colors }. */
export function buildVariantIndex(product) {
  const variants = parseJSON(product.variants);
  const arr = Array.isArray(variants) ? variants : [];
  const isMatrix = arr.some((v) => v && v.color);
  if (isMatrix) {
    return { isMatrix: true, variants: arr, colors: [...new Set(arr.map((v) => v.color).filter(Boolean))] };
  }
  return { isMatrix: false, variants: arr, colors: normalizeColors(product.colors) };
}

/** Size options available for the chosen colour (matrix) or the flat list. */
export function sizeOptionsFor({ isMatrix, variants, sizeOptions, color }) {
  if (isMatrix) {
    if (!color) return [];
    return (variants || [])
      .filter((v) => v.color === color)
      .map((v) => ({
        label: v.size || v.label,
        stock: v.quantity ?? v.stock ?? 0,
        price: v.price ?? v.price_final ?? null,
      }));
  }
  return sizeOptions || [];
}

/** Resolve stock + price for the chosen (colour, size) combination. */
export function resolveCombo({ isMatrix, variants, sizeOptions, color, size }) {
  if (isMatrix) {
    if (!color || !size) return { stock: null, price: null };
    const v = (variants || []).find(
      (x) => x.color === color && (x.size === size || x.label === size),
    );
    return { stock: v ? (v.quantity ?? v.stock ?? 0) : 0, price: v ? (v.price ?? v.price_final ?? null) : null };
  }
  if (!size) return { stock: null, price: null };
  const opt = (sizeOptions || []).find((o) => o.label === size);
  return { stock: opt?.stock ?? null, price: opt?.price ?? null };
}
