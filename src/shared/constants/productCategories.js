// src/shared/constants/productCategories.js
// Product category and subcategory definitions

export const PRODUCT_CATEGORIES = {
  kites: {
    label: 'Kites',
    icon: '🪁',
    value: 'kites',
    subcategories: {
      'all-kites': { label: 'All Duotone Kites', value: 'all-kites' },
      'spare-parts': { label: 'Spare Parts', value: 'spare-parts' }
    }
  },
  boards: {
    label: 'Boards',
    icon: '🏄',
    value: 'boards',
    subcategories: {
      'twintip': { label: 'Twintip', value: 'twintip' },
      'surfboard': { label: 'Surfboards', value: 'surfboard' }
    }
  },
  'wing-foil': {
    label: 'Wing Foil',
    icon: '🪂',
    value: 'wing-foil',
    subcategories: {
      'wings': { label: 'Wings', value: 'wings' },
      'foil-boards': { label: 'Foil Boards', value: 'foil-boards' },
      'masts': { label: 'Masts & Fuselages', value: 'masts' }
    }
  },
  'e-foil': {
    label: 'E-Foil',
    icon: '⚡',
    value: 'e-foil',
    subcategories: {
      'boards': { label: 'E-Foil Boards', value: 'boards' },
      'accessories': { label: 'Accessories', value: 'accessories' }
    }
  },
  wetsuits: {
    label: 'Wetsuits',
    icon: '🩱',
    value: 'wetsuits',
    subcategories: {
      'men': { label: 'Men', value: 'men' },
      'women': { label: 'Women', value: 'women' },
      'kids': { label: 'Kids', value: 'kids' }
    }
  },
  harnesses: {
    label: 'Harnesses',
    icon: '🦺',
    value: 'harnesses',
    subcategories: {
      'waist': { label: 'Waist', value: 'waist' },
      'seat': { label: 'Seat', value: 'seat' },
      'spare-parts': { label: 'Spare Parts', value: 'spare-parts' }
    }
  },
  bars: {
    label: 'Bars & Lines',
    icon: '🎛️',
    value: 'bars',
    subcategories: {
      'trust-bar': { label: 'Trust Bars', value: 'trust-bar' },
      'click-bar': { label: 'Click Bars', value: 'click-bar' },
      'spare-parts': { label: 'Spare Parts', value: 'spare-parts' }
    }
  },
  equipment: {
    label: 'Equipment',
    icon: '⚙️',
    value: 'equipment',
    subcategories: {
      'pumps': { label: 'Pumps', value: 'pumps' },
      'repair-kits': { label: 'Repair Kits', value: 'repair-kits' },
      'bags': { label: 'Bags & Cases', value: 'bags' },
      'safety': { label: 'Safety Gear', value: 'safety' },
      'tools': { label: 'Tools', value: 'tools' }
    }
  },
  accessories: {
    label: 'Accessories',
    icon: '🔧',
    value: 'accessories',
    subcategories: {} // Use brands for filtering instead
  },
  apparel: {
    label: 'Apparel',
    icon: '👕',
    value: 'apparel',
    subcategories: {
      'men': { label: 'Men', value: 'men' },
      'women': { label: 'Women', value: 'women' }
    }
  },
  bags: {
    label: 'Bags',
    icon: '🎒',
    value: 'bags',
    subcategories: {}
  },
  'spare-parts': {
    label: 'Spare Parts',
    icon: '🔩',
    value: 'spare-parts',
    subcategories: {}
  },
  safety: {
    label: 'Safety Gear',
    icon: '🦺',
    value: 'safety',
    subcategories: {}
  },
  other: {
    label: 'Other',
    icon: '📦',
    value: 'other',
    subcategories: {}
  }
};

/**
 * Get category label from category value
 * @param {string} categoryValue - Category value (e.g., 'kites')
 * @returns {string} Category label (e.g., 'Kites')
 */
export const getCategoryLabel = (categoryValue) => {
  const category = PRODUCT_CATEGORIES[categoryValue];
  return category ? category.label : categoryValue?.charAt(0).toUpperCase() + categoryValue?.slice(1);
};

/**
 * Get category icon from category value
 * @param {string} categoryValue - Category value (e.g., 'kites')
 * @returns {string} Category icon emoji
 */
export const getCategoryIcon = (categoryValue) => {
  const category = PRODUCT_CATEGORIES[categoryValue];
  return category ? category.icon : '📦';
};

/**
 * Get subcategories for a category (hierarchical structure)
 * @param {string} categoryValue - Category value (e.g., 'wetsuits')
 * @param {string} parentFilter - Optional parent filter to get only children of this parent
 * @returns {Array} Array of subcategory objects with hierarchy info
 */
export const getSubcategories = (categoryValue, parentFilter = null) => {
  const category = PRODUCT_CATEGORIES[categoryValue];
  if (!category || !category.subcategories) return [];
  
  const subcats = Object.values(category.subcategories);
  
  if (parentFilter) {
    // Return only children of the specified parent
    return subcats.filter(s => s.parent === parentFilter);
  }
  
  return subcats;
};

/**
 * Get hierarchically structured subcategories (for tree display)
 * @param {string} categoryValue - Category value (e.g., 'wetsuits')
 * @returns {Array} Array of top-level subcategories with children
 */
export const getHierarchicalSubcategories = (categoryValue) => {
  const category = PRODUCT_CATEGORIES[categoryValue];
  if (!category || !category.subcategories) return [];
  
  const subcats = Object.values(category.subcategories);
  
  // Get top-level items (no parent)
  const topLevel = subcats.filter(s => !s.parent);
  
  // Attach children to each top-level item
  return topLevel.map(parent => ({
    ...parent,
    children: subcats.filter(s => s.parent === parent.value)
  }));
};

/**
 * Get subcategory label from category and subcategory values
 * @param {string} categoryValue - Category value (e.g., 'wetsuits')
 * @param {string} subcategoryValue - Subcategory value (e.g., 'men-small')
 * @returns {string} Subcategory label (e.g., "Men's Small")
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
