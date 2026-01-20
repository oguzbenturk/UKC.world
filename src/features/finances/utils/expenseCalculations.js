// src/features/finances/utils/expenseCalculations.js
// Shared helpers for deriving expense amounts when upstream data is incomplete.

const numberOrZero = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const PREFERRED_PAYMENT_KEYS = ['card', 'default', 'pos', 'online', 'stripe', 'terminal'];

const normalizeFeeEntry = (entry) => {
  if (!entry || typeof entry !== 'object') {
    return { pct: 0, fixed: 0 };
  }
  const pct = Number(entry.pct ?? entry.percentage ?? entry.rate ?? 0);
  const fixed = Number(entry.fixed ?? entry.flat ?? 0);
  return {
    pct: Number.isFinite(pct) ? pct : 0,
    fixed: Number.isFinite(fixed) ? fixed : 0
  };
};

export const resolvePaymentFeeEntry = (paymentFees) => {
  if (!paymentFees || typeof paymentFees !== 'object') {
    return { pct: 0, fixed: 0 };
  }

  const entries = Object.entries(paymentFees)
    .filter(([, cfg]) => cfg && (cfg.active === undefined || cfg.active !== false));

  for (const key of PREFERRED_PAYMENT_KEYS) {
    const match = entries.find(([method]) => method === key);
    if (match) {
      return normalizeFeeEntry(match[1]);
    }
  }

  if (entries.length > 0) {
    return normalizeFeeEntry(entries[0][1]);
  }

  return { pct: 0, fixed: 0 };
};

const applyPercent = (currentValue, gross, ratePct) => {
  const existing = numberOrZero(currentValue);
  if (existing > 0) {
    return existing;
  }
  const pct = Number(ratePct || 0);
  if (!gross || pct <= 0) {
    return existing;
  }
  return gross * (pct / 100);
};

export const ensureExpensesFromSettings = (
  netData,
  {
    financialSettings,
    revenueTotals = {},
    refundTotal = 0
  } = {}
) => {
  if (!netData) {
    return netData;
  }
  if (!financialSettings) {
    return { ...netData };
  }

  const resolvedGross = Math.max(numberOrZero(netData.gross), numberOrZero(revenueTotals.total_revenue));
  if (!(resolvedGross > 0)) {
    return { ...netData, gross: resolvedGross };
  }

  const updated = { ...netData, gross: resolvedGross };

  updated.tax = applyPercent(updated.tax, resolvedGross, financialSettings.tax_rate_pct);
  updated.insurance = applyPercent(updated.insurance, resolvedGross, financialSettings.insurance_rate_pct);
  updated.equipment = applyPercent(updated.equipment, resolvedGross, financialSettings.equipment_rate_pct);

  let paymentFee = numberOrZero(updated.paymentFee);
  if (paymentFee <= 0) {
    const { pct, fixed } = resolvePaymentFeeEntry(financialSettings.payment_method_fees);
    if (pct > 0 || fixed > 0) {
      const transactionCount = Number(revenueTotals.total_transactions || 0);
      paymentFee = (resolvedGross * (pct / 100)) + (transactionCount * fixed);
      updated.paymentFee = paymentFee;
    }
  }

  const commission = numberOrZero(updated.commission);
  const tax = numberOrZero(updated.tax);
  const insurance = numberOrZero(updated.insurance);
  const equipment = numberOrZero(updated.equipment);
  const fee = numberOrZero(updated.paymentFee);
  const refunds = numberOrZero(refundTotal);

  updated.net = resolvedGross - refunds - commission - tax - insurance - equipment - fee;

  if (commission > 0 && resolvedGross > 0) {
    updated.commissionRate = (commission / resolvedGross) * 100;
  } else if (!updated.commissionRate) {
    updated.commissionRate = 0;
  }

  return updated;
};

export const sumExpenses = (netData) => {
  if (!netData) {
    return 0;
  }
  return (
    numberOrZero(netData.commission) +
    numberOrZero(netData.tax) +
    numberOrZero(netData.insurance) +
    numberOrZero(netData.equipment) +
    numberOrZero(netData.paymentFee)
  );
};

export { numberOrZero };
