// src/features/dashboard/components/orders/orderPresentation.js
// Pure presentation helpers for shop orders (no JSX): status/payment vocab,
// date formatting and row summaries. Shared by the admin table, the mobile
// card and the detail modal.

import {
  WalletOutlined,
  CreditCardOutlined,
  BankOutlined,
  SafetyCertificateOutlined,
  DollarOutlined,
} from '@ant-design/icons';

export const STATUS_META = {
  pending:    { label: 'Pending',    pill: 'bg-amber-50 text-amber-700 ring-amber-200/70',       dot: 'bg-amber-500' },
  confirmed:  { label: 'Confirmed',  pill: 'bg-sky-50 text-sky-700 ring-sky-200/70',             dot: 'bg-sky-500' },
  processing: { label: 'Processing', pill: 'bg-cyan-50 text-cyan-700 ring-cyan-200/70',          dot: 'bg-cyan-500' },
  shipped:    { label: 'Shipped',    pill: 'bg-violet-50 text-violet-700 ring-violet-200/70',    dot: 'bg-violet-500' },
  delivered:  { label: 'Delivered',  pill: 'bg-emerald-50 text-emerald-700 ring-emerald-200/70', dot: 'bg-emerald-500' },
  cancelled:  { label: 'Cancelled',  pill: 'bg-slate-100 text-slate-600 ring-slate-200',         dot: 'bg-slate-400' },
  refunded:   { label: 'Refunded',   pill: 'bg-rose-50 text-rose-700 ring-rose-200/70',          dot: 'bg-rose-500' },
};

export const PAYMENT_STATUS_META = {
  completed:       { label: 'Paid',              pill: 'bg-emerald-50 text-emerald-700 ring-emerald-200/70', dot: 'bg-emerald-500' },
  pending:         { label: 'Pending',           pill: 'bg-amber-50 text-amber-700 ring-amber-200/70',       dot: 'bg-amber-500' },
  waiting_payment: { label: 'Awaiting transfer', pill: 'bg-amber-50 text-amber-700 ring-amber-200/70',       dot: 'bg-amber-500' },
  failed:          { label: 'Failed',            pill: 'bg-rose-50 text-rose-700 ring-rose-200/70',          dot: 'bg-rose-500' },
  refunded:        { label: 'Refunded',          pill: 'bg-rose-50 text-rose-700 ring-rose-200/70',          dot: 'bg-rose-500' },
};

// A wallet "payment" is a debit on the customer's running tab, not money received.
export const ON_ACCOUNT_META = { label: 'On account', pill: 'bg-indigo-50 text-indigo-700 ring-indigo-200/70', dot: 'bg-indigo-500' };

export const NEUTRAL_META = { pill: 'bg-slate-100 text-slate-600 ring-slate-200', dot: 'bg-slate-400' };

// What the payment pill should say for an order. `payment_status = completed` is
// stamped at checkout from the payment METHOD, never revisited when the customer
// later tops up, so a completed wallet order only means "charged to the tab".
// "Paid" is reserved for money that actually arrived: staff-recorded cash / card /
// verified transfer, or an online card payment.
export const paymentDisplay = (order) => {
  const status = order?.payment_status;
  if (status === 'completed') {
    if (order?.payment_method === 'wallet') return { key: 'on_account', onAccount: true, ...ON_ACCOUNT_META };
    return { key: 'paid', onAccount: false, ...PAYMENT_STATUS_META.completed };
  }
  const meta = PAYMENT_STATUS_META[status];
  if (meta) return { key: status, onAccount: false, ...meta };
  return { key: status || 'unknown', onAccount: false, label: titleCase(status) || 'Unknown', ...NEUTRAL_META };
};

// Customer-level settlement for an on-account order, from `customer_balances`
// ([{ currency, amount }], EUR first) on the admin list rows. The wallet is the
// customer's whole tab (lessons, rentals, shop), so "owes" is not this order
// alone. Returns null for guest orders (no customer to settle).
export const walletSettlement = (order) => {
  if (!order?.user_id) return null;
  const balances = Array.isArray(order.customer_balances) ? order.customer_balances : [];
  const owed = balances
    .map((b) => ({ currency: b?.currency || 'EUR', amount: Number(b?.amount) }))
    .filter((b) => Number.isFinite(b.amount) && b.amount < -0.005)
    .map((b) => ({ currency: b.currency, amount: Math.abs(b.amount) }));
  return { settled: owed.length === 0, owed };
};

// `Icon` is a component reference (render as <info.Icon />), not an element.
export const PAYMENT_METHOD_META = {
  wallet:        { Icon: WalletOutlined,            label: 'Wallet',        color: '#16a34a' },
  credit_card:   { Icon: CreditCardOutlined,        label: 'Credit Card',   color: '#0ea5e9' },
  // In-person card terminal recorded by staff (no gateway); online card stays 'credit_card'.
  card:          { Icon: CreditCardOutlined,        label: 'Card',          color: '#0ea5e9' },
  bank_transfer: { Icon: BankOutlined,              label: 'Bank Transfer', color: '#6366f1' },
  deposit:       { Icon: SafetyCertificateOutlined, label: 'Deposit',       color: '#d97706' },
  wallet_hybrid: { Icon: WalletOutlined,            label: 'Wallet + Card', color: '#0d9488' },
  cash:          { Icon: DollarOutlined,            label: 'Cash',          color: '#78716c' },
};

export const titleCase = (s) => (s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export const getPaymentMethodInfo = (method) =>
  PAYMENT_METHOD_META[method] || { Icon: DollarOutlined, label: titleCase(method) || 'Unknown', color: '#94a3b8' };

export const formatOrderDate = (iso) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

// First product name, how many more there are, and the first available picture.
export const summarizeOrderItems = (record) => {
  const items = Array.isArray(record?.items) ? record.items : [];
  const names = items.map((i) => i?.product_name).filter(Boolean);
  return {
    primaryName: names[0] || 'Order',
    extraCount: Math.max(names.length - 1, 0),
    thumbnail: items.find((i) => i?.product_image)?.product_image || null,
  };
};

export const customerDisplay = (record) => ({
  name: [record?.first_name, record?.last_name].filter(Boolean).join(' ').trim() || record?.email || 'Guest',
  phone: record?.phone || '—',
});
