// src/shared/constants/productCategories.js
// Product category and subcategory definitions
// Single source of truth — used by sidebar, admin forms, shop pages, and backend

export const PRODUCT_CATEGORIES = {
  'kitesurf': {
    label: 'Kiteboarding',
    icon: '🪁',
    value: 'kitesurf',
    subcategories: {
      'kites':                     { label: 'Kites',              value: 'kites',                     parent: null },
      'bars':                      { label: 'Control Bars',       value: 'bars',                      parent: null },
      'bars-trust':                { label: 'Trust Bar',          value: 'bars-trust',                parent: 'bars' },
      'bars-click':                { label: 'Click Bar',          value: 'bars-click',                parent: 'bars' },
      'boards':                    { label: 'Boards',             value: 'boards',                    parent: null },
      'boards-twintips':           { label: 'Twintips',           value: 'boards-twintips',           parent: 'boards' },
      'boards-surfboards':         { label: 'Surfboards',         value: 'boards-surfboards',         parent: 'boards' },
      'boards-foilboards':         { label: 'Foilboards',         value: 'boards-foilboards',         parent: 'boards' },
      'accessories':               { label: 'Accessories',        value: 'accessories',               parent: null },
      'board-bags':                { label: 'Board Bags',         value: 'board-bags',                parent: 'accessories' },
      'bindings-boots':            { label: 'Bindings & Boots',   value: 'bindings-boots',            parent: 'accessories' },
      'pumps':                     { label: 'Pumps',              value: 'pumps',                     parent: 'accessories' },
      'chickenloops':              { label: 'Chickenloops',       value: 'chickenloops',              parent: 'accessories' },
      'spare-parts':               { label: 'Spare Parts',        value: 'spare-parts',               parent: 'accessories' },
    }
  },
  'wingfoil': {
    label: 'Wing Foiling',
    icon: '🪂',
    value: 'wingfoil',
    subcategories: {
      'wings':  { label: 'Wings',  value: 'wings',  parent: null },
      'boards': { label: 'Boards', value: 'boards', parent: null },
    }
  },
  'foiling': {
    label: 'Foiling',
    icon: '🏄',
    value: 'foiling',
    subcategories: {
      'wings':             { label: 'Front & Back Wings',   value: 'wings',             parent: null },
      'masts-fuselages':   { label: 'Masts & Fuselages',   value: 'masts-fuselages',   parent: null },
    }
  },
  'efoil': {
    label: 'E-Foiling',
    icon: '⚡',
    value: 'efoil',
    subcategories: {
      'efoil-boards':      { label: 'E-Foil Boards',       value: 'efoil-boards',      parent: null },
      'efoil-accessories': { label: 'Accessories',          value: 'efoil-accessories', parent: null },
    }
  },
  'ion': {
    label: 'ION Accessories',
    icon: '🩱',
    value: 'ion',
    subcategories: {
      // Wetsuits
      'wetsuits':                    { label: 'Wetsuits',              value: 'wetsuits',                    parent: null },
      'wetsuits-men':                { label: 'Men',                   value: 'wetsuits-men',                parent: 'wetsuits' },
      'wetsuits-men-fullsuits':      { label: 'Fullsuits',             value: 'wetsuits-men-fullsuits',      parent: 'wetsuits-men' },
      'wetsuits-men-springsuits':    { label: 'Springsuits & Shorties', value: 'wetsuits-men-springsuits',   parent: 'wetsuits-men' },
      'wetsuits-women':              { label: 'Women',                 value: 'wetsuits-women',              parent: 'wetsuits' },
      'wetsuits-women-fullsuits':    { label: 'Fullsuits',             value: 'wetsuits-women-fullsuits',    parent: 'wetsuits-women' },
      'wetsuits-women-springsuits':  { label: 'Springsuits & Shorties', value: 'wetsuits-women-springsuits', parent: 'wetsuits-women' },
      // Protection
      'protection':                  { label: 'Protection',            value: 'protection',                  parent: null },
      'protection-men':              { label: 'Men',                   value: 'protection-men',              parent: 'protection' },
      'protection-women':            { label: 'Women',                 value: 'protection-women',            parent: 'protection' },
      // Harnesses
      'harnesses':                   { label: 'Harnesses',             value: 'harnesses',                   parent: null },
      'harnesses-kite':              { label: 'Kite Harnesses',        value: 'harnesses-kite',              parent: 'harnesses' },
      'harnesses-wing':              { label: 'Wing Harnesses',        value: 'harnesses-wing',              parent: 'harnesses' },
      // Apparel
      'apparel':                     { label: 'Water Apparel',         value: 'apparel',                     parent: null },
      'apparel-tops':                { label: 'Neo Tops & Rashguards', value: 'apparel-tops',                parent: 'apparel' },
      'apparel-ponchos':             { label: 'Ponchos',               value: 'apparel-ponchos',             parent: 'apparel' },
      // Footwear
      'footwear':                    { label: 'Footwear',              value: 'footwear',                    parent: null },
      // Accessories
      'ion-accs':                    { label: 'Accessories',           value: 'ion-accs',                    parent: null },
      'ion-accs-leash':              { label: 'Leashes',               value: 'ion-accs-leash',              parent: 'ion-accs' },
    }
  },
  'ukc-shop': {
    label: 'Plannivo Shop',
    icon: '👕',
    value: 'ukc-shop',
    subcategories: {
      'hoodies':  { label: 'Hoodies',   value: 'hoodies' },
      'ponchos':  { label: 'Ponchos',   value: 'ponchos' },
      'tshirts':  { label: 'T-Shirts',  value: 'tshirts' },
    }
  },
  'secondwind': {
    label: 'SecondWind',
    icon: '♻️',
    value: 'secondwind',
    subcategories: {
      'kites':  { label: 'Kites',        value: 'kites' },
      'bars':   { label: 'Bars',         value: 'bars' },
      'boards': { label: 'Boards',       value: 'boards' },
      'wings':  { label: 'Wings',        value: 'wings' },
      'foils':  { label: 'Foils',        value: 'foils' },
      'sets':   { label: 'Set Options',  value: 'sets' },
    }
  },
};

// Legacy category mapping — maps old DB values to new categories for backward compat
export const LEGACY_CATEGORY_MAP = {
  'kites':       'kitesurf',
  'boards':      'kitesurf',
  'bars':        'kitesurf',
  'wing-foil':   'wingfoil',
  'e-foil':      'efoil',
  'foil':        'foiling',
  'wetsuits':    'ion',
  'ion-wetsuits': 'ion',
  'harnesses':   'ion',
  'ion-harnesses': 'ion',
  'accessories': 'ion',
  'ion-accessories': 'ion',
  'apparel':     'ukc-shop',
  'daily-wear':  'ion',
  'other':       'secondwind',
  'equipment':   'kitesurf',
  'bags':        'kitesurf',
  'spare-parts': 'kitesurf',
  'safety':      'kitesurf',
  // Legacy SLS/DLAB subcategory values → still resolve to kitesurf
  'boards-twintips-sls':    'kitesurf',
  'boards-surfboards-dlab': 'kitesurf',
};

// Flat list for admin dropdowns
export const CATEGORY_OPTIONS = Object.values(PRODUCT_CATEGORIES).map(cat => ({
  value: cat.value,
  label: cat.label,
  icon: cat.icon,
}));

/**
 * Get category label from category value
 * @param {string} categoryValue - Category value (e.g., 'kitesurf')
 * @returns {string} Category label (e.g., 'Kitesurf Equipment')
 */
export const getCategoryLabel = (categoryValue) => {
  // Check new categories first
  const category = PRODUCT_CATEGORIES[categoryValue];
  if (category) return category.label;
  // Check legacy mapping
  const mapped = LEGACY_CATEGORY_MAP[categoryValue];
  if (mapped) return PRODUCT_CATEGORIES[mapped]?.label || categoryValue;
  return categoryValue?.charAt(0).toUpperCase() + categoryValue?.slice(1);
};

/**
 * Get category icon from category value
 * @param {string} categoryValue - Category value (e.g., 'kitesurf')
 * @returns {string} Category icon emoji
 */
export const getCategoryIcon = (categoryValue) => {
  const category = PRODUCT_CATEGORIES[categoryValue];
  if (category) return category.icon;
  const mapped = LEGACY_CATEGORY_MAP[categoryValue];
  if (mapped) return PRODUCT_CATEGORIES[mapped]?.icon || '📦';
  return '📦';
};

/**
 * Resolve a possibly-legacy category value to a new category value
 * @param {string} categoryValue - Old or new category value
 * @returns {string} Resolved new category value
 */
export const resolveCategory = (categoryValue) => {
  if (!categoryValue) return categoryValue;
  const lower = categoryValue.toLowerCase();
  if (PRODUCT_CATEGORIES[lower]) return lower;
  if (PRODUCT_CATEGORIES[categoryValue]) return categoryValue;
  return LEGACY_CATEGORY_MAP[lower] || LEGACY_CATEGORY_MAP[categoryValue] || lower;
};

/**
 * Get subcategories for a category
 * @param {string} categoryValue - Category value (e.g., 'ion-wetsuits')
 * @returns {Array} Array of subcategory objects
 */
export const getSubcategories = (categoryValue) => {
  const category = PRODUCT_CATEGORIES[categoryValue];
  if (!category || !category.subcategories) return [];
  return Object.values(category.subcategories);
};

/**
 * Get hierarchically structured subcategories (for tree display).
 * For categories with `parent` fields (e.g., ion-wetsuits), returns a tree.
 * For flat subcategories, returns them as top-level items with empty children.
 * @param {string} categoryValue - Category value
 * @returns {Array} Array of { label, value, children: [...] }
 */
export const getHierarchicalSubcategories = (categoryValue) => {
  const category = PRODUCT_CATEGORIES[categoryValue];
  if (!category || !category.subcategories) return [];

  const subcats = Object.values(category.subcategories);

  // Check if any subcategory has a parent field
  const hasParents = subcats.some(s => s.parent !== undefined);

  if (!hasParents) {
    // Flat list — return as top-level items with no children
    return subcats.map(s => ({ ...s, children: [] }));
  }

  // Build recursive tree from parent chains
  const buildTree = (parentValue) => {
    const children = subcats.filter(s =>
      parentValue === null
        ? (s.parent === null || s.parent === undefined)
        : s.parent === parentValue
    );
    return children.map(child => ({
      ...child,
      children: buildTree(child.value),
    }));
  };

  return buildTree(null);
};

/**
 * Get subcategory label from category and subcategory values
 * @param {string} categoryValue - Category value (e.g., 'ion-wetsuits')
 * @param {string} subcategoryValue - Subcategory value (e.g., 'men-fullsuits')
 * @returns {string} Subcategory label
 */
export const getSubcategoryLabel = (categoryValue, subcategoryValue) => {
  const category = PRODUCT_CATEGORIES[categoryValue];
  if (!category || !category.subcategories) return subcategoryValue;

  const subcategory = category.subcategories[subcategoryValue];
  return subcategory ? subcategory.label : subcategoryValue;
};

/**
 * Get all categories as an array
 * @returns {Array} Array of category objects
 */
export const getAllCategories = () => {
  return Object.values(PRODUCT_CATEGORIES);
};

/**
 * Check if category has subcategories
 * @param {string} categoryValue - Category value
 * @returns {boolean} True if category has subcategories
 */
export const hasSubcategories = (categoryValue) => {
  const category = PRODUCT_CATEGORIES[categoryValue];
  return category && category.subcategories && Object.keys(category.subcategories).length > 0;
};
