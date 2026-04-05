// src/features/finances/utils/netRevenue.js
// Build consolidated net revenue data with ledger, snapshot, and configuration fallbacks.

import {
  ensureExpensesFromSettings,
  numberOrZero
} from './expenseCalculations';

const buildLedgerFallbackNetData = ({ grossRevenue, refundTotal, ledgerCommission, ledgerRate }) => {
  const commission = ledgerCommission;
  const gross = grossRevenue;
  return {
    supported: false,
    gross,
    net: gross - refundTotal - commission,
    commission,
    tax: 0,
    insurance: 0,
    equipment: 0,
    paymentFee: 0,
    commissionRate: commission > 0 && gross > 0
      ? (commission / gross) * 100
      : ledgerRate * 100
  };
};

const buildSnapshotNetData = (net, { grossRevenue, refundTotal }, ledgerCommission, ledgerRate) => {
  const hasSnapshots = Number(net.items_count || 0) > 0 || numberOrZero(net.gross_total) > 0;
  const grossBase = hasSnapshots ? numberOrZero(net.gross_total) : grossRevenue;
  let commissionValue = hasSnapshots ? numberOrZero(net.commission_total) : 0;
  const taxValue = hasSnapshots ? numberOrZero(net.tax_total) : 0;
  const insuranceValue = hasSnapshots ? numberOrZero(net.insurance_total) : 0;
  const equipmentValue = hasSnapshots ? numberOrZero(net.equipment_total) : 0;
  const paymentFeeValue = hasSnapshots ? numberOrZero(net.payment_fee_total) : 0;
  let netValue = hasSnapshots ? numberOrZero(net.net_total) : (grossBase - refundTotal);

  if (commissionValue <= 0 && ledgerCommission > 0) {
    commissionValue = ledgerCommission;
    netValue -= ledgerCommission;
  }

  const resolvedGross = Math.max(grossBase, grossRevenue);
  const recomputedNet = resolvedGross - commissionValue - taxValue - insuranceValue - equipmentValue - paymentFeeValue - refundTotal;
  if (recomputedNet > netValue) {
    netValue = recomputedNet;
  }
  return {
    supported: hasSnapshots,
    gross: resolvedGross,
    net: netValue,
    commission: commissionValue,
    tax: taxValue,
    insurance: insuranceValue,
    equipment: equipmentValue,
    paymentFee: paymentFeeValue,
    commissionRate: commissionValue > 0 && resolvedGross > 0
      ? (commissionValue / resolvedGross) * 100
      : ledgerRate * 100
  };
};

export const buildNetData = (summary, ledger, financialSettings) => {
  const net = summary?.netRevenue;
  const revenue = summary?.revenue || {};
  const ledgerCommission = Number(ledger?.commissionTotal || 0);
  const ledgerRate = Number(ledger?.commissionRate || 0);
  const ledgerExpected = numberOrZero(ledger?.expectedTotal);
  const grossRevenue = ledgerExpected > 0 ? ledgerExpected : numberOrZero(revenue.total_revenue);
  const refundTotal = numberOrZero(revenue.total_refunds);

  const baseNet = net
    ? buildSnapshotNetData(net, { grossRevenue, refundTotal }, ledgerCommission, ledgerRate)
    : buildLedgerFallbackNetData({ grossRevenue, refundTotal, ledgerCommission, ledgerRate });

  return ensureExpensesFromSettings(baseNet, {
    financialSettings,
    revenueTotals: revenue,
    refundTotal
  });
};
