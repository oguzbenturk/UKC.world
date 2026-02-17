const directBalanceKeys = [
  'wallet_balance',
  'walletBalance',
  'wallet_amount',
  'walletAmount',
  'balance',
  'current_balance',
  'currentBalance',
  'available',
  'available_balance',
  'availableBalance',
  'available_amount',
  'availableAmount',
  'account_balance',
  'accountBalance',
  'total_balance',
  'totalBalance',
  'credit_balance',
  'creditBalance',
  'amount',
  'value'
];

const nestedContainers = [
  'wallet',
  'account',
  'student',
  'studentProfile',
  'studentAccount',
  'profile',
  'settings',
  'preferences',
  'finance',
  'financial',
  'billing',
  'payment',
  'payments',
  'summary',
  'overview',
  'details',
  'meta',
  'metadata',
  'stats',
  'balances'
];

const sanitizeBalanceInput = (value) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const cleaned = trimmed.replace(/[^0-9,.-]/g, '');
    if (!cleaned) {
      return null;
    }

    const hasDot = cleaned.includes('.');
    const normalized = hasDot
      ? cleaned.replace(/,/g, '')
      : cleaned.replace(/,/g, '.');

    const parsed = Number.parseFloat(normalized);
    if (Number.isFinite(parsed)) {
      return Math.round(parsed * 100) / 100;
    }
  }

  if (typeof value === 'object' && value !== null) {
    const nestedAmount =
      value.amount ?? value.balance ?? value.value ?? value.currentBalance ?? value.availableBalance;

    if (nestedAmount !== undefined) {
      return sanitizeBalanceInput(nestedAmount);
    }
  }

  return null;
};

const extractFromArray = (items, depth, seen) => {
  for (const item of items) {
    const result = extractBalance(item, depth + 1, seen);
    if (result !== null) {
      return result;
    }
  }
  return null;
};

const extractFromObject = (obj, depth, seen) => {
  if (seen.has(obj)) {
    return null;
  }
  seen.add(obj);

  for (const key of directBalanceKeys) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) {
      continue;
    }
    const candidate = sanitizeBalanceInput(obj[key]);
    if (candidate !== null) {
      return candidate;
    }
  }

  for (const key of nestedContainers) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) {
      continue;
    }
    const nested = obj[key];
    if (!nested) {
      continue;
    }
    const result = extractBalance(nested, depth + 1, seen);
    if (result !== null) {
      return result;
    }
  }

  if (depth === 0) {
    for (const value of Object.values(obj)) {
      if (typeof value === 'object' && value !== null) {
        const result = extractBalance(value, depth + 1, seen);
        if (result !== null) {
          return result;
        }
      } else {
        const primitiveResult = sanitizeBalanceInput(value);
        if (primitiveResult !== null) {
          return primitiveResult;
        }
      }
    }
  }

  return null;
};

const extractBalance = (source, depth = 0, seen = new WeakSet()) => {
  if (source === null || source === undefined || depth > 4) {
    return null;
  }

  const normalized = sanitizeBalanceInput(source);
  if (normalized !== null) {
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

export const getWalletBalance = (...sources) => {
  for (const source of sources) {
    if (!source) {
      continue;
    }
    const result = extractBalance(source);
    if (result !== null) {
      return result;
    }
  }
  return null;
};

export default getWalletBalance;
