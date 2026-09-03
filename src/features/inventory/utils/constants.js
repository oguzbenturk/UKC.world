// Canonical equipment types. `value` is what the DB stores (lowercase, free text);
// `id` is the i18n suffix under `common:inventory.types.*`.
export const EQUIPMENT_TYPES = [
  { value: 'kite', id: 'kite' },
  { value: 'board', id: 'board' },
  { value: 'harness', id: 'harness' },
  { value: 'control bar', id: 'controlBar' },
  { value: 'wetsuit', id: 'wetsuit' },
  { value: 'safety gear', id: 'safetyGear' },
  { value: 'wing/foil', id: 'wingFoil' },
  { value: 'footwear', id: 'footwear' },
  { value: 'accessory', id: 'accessory' },
  { value: 'other', id: 'other' },
];

export const TYPE_ORDER = EQUIPMENT_TYPES.map((t) => t.value);
export const TYPE_LABEL_ID = Object.fromEntries(EQUIPMENT_TYPES.map((t) => [t.value, t.id]));

export const CONDITION_VALUES = ['new', 'excellent', 'good', 'fair', 'poor'];
export const CONDITION_KEYS = {
  new: 'conditionNew',
  excellent: 'conditionExcellent',
  good: 'conditionGood',
  fair: 'conditionFair',
  poor: 'conditionPoor',
};
export const CONDITION_COLORS = { new: 'green', excellent: 'cyan', good: 'blue', fair: 'orange', poor: 'red' };

export const STATUS_VALUES = ['available', 'in-use', 'maintenance', 'retired'];
export const STATUS_KEYS = {
  available: 'statusAvailable',
  'in-use': 'statusInUse',
  maintenance: 'statusMaintenance',
  retired: 'statusRetired',
};
export const STATUS_COLORS = {
  available: 'success',
  'in-use': 'processing',
  maintenance: 'warning',
  retired: 'default',
};

// Gear counted as usable for the season. 'fair' still works but is on its way out,
// so the planning view tracks it separately; 'poor' is what needs replacing.
export const USABLE_CONDITIONS = new Set(['new', 'excellent', 'good']);
export const WATCH_CONDITIONS = new Set(['fair']);
export const REPLACE_CONDITIONS = new Set(['poor']);

export const BLANK = '—';

export const VIEW_KEY = 'ukc:inventory:view';
export const MERGE_KEY = 'ukc:inventory:mergeVariants';
export const STOCKTAKE_KEY = 'ukc:inventory:stocktake';

// Form-only option lists.
export const brandOptions = [
  'Core', 'Duotone', 'Naish', 'Cabrinha', 'Slingshot', 'North', 'F-One', 'Ozone', 'Ocean Rodeo',
  'Eleveight', 'Airush', 'Best', 'Mystic', 'ION', 'Manera', 'Liquid Force', 'Fanatic', 'Neil Pryde',
  'Prolimit', 'Jobe', 'Tribord', "O'Neill", 'Olaian', 'Oxelo', 'Other',
].map((b) => ({ value: b, label: b }));

export const getSizeOptions = (type) => {
  switch (type) {
    case 'kite':
      return ['5m', '6m', '7m', '8m', '9m', '10m', '11m', '12m', '13m', '14m', '15m'];
    case 'board':
      return ['132x39', '135x40', '138x41', '141x42', '144x43'];
    case 'harness':
    case 'wetsuit':
    case 'safety gear':
      return ['KIDS', 'XS', 'S', 'M', 'L', 'XL', 'XXL'];
    case 'control bar':
      return ['19', '22', '24', '26', '27'];
    case 'wing/foil':
      return ['3m', '4m', '5m', '6m', '7m'];
    case 'footwear':
      return ['30-31', '32-33', '34-35', '36-37', '38-39', '40-41', '42-43', '44-45', '46-47'];
    default:
      return [];
  }
};
