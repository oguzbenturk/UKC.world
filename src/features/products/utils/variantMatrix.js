// src/features/products/utils/variantMatrix.js
//
// Pure (color × size) ⇄ variants[] conversion used by VariantMatrix.jsx.
// Kept out of the component so the stock-grid contract can be unit tested
// without pulling in React/antd — mirrors productImagePayload.js.
//
// The emitted variant object carries BOTH naming conventions so no downstream
// consumer needs to special-case it:
//   { color, label, size, quantity, stock, price, price_final, cost_price }
//   • label + quantity → backend per-variant stock decrement (shopOrders.js)
//   • size  + stock    → customer storefront per-combo availability/greying
//   • color            → storefront colour chips + per-colour image buckets

// Separator for the internal (color, size) cell key. A space keeps keys
// readable; collisions across distinct (color, size) pairs are impossible
// because both halves are matched back by exact membership in their lists.
export const SEP = ' ';
export const cellKey = (color, size) => `${color}${SEP}${size}`;

/**
 * Rebuild grid state from an existing variants[] array (edit mode).
 * Returns { sizes, cells, sizePrice, sizeCost, legacyBySize } where
 * `legacyBySize` holds quantities from colour-less (size-only) variants that
 * cannot be placed in a colour cell — surfaced to the user as a re-entry hint.
 */
export const hydrateMatrix = (value) => {
  const sizes = [];
  const cells = {};
  const sizePrice = {};
  const sizeCost = {};
  const legacyBySize = {};
  for (const v of Array.isArray(value) ? value : []) {
    const size = String(v?.size ?? v?.label ?? '').trim();
    if (!size) continue;
    if (!sizes.includes(size)) sizes.push(size);
    if (sizePrice[size] == null && v.price != null) sizePrice[size] = Number(v.price);
    if (sizeCost[size] == null && v.cost_price != null) sizeCost[size] = Number(v.cost_price);
    const qty = v.quantity ?? v.stock;
    if (v.color) {
      cells[cellKey(v.color, size)] = qty == null ? 0 : Number(qty);
    } else if (qty != null) {
      legacyBySize[size] = (legacyBySize[size] || 0) + Number(qty);
    }
  }
  return { sizes, cells, sizePrice, sizeCost, legacyBySize };
};

/**
 * Serialise grid state → variants[].
 *
 * Rules:
 *  - A colour with zero stock across every size is omitted entirely, so it
 *    never surfaces as a dead, unbuyable swatch on the storefront.
 *  - For a colour that IS stocked, EVERY size column is emitted (0-stock sizes
 *    included) so the storefront can correctly grey the sizes that colour does
 *    not carry.
 *  - Price/cost are per-size and copied onto every variant of that size.
 */
export const buildVariants = (colorNames, sizes, cells, sizePrice = {}, sizeCost = {}) => {
  const out = [];
  for (const color of colorNames) {
    const stockedSomewhere = sizes.some((s) => (cells[cellKey(color, s)] || 0) > 0);
    if (!stockedSomewhere) continue;
    for (const size of sizes) {
      const qty = cells[cellKey(color, size)] || 0;
      const price = sizePrice[size] != null ? sizePrice[size] : null;
      const cost = sizeCost[size] != null ? sizeCost[size] : null;
      out.push({
        key: `${color}__${size}`,
        color,
        label: size,
        size,
        quantity: qty,
        stock: qty,
        price,
        price_final: price,
        cost_price: cost,
      });
    }
  }
  return out;
};
