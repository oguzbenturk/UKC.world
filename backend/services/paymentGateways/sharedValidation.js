const DEFAULT_MIN_AMOUNT = Number.parseFloat(process.env.WALLET_DEPOSIT_MIN_AMOUNT || '0');

function ensurePositiveAmount(rawAmount) {
  const parsed = Number.parseFloat(rawAmount);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('Deposit amount must be greater than zero');
  }
  const normalized = Number(parsed.toFixed(2));
  if (DEFAULT_MIN_AMOUNT > 0 && normalized < DEFAULT_MIN_AMOUNT) {
    throw new Error(`Deposit amount must be at least ${DEFAULT_MIN_AMOUNT}`);
  }
  return normalized;
}

function ensureCurrencyCode(currency) {
  if (!currency || typeof currency !== 'string') {
    throw new Error('Currency is required for deposits');
  }
  const code = currency.trim().toUpperCase();
  if (!/^([A-Z]{3})$/.test(code)) {
    throw new Error(`Unsupported currency code: ${currency}`);
  }
  return code;
}

function ensurePlainObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return { ...value };
  }
  return {};
}

export function normalizeGatewayPayload({ amount, currency, userId, gateway, metadata = {} }) {
  if (!userId) {
    throw new Error('userId is required for gateway deposits');
  }
  if (!gateway) {
    throw new Error('Payment gateway is required');
  }

  const sanitizedAmount = ensurePositiveAmount(amount);
  const sanitizedCurrency = ensureCurrencyCode(currency);
  const sanitizedMetadata = ensurePlainObject(metadata);

  if ((sanitizedMetadata.method || '').toLowerCase() === 'card') {
    if (sanitizedMetadata.requireThreeDS === undefined) {
      sanitizedMetadata.requireThreeDS = true;
    }
    if (sanitizedMetadata.enforceThreeDS === undefined) {
      sanitizedMetadata.enforceThreeDS = true;
    }
  }

  return {
    amount: sanitizedAmount,
    currency: sanitizedCurrency,
    metadata: sanitizedMetadata
  };
}

export function ensureAmountWithinLimits(amount) {
  return ensurePositiveAmount(amount);
}
