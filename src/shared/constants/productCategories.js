// src/shared/constants/productCategories.js
// Product category and subcategory definitions
// Single source of truth — used by sidebar, admin forms, shop pages, and backend

export const PRODUCT_CATEGORIES = {
  'kitesurf': {
    label: 'Duotone Equipment',
    icon: '🪁',
    value: 'kitesurf',
    subcategories: {
      'kites':                     { label: 'Kites',              value: 'kites',                     parent: null },
      'bars':                      { label: 'Bars',               value: 'bars',                      parent: null },
      'bars-trust':                { label: 'Trust Bar',           value: 'bars-trust',                parent: 'bars' },
      'bars-click':                { label: 'Click Bar',           value: 'bars-click',                parent: 'bars' },
      'boards':                     { label: 'Boards',             value: 'boards',                     parent: null },
      'boards-twintips':             { label: 'Twintips',           value: 'boards-twintips',            parent: 'boards' },
      'boards-twintips-sls':         { label: 'SLS',                value: 'boards-twintips-sls',        parent: 'boards-twintips' },
      'boards-surfboards':           { label: 'Surfboards',         value: 'boards-surfboards',          parent: 'boards' },
      'boards-surfboards-dlab':      { label: 'DLAB',               value: 'boards-surfboards-dlab',     parent: 'boards-surfboards' },
      'board-bags':                { label: 'Board Bags',          value: 'board-bags',                parent: null },
      'spare-parts':               { label: 'Spare Parts',        value: 'spare-parts',               parent: null },
    }
  },
  'wingfoil': {
    label: 'WingFoil Equipment',
    icon: '🪂',
    value: 'wingfoil',
    subcategories: {
      'wings':  { label: 'Wings',  value: 'wings' },
      'boards': { label: 'Boards', value: 'boards' },
      'foils':  { label: 'Foils',  value: 'foils' },
    }
  },
  'efoil': {
    label: 'Efoil Equipment',
    icon: '⚡',
    value: 'efoil',
    subcategories: {
      'foilassist-boards': { label: 'FoilAssist Boards',     value: 'foilassist-boards' },
      'wings':             { label: 'Front & Back Wings',     value: 'wings' },
      'masts-fuselages':   { label: 'E-Masts & Fuselages',   value: 'masts-fuselages' },
    }
  },
  'ion': {
    label: 'ION',
    icon: '🩱',
    value: 'ion',
    subcategories: {
      // Level 2: Wetsuits
      'wetsuits':                    { label: 'Wetsuits',              value: 'wetsuits',                    parent: null },
      'wetsuits-men':                { label: 'Men',                   value: 'wetsuits-men',                parent: 'wetsuits' },
      'wetsuits-men-fullsuits':      { label: 'FullSuits',             value: 'wetsuits-men-fullsuits',      parent: 'wetsuits-men' },
      'wetsuits-men-springsuits':    { label: 'Springsuits & Shorties',value: 'wetsuits-men-springsuits',    parent: 'wetsuits-men' },
      'wetsuits-women':              { label: 'Women',                 value: 'wetsuits-women',              parent: 'wetsuits' },
      'wetsuits-women-fullsuits':    { label: 'FullSuits',             value: 'wetsuits-women-fullsuits',    parent: 'wetsuits-women' },
      'wetsuits-women-springsuits':  { label: 'Springsuits & Shorties',value: 'wetsuits-women-springsuits',  parent: 'wetsuits-women' },
      // Level 2: Protection Equipment
      'protection':                  { label: 'Protection',             value: 'protection',                  parent: null },
      'protection-men':              { label: 'Men',                   value: 'protection-men',              parent: 'protection' },
      'protection-women':            { label: 'Women',                 value: 'protection-women',            parent: 'protection' },
      // Level 2: Daily Wear
      'daily-wear':                  { label: 'Daily Wear',            value: 'daily-wear',                  parent: null },
      'daily-wear-men':              { label: 'Men',                   value: 'daily-wear-men',              parent: 'daily-wear' },
      'daily-wear-women':            { label: 'Women',                 value: 'daily-wear-women',            parent: 'daily-wear' },
      // Level 2: ION Accs
      'ion-accs':                    { label: 'ION Accs',              value: 'ion-accs',                    parent: null },
      'ion-accs-leash':              { label: 'Leash',                 value: 'ion-accs-leash',              parent: 'ion-accs' },
    }
  },
  'ukc-shop': {
    label: 'UKC.SHOP',
    icon: '👕',
    value: 'ukc-shop',
    subcategories: {
      'hoodies':  { label: 'Hoodies',   value: 'hoodies' },
      'ponchos':  { label: 'Ponchos',   value: 'ponchos' },
      'tshirts':  { label: 'T-Shirts',  value: 'tshirts' },
    }
  },
  'secondwind': {
    label: 'UKC.SECONDWIND',
    icon: '♻️',
    value: 'secondwind',
    subcategories: {
      'kites':  { label: 'Kites',        value: 'kites' },
      'bars':   { label: 'Bars',         value: 'bars' },
      'boards': { label: 'Boards',       value: 'boards' },
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
  'wetsuits':    'ion',
  'ion-wetsuits': 'ion',
  'harnesses':   'ion',
  'ion-harnesses': 'ion',
  'accessories': 'ion',
  'ion-accessories': 'ion',
  'apparel':     'ukc-shop',
  'other':       'secondwind',
  'equipment':   'kitesurf',
  'bags':        'kitesurf',
  'spare-parts': 'kitesurf',
  'safety':      'kitesurf',
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
  if (PRODUCT_CATEGORIES[categoryValue]) return categoryValue;
  return LEGACY_CATEGORY_MAP[categoryValue] || categoryValue;
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
