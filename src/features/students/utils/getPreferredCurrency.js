const directCurrencyKeys = [
  'preferred_currency',
  'preferredCurrency',
  'currency_preference',
  'currencyPreference',
  'default_currency',
  'defaultCurrency',
  'wallet_currency',
  'walletCurrency',
  'userCurrency',
  'businessCurrency',
  'accountCurrency',
  'currency_code',
  'currencyCode',
  'currency'
];

const nestedContainers = [
  'preferences',
  'preference',
  'settings',
  'profile',
  'student',
  'studentProfile',
  'account',
  'wallet',
  'meta',
  'metadata',
  'details',
  'finance',
  'financial',
  'billing',
  'payment',
  'payments'
];

export const currencySymbolMap = {
  TRY: '₺',
  USD: '$',
  EUR: '€',
  GBP: '£',
  AUD: 'A$',
  CAD: 'C$',
  CHF: 'CHF',
  SEK: 'kr',
  NOK: 'kr',
  DKK: 'kr',
  AED: 'د.إ',
  SAR: '﷼'
};

export const DEFAULT_CURRENCY = { code: 'TRY', symbol: '₺' };

const ISO_CODE_REGEX = /^[A-Z]{3}$/u;

const normalizeStringCurrency = (value) => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const upper = trimmed.toUpperCase();

  if (currencySymbolMap[upper]) {
    return { code: upper, symbol: currencySymbolMap[upper] };
  }

  const symbolMatch = Object.entries(currencySymbolMap).find(([, symbol]) => symbol === trimmed);
  if (symbolMatch) {
    return { code: symbolMatch[0], symbol: trimmed };
  }

  if (ISO_CODE_REGEX.test(upper)) {
    return { code: upper, symbol: currencySymbolMap[upper] };
  }

  return { code: upper, symbol: currencySymbolMap[upper] };
};

const normalizeObjectCurrency = (value) => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const directMatch = normalizeStringCurrency(
    value.code || value.currency || value.currency_code || value.currencyCode || value.value
  );

  if (directMatch) {
    const symbol = normalizeStringCurrency(value.symbol)?.symbol || value.symbol;
    return {
      code: directMatch.code,
      symbol: symbol || directMatch.symbol || currencySymbolMap[directMatch.code]
    };
  }

  if (typeof value.symbol === 'string') {
    const symbolMatch = Object.entries(currencySymbolMap).find(([, symbol]) => symbol === value.symbol.trim());
    if (symbolMatch) {
      return { code: symbolMatch[0], symbol: value.symbol.trim() };
    }
  }

  return null;
};

function extractFromArray(items, depth, seen) {
  for (const item of items) {
    const result = extractCurrency(item, depth + 1, seen);
    if (result) {
      return result;
    }
  }
  return null;
}

function extractFromObject(obj, depth, seen) {
  if (seen.has(obj)) {
    return null;
  }
  seen.add(obj);

  for (const key of directCurrencyKeys) {
    const value = obj[key];
    const result = normalizeStringCurrency(value) || normalizeObjectCurrency(value);
    if (result?.code) {
      return result;
    }
  }

  for (const key of nestedContainers) {
    const nested = obj[key];
    if (!nested) {
      continue;
    }
    const result = extractCurrency(nested, depth + 1, seen);
    if (result?.code) {
      return result;
    }
  }

  return null;
}

const extractCurrency = (source, depth = 0, seen = new WeakSet()) => {
  if (!source || depth > 3) {
    return null;
  }

  const normalized = normalizeStringCurrency(source) || normalizeObjectCurrency(source);
  if (normalized?.code) {
    return normalized;
  }

  if (Array.isArray(source)) {
    return extractFromArray(source, depth, seen);
  }

  if (typeof source === 'object') {
    return extractFromObject(source, depth, seen);
  }

  return null;
};

export const getPreferredCurrency = (user, ...additionalSources) => {
  const sources = [];

  if (additionalSources?.length) {
    sources.push(...additionalSources.filter(Boolean));
  }

  if (user && typeof user === 'object') {
    sources.push(user);

    const nestedUserSources = [
      user.preferences,
      user.settings,
      user.profile,
      user.student,
      user.studentProfile,
      user.account,
      user.wallet,
      user.meta,
      user.metadata,
      user.details
    ].filter(Boolean);

    sources.push(...nestedUserSources);
  }

  for (const source of sources) {
    const result = extractCurrency(source);
    if (result?.code) {
      return {
        code: result.code,
        symbol: result.symbol || currencySymbolMap[result.code] || undefined
      };
    }
  }

  return DEFAULT_CURRENCY;
};

export default getPreferredCurrency;
