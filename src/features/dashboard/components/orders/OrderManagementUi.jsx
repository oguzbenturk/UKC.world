// src/features/dashboard/components/orders/OrderManagementUi.jsx
// Presentational pieces for the shop orders admin page (OrderManagement.jsx):
// status/payment pills, the page header, the status tab rail, the empty state,
// the low-stock strip and the mobile card. No data fetching lives here.
// Pure helpers (status vocab, date formatting, row summaries) are in
// ./orderPresentation.js so this file only exports components.

import { Avatar, Button, Tooltip } from 'antd';
import {
  ShoppingCartOutlined,
  ReloadOutlined,
  WarningOutlined,
  InboxOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import {
  STATUS_META,
  NEUTRAL_META,
  titleCase,
  getPaymentMethodInfo,
  paymentDisplay,
  walletSettlement,
  formatOrderDate,
  summarizeOrderItems,
  customerDisplay,
} from './orderPresentation';

// ── Small atoms ──────────────────────────────────────────────────────────
export const Pill = ({ meta, children, className = '' }) => (
  <span
    className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold leading-[18px] ring-1 ring-inset ${meta.pill} ${className}`}
  >
    <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
    {children}
  </span>
);

export const StatusPill = ({ status, className }) => {
  const meta = STATUS_META[status] || { ...NEUTRAL_META, label: titleCase(status) || 'Unknown' };
  return <Pill meta={meta} className={className}>{meta.label}</Pill>;
};

// "Paid" only when money actually arrived; a completed wallet order is "On account".
export const PaymentPill = ({ order, className }) => {
  const meta = paymentDisplay(order);
  return <Pill meta={meta} className={className}>{meta.label}</Pill>;
};

export const PaymentMethodLabel = ({ method }) => {
  const info = getPaymentMethodInfo(method);
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
      <span style={{ color: info.color }}><info.Icon /></span>
      {info.label}
    </span>
  );
};

// Customer-level settlement line for on-account orders: "Owes €120.00" while the
// customer's wallet is negative, "Settled" once their balance is back to zero.
export const WalletBalanceHint = ({ order, formatCurrency }) => {
  const settlement = walletSettlement(order);
  if (!settlement) return null;
  if (settlement.settled) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600" data-testid="wallet-settled">
        <CheckCircleOutlined /> Settled
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600"
      title="Customer's wallet balance across all charges, not just this order"
      data-testid="wallet-owes"
    >
      <ExclamationCircleOutlined /> Owes {settlement.owed.map((o) => formatCurrency(o.amount, o.currency)).join(' + ')}
    </span>
  );
};

// Payment pill + the line that matters under it: the settlement hint for
// on-account orders, the payment method for everything else.
export const PaymentCell = ({ order, formatCurrency, align = 'start' }) => {
  const display = paymentDisplay(order);
  return (
    <div className={`flex flex-col gap-1 ${align === 'end' ? 'items-end' : 'items-start'}`}>
      <Pill meta={display}>{display.label}</Pill>
      {display.onAccount
        ? <WalletBalanceHint order={order} formatCurrency={formatCurrency} />
        : <PaymentMethodLabel method={order.payment_method} />}
    </div>
  );
};

// Product thumbnail with a cart-icon placeholder. `icon` doubles as the fallback
// when the image URL is broken.
export const OrderThumb = ({ src, name, size = 40 }) => (
  <Avatar
    src={src || undefined}
    icon={<ShoppingCartOutlined />}
    alt={src ? name : 'No product image'}
    shape="square"
    size={size}
    className="!rounded-lg shrink-0 !bg-slate-100 !text-slate-400 ring-1 ring-inset ring-slate-200/60"
    data-testid={src ? 'order-item-image' : 'order-item-placeholder'}
  />
);

// ── Page header ──────────────────────────────────────────────────────────
const HeaderChip = ({ value, label, dot, tone = 'text-slate-500', active, onClick, testId }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    data-testid={testId}
    className={`inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[11px] font-medium transition ${tone} ${
      active ? 'bg-slate-100 ring-1 ring-slate-300' : 'hover:bg-slate-50'
    }`}
  >
    <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
    <span className="font-semibold tabular-nums">{value}</span>
    {label}
  </button>
);

const HeaderStat = ({ value, label, dot, tone }) => (
  <span className={`inline-flex items-center gap-1.5 px-1.5 py-0.5 text-[11px] font-medium ${tone}`}>
    <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
    <span className="font-semibold tabular-nums">{value}</span>
    {label}
  </span>
);

export const OrdersHeader = ({ stats, revenueLabel, lowStockCount, activeStatus, onStatus, onRefresh, loading }) => (
  <div className="mb-4 flex flex-col gap-4 rounded-xl border border-slate-200 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
    <div className="flex min-w-0 items-center gap-4">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200">
        <ShoppingCartOutlined className="text-sm text-slate-500" />
      </div>
      <div className="min-w-0">
        <h1 className="font-duotone-bold-extended text-lg uppercase leading-tight tracking-tight text-slate-800">
          Shop Orders
        </h1>
        <div className="-ml-1.5 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <HeaderStat value={revenueLabel} label="revenue" dot="bg-emerald-500" tone="text-emerald-600" />
          <HeaderChip value={stats?.total_orders ?? 0} label="orders" dot="bg-slate-400" active={activeStatus === 'all'} onClick={() => onStatus('all')} testId="header-chip-all" />
          <HeaderChip value={stats?.pending_count ?? 0} label="pending" dot="bg-amber-500" tone="text-amber-600" active={activeStatus === 'pending'} onClick={() => onStatus('pending')} testId="header-chip-pending" />
          <HeaderChip value={stats?.shipped_count ?? 0} label="shipped" dot="bg-violet-500" tone="text-violet-600" active={activeStatus === 'shipped'} onClick={() => onStatus('shipped')} testId="header-chip-shipped" />
          {lowStockCount > 0 && (
            <HeaderStat value={lowStockCount} label="low stock" dot="bg-rose-500" tone="text-rose-600" />
          )}
        </div>
      </div>
    </div>
    <div className="flex shrink-0 items-center gap-2">
      <Tooltip title="Refresh">
        <Button
          type="text"
          aria-label="Refresh orders"
          icon={<ReloadOutlined spin={loading} />}
          onClick={onRefresh}
          className="text-slate-500 hover:text-slate-800"
        />
      </Tooltip>
    </div>
  </div>
);

// ── Status tab rail ──────────────────────────────────────────────────────
const TAB_ORDER = [
  { key: 'all',        label: 'All',        count: (s) => s?.total_orders },
  { key: 'pending',    label: 'Pending',    count: (s) => s?.pending_count },
  { key: 'confirmed',  label: 'Confirmed',  count: (s) => s?.confirmed_count },
  { key: 'processing', label: 'Processing', count: (s) => s?.processing_count },
  { key: 'shipped',    label: 'Shipped',    count: (s) => s?.shipped_count },
  { key: 'delivered',  label: 'Delivered',  count: (s) => s?.delivered_count },
];

export const StatusTabs = ({ value, stats, onChange }) => (
  <div role="tablist" aria-label="Order status" className="flex flex-wrap items-center gap-1.5">
    {TAB_ORDER.map((tab) => {
      const active = value === tab.key;
      const count = Number(tab.count(stats) ?? 0);
      return (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={active}
          onClick={() => onChange(tab.key)}
          className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[12px] font-semibold transition ${
            active
              ? 'bg-slate-900 text-white shadow-sm'
              : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
          }`}
        >
          {tab.label}
          <span
            className={`rounded-full px-1.5 py-px text-[10px] font-bold tabular-nums leading-4 ${
              active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
            }`}
          >
            {count.toLocaleString()}
          </span>
        </button>
      );
    })}
  </div>
);

// ── Empty state ──────────────────────────────────────────────────────────
export const OrdersEmpty = ({ filtered }) => (
  <div className="py-14 text-center">
    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100">
      <InboxOutlined className="text-xl text-slate-300" />
    </div>
    <p className="text-sm font-semibold text-slate-600">No orders found</p>
    <p className="mt-1 text-xs text-slate-400">
      {filtered ? 'Try a different status, search or date range.' : 'New shop orders will show up here.'}
    </p>
  </div>
);

// ── Low stock strip ──────────────────────────────────────────────────────
export const LowStockStrip = ({ products }) => {
  if (!products?.length) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-amber-200/70 bg-amber-50/70 px-4 py-2.5">
      <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-amber-700">
        <WarningOutlined /> Low stock
      </span>
      <div className="flex flex-wrap items-center gap-1.5">
        {products.slice(0, 6).map((p) => (
          <span
            key={p.id}
            className="inline-flex max-w-[220px] items-center gap-1 rounded-md bg-white px-2 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-inset ring-amber-200/70"
          >
            <span className="truncate">{p.name}</span>
            <span className="shrink-0 tabular-nums text-amber-600">· {p.stock_quantity} left</span>
          </span>
        ))}
        {products.length > 6 && (
          <span className="text-[11px] font-medium text-amber-700">+{products.length - 6} more</span>
        )}
      </div>
    </div>
  );
};

// ── Mobile card ──────────────────────────────────────────────────────────
export const OrderMobileCard = ({ record, onAction, formatCurrency }) => {
  const { primaryName, extraCount, thumbnail } = summarizeOrderItems(record);
  const customer = customerDisplay(record);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onAction('view', record)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAction('view', record); } }}
      className="cursor-pointer rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm transition active:bg-slate-50"
    >
      <div className="flex items-start gap-3">
        <OrderThumb src={thumbnail} name={primaryName} size={44} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="m-0 truncate text-[13px] font-semibold leading-tight text-slate-900">
              {primaryName}
              {extraCount > 0 && <span className="ml-1 font-normal text-slate-400">+{extraCount} more</span>}
            </p>
            <StatusPill status={record.status} />
          </div>
          <p className="m-0 mt-0.5 text-[11px] leading-tight text-slate-400">
            {record.order_number} · {formatOrderDate(record.created_at)}
          </p>
        </div>
      </div>
      <div className="mt-3 flex items-end justify-between gap-3 border-t border-slate-100 pt-2.5">
        <div className="min-w-0">
          <p className="m-0 truncate text-[12px] font-medium leading-tight text-slate-700">{customer.name}</p>
          <p className="m-0 mt-0.5 text-[11px] leading-tight text-slate-400">{customer.phone}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="m-0 text-[15px] font-bold tabular-nums leading-tight text-slate-900">
            {formatCurrency(record.total_amount, record.currency || 'EUR')}
          </p>
          <div className="mt-1">
            <PaymentCell order={record} formatCurrency={formatCurrency} align="end" />
          </div>
        </div>
      </div>
    </div>
  );
};
