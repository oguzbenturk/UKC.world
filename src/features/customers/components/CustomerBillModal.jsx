import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Modal, Button, DatePicker, Spin, Empty, Tooltip, App } from 'antd';
import dayjs from 'dayjs';
import {
  PrinterOutlined, DownloadOutlined, CloseOutlined,
  HomeOutlined, BookOutlined, EyeOutlined, ShoppingOutlined,
  GiftOutlined, ShoppingCartOutlined, CrownOutlined,
} from '@ant-design/icons';
import { useData } from '@/shared/hooks/useData';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import {
  buildBillItems, filterByPeriod, groupByCategory,
  computeTotals, CATEGORY_DISPLAY_ORDER, CATEGORY_LABELS,
} from './customerBill/billAggregator';
import { exportBillPdfFromElement, exportBillPdf } from './customerBill/billPdfExport';
import './customerBill/billPrint.css';

const BRAND_TEAL = '#00a8c4';

const CATEGORY_ICONS = {
  accommodation: <HomeOutlined />,
  lessons: <BookOutlined />,
  supervision: <EyeOutlined />,
  rentals: <ShoppingOutlined />,
  packages: <GiftOutlined />,
  shop: <ShoppingCartOutlined />,
  memberships: <CrownOutlined />,
};

const STATUS_PILL = {
  paid:      { text: 'text-emerald-600', label: 'Paid' },
  unpaid:    { text: 'text-amber-600',   label: 'Unpaid' },
  package:   { text: 'text-sky-600',     label: 'Incl. in package' },
  cancelled: { text: 'text-slate-400',   label: 'Cancelled' },
  refunded:  { text: 'text-rose-600',    label: 'Refunded' },
};

function StatusPill({ status }) {
  const s = STATUS_PILL[status] || STATUS_PILL.paid;
  return (
    <span className={`text-[11px] font-semibold whitespace-nowrap ${s.text}`}>
      {s.label}
    </span>
  );
}

const fmtShort = (date) => date ? date.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const RANGE_PRESETS = [
  { label: 'Last 30 days', value: [dayjs().subtract(30, 'day'), dayjs()] },
  { label: 'Last 90 days', value: [dayjs().subtract(90, 'day'), dayjs()] },
  { label: 'Year to date', value: [dayjs().startOf('year'), dayjs()] },
  { label: 'Last 12 months', value: [dayjs().subtract(12, 'month'), dayjs()] },
];

const CustomerBillModal = ({
  open,
  onClose,
  customer,
  bookings = [],
  rentals = [],
  packages = [],
  accommodationBookings = [],
  transactions = [],
  instructors = [],
  discountsByEntity = null,
}) => {
  const { apiClient } = useData();
  const { formatCurrency, businessCurrency, convertCurrency } = useCurrency();
  const { message } = App.useApp();
  const baseCurrency = businessCurrency || 'EUR';

  const [period, setPeriod] = useState(null); // null = all time
  const [shopOrders, setShopOrders] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [loadingExtra, setLoadingExtra] = useState(false);

  // Fetch the two datasets the parent doesn't already load.
  useEffect(() => {
    if (!open || !customer?.id) return;
    let cancelled = false;
    setLoadingExtra(true);
    Promise.allSettled([
      apiClient.get(`/shop-orders/admin/user/${customer.id}?page=1&limit=200`),
      apiClient.get(`/member-offerings/user/${customer.id}/purchases`),
    ]).then(([shopRes, memberRes]) => {
      if (cancelled) return;
      if (shopRes.status === 'fulfilled') {
        setShopOrders(shopRes.value?.data?.orders || []);
      } else setShopOrders([]);
      if (memberRes.status === 'fulfilled') {
        setMemberships(Array.isArray(memberRes.value?.data) ? memberRes.value.data : []);
      } else setMemberships([]);
    }).finally(() => {
      if (!cancelled) setLoadingExtra(false);
    });
    return () => { cancelled = true; };
  }, [open, customer?.id, apiClient]);

  // Reset period filter when modal closes.
  useEffect(() => {
    if (!open) setPeriod(null);
  }, [open]);

  const allItems = useMemo(() => buildBillItems({
    bookings, rentals, accommodationBookings, packages,
    shopOrders, memberships, instructors,
    transactions,
    discountsByEntity,
    customerId: customer?.id || null,
  }), [bookings, rentals, accommodationBookings, packages, shopOrders, memberships, instructors, transactions, discountsByEntity, customer?.id]);

  // Hide the discount column unless at least one line in the bill carries one,
  // so unaffected customers' bills look exactly as before.
  const hasAnyDiscount = useMemo(
    () => allItems.some(it => (it.discountAmount ?? 0) > 0),
    [allItems]
  );

  const periodTuple = period ? [period[0].toDate(), period[1].toDate()] : null;

  const items = useMemo(() => filterByPeriod(allItems, periodTuple), [allItems, periodTuple]);
  const grouped = useMemo(() => groupByCategory(items), [items]);

  const convertToBase = useCallback(
    (amt, cur) => convertCurrency(amt, cur, baseCurrency),
    [convertCurrency, baseCurrency]
  );

  const totals = useMemo(
    () => computeTotals(allItems, transactions, periodTuple, baseCurrency, convertToBase),
    [allItems, transactions, periodTuple, baseCurrency, convertToBase]
  );

  const fmt = (v) => formatCurrency(v || 0, baseCurrency);

  const customerName = (() => {
    if (!customer) return 'Customer';
    const first = customer.first_name || customer.firstName;
    const last = customer.last_name || customer.lastName;
    const joined = [first, last].filter(Boolean).join(' ');
    return joined || customer.name || 'Customer';
  })();

  const customerAddress = [customer?.address, customer?.city, customer?.country].filter(Boolean).join(', ');

  const billRef = useMemo(() => {
    if (!customer?.id) return '';
    return `BILL-${customer.id}-${dayjs().format('YYYYMMDD')}`;
  }, [customer?.id]);

  const issuedAt = dayjs().format('DD MMM YYYY');

  const printableRef = useRef(null);
  const handlePrint = () => window.print();

  // Best-effort breadcrumb so PDF failures land in production server logs
  // (the browser console isn't accessible to staff on prod). Fire-and-forget;
  // never let logging itself break the user flow.
  const reportClientError = async (context, err) => {
    try {
      const payload = {
        context,
        message: err?.message || String(err),
        stack: err?.stack || null,
        url: typeof window !== 'undefined' ? window.location.href : null,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      };
      // Use sendBeacon when available so the request survives a tab reset.
      const body = JSON.stringify(payload);
      if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
        const blob = new Blob([body], { type: 'application/json' });
        navigator.sendBeacon('/api/client-errors', blob);
        return;
      }
      await fetch('/api/client-errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
    } catch { /* swallow — logging must never throw */ }
  };

  const handlePdf = async () => {
    const safeName = (customerName || 'Customer').replace(/[^a-zA-Z0-9-_]+/g, '-');
    const datePart = new Date().toISOString().slice(0, 10);
    const filename = `DPC-Statement-${safeName}-${datePart}.pdf`;

    let domCaptureError = null;
    if (printableRef.current) {
      try {
        await exportBillPdfFromElement(printableRef.current, filename);
        return;
      } catch (err) {
        domCaptureError = err;
        console.warn('Bill PDF: DOM capture failed, falling back to text export', err);
      }
    }

    // Both paths get a try/catch — the legacy export had none, so a throw
    // there propagated up to React's error boundary and "reset" the app.
    try {
      await exportBillPdf({
        customerName,
        customerEmail: customer?.email,
        customerPhone: customer?.phone,
        customerAddress,
        billRef,
        issuedAt,
        period: period ? [period[0].format('DD MMM YYYY'), period[1].format('DD MMM YYYY')] : null,
        grouped,
        totals,
        baseCurrency,
        formatCurrency,
      });
    } catch (err) {
      // Both paths failed. Tell the user, surface a print fallback, and
      // ship both errors to the backend so prod has a stack trace to grep.
      console.error('Bill PDF: legacy export also failed', err);
      message.error('Could not generate PDF. Use the Print button (Save as PDF) as a workaround.');
      reportClientError('CustomerBillModal.handlePdf', err);
      if (domCaptureError) reportClientError('CustomerBillModal.handlePdf:dom-capture', domCaptureError);
    }
  };

  const visibleCategories = CATEGORY_DISPLAY_ORDER.filter(cat => grouped[cat]?.length > 0);
  const isEmpty = visibleCategories.length === 0;

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={900}
      centered
      footer={null}
      closable={false}
      destroyOnHidden
      styles={{ body: { padding: 0 }, content: { padding: 0, overflow: 'hidden' } }}
      wrapClassName="ukc-bill-modal-wrap"
    >
      <div className="ukc-bill-printable bg-white" ref={printableRef}>
        <Spin spinning={loadingExtra} tip="Loading bill…">

          {/* ── Letterhead (masthead style) ──────────────────────── */}
          <div className="bg-white">
            {/* Full-width centered logo. Uses object-contain + intrinsic
                aspect-ratio so the entire "DUOTONE PRO CENTER URLA" wordmark
                renders crisply at any viewport. */}
            <div className="px-8 pt-7 pb-5 flex justify-center">
              <img
                src="/dps-procenter.svg?v=3"
                alt="Duotone Pro Center Urla"
                className="block w-full max-w-[560px] h-auto"
                style={{ aspectRatio: '800 / 112.5' }}
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            </div>

            {/* Heavy black rule — the editorial signature */}
            <div className="h-[3px] mx-8" style={{ background: '#0f172a' }} />
            <div className="h-[2px] mx-8 mt-px" style={{ background: BRAND_TEAL }} />
          </div>

          {/* ── Customer Info + Period ───────────────────────────── */}
          <div className="px-8 py-6 border-b border-slate-100">
            {/* Issued date aligned right above the customer/period grid */}
            <div className="flex justify-end mb-4">
              <div className="text-[10px] text-slate-400 uppercase tracking-wider">Issued {issuedAt}</div>
            </div>

            {/* Customer + Period grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <div className="text-[9px] uppercase tracking-[0.28em] text-slate-400 font-bold mb-2.5">Bill To</div>
                <div className="font-bold text-slate-900 text-[15px] tracking-tight">{customerName}</div>
                {customer?.email && <div className="text-xs text-slate-600 mt-1.5">{customer.email}</div>}
                {customer?.phone && <div className="text-xs text-slate-600">{customer.phone}</div>}
                {customerAddress && <div className="text-xs text-slate-500 mt-0.5">{customerAddress}</div>}
              </div>
              <div>
                <div className="text-[9px] uppercase tracking-[0.28em] text-slate-400 font-bold mb-2.5">Period</div>
                <div className="ukc-bill-no-print">
                  <DatePicker.RangePicker
                    value={period}
                    onChange={setPeriod}
                    presets={RANGE_PRESETS}
                    allowClear
                    className="w-full"
                    format="DD MMM YYYY"
                    placeholder={['All time', 'All time']}
                  />
                </div>
                <div className="text-sm text-slate-700 font-medium mt-1">
                  {period
                    ? `${period[0].format('DD MMM YYYY')} → ${period[1].format('DD MMM YYYY')}`
                    : 'All time'}
                </div>
                <div className="mt-2 text-[10px] text-slate-400 uppercase tracking-wider">
                  {items.length} item{items.length === 1 ? '' : 's'} in period
                </div>
              </div>
            </div>
          </div>

          {/* ── Sections ─────────────────────────────────────────── */}
          <div className="px-8 py-6 space-y-5">
            {isEmpty && (
              <div className="py-12">
                <Empty description="No activity in this period" />
              </div>
            )}

            {visibleCategories.map(cat => {
              const rows = grouped[cat];
              const subtotal = totals.subtotalsByCategory[cat] || 0;
              return (
                <section
                  key={cat}
                  className="ukc-bill-section rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm"
                >
                  <header className="px-4 py-1 bg-slate-50/70 border-b border-slate-200 flex items-center justify-between gap-3 border-l-4" style={{ borderLeftColor: BRAND_TEAL, minHeight: 24 }}>
                    <div className="flex items-center gap-2 leading-none">
                      <span className="inline-flex items-center justify-center leading-none" style={{ color: BRAND_TEAL, fontSize: 14, lineHeight: 1 }}>{CATEGORY_ICONS[cat]}</span>
                      <h3 className="text-[12px] font-semibold text-slate-800 uppercase tracking-wide leading-none m-0">{CATEGORY_LABELS[cat]}</h3>
                      <span className="inline-flex items-center text-[10px] text-slate-500 font-semibold px-1.5 py-[1px] rounded bg-white border border-slate-200 leading-none">
                        {rows.length}
                      </span>
                    </div>
                    <div className="text-[13px] font-semibold text-slate-900 tabular-nums leading-none">
                      {fmt(subtotal)}
                    </div>
                  </header>

                  {/* table-fixed + colgroup locks every body cell to the same
                      column width as its header, so "QTY" and the "1" beneath
                      it line up regardless of how long the description is. */}
                  <table className="w-full text-xs table-fixed">
                    <colgroup>
                      <col style={{ width: '92px' }} />
                      <col />
                      <col style={{ width: '56px' }} />
                      <col style={{ width: '88px' }} />
                      <col style={{ width: '96px' }} />
                      {hasAnyDiscount && <col style={{ width: '110px' }} />}
                      <col style={{ width: '110px' }} />
                    </colgroup>
                    <thead className="text-[10px] uppercase tracking-wider text-slate-400 bg-white">
                      <tr>
                        <th className="text-left font-medium px-4 py-2">Date</th>
                        <th className="text-left font-medium px-4 py-2">Description</th>
                        <th className="text-center font-medium px-4 py-2">Qty</th>
                        <th className="text-center font-medium px-4 py-2">Unit</th>
                        <th className="text-center font-medium px-4 py-2">Amount</th>
                        {hasAnyDiscount && <th className="text-center font-medium px-4 py-2">Discount</th>}
                        <th className="text-center font-medium px-4 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(it => {
                        const isCancelled = it.status === 'cancelled';
                        const hasDiscount = (it.discountAmount ?? 0) > 0;
                        return (
                          <tr key={it.id} className={`border-t border-slate-100 ${isCancelled ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                            <td className="px-4 py-2.5 align-top whitespace-nowrap text-slate-600">{fmtShort(it.date)}</td>
                            <td className="px-4 py-2.5 align-top">
                              <div className="font-medium text-slate-800 leading-tight">{it.description}</div>
                              {it.detail && (
                                <div className="text-[11px] text-slate-400 mt-1 leading-snug">{it.detail}</div>
                              )}
                            </td>
                            <td className="px-4 py-2.5 align-top text-center tabular-nums">{it.qtyDisplay ?? it.qty}</td>
                            <td className="px-4 py-2.5 align-top text-center tabular-nums text-slate-500">
                              {it.unitPrice != null ? fmt(it.unitPrice) : '—'}
                            </td>
                            <td className="px-4 py-2.5 align-top text-center tabular-nums font-medium whitespace-nowrap">
                              {it.status === 'package' ? (
                                <Tooltip title="Covered by package">
                                  <span className="text-slate-400 italic font-normal">included</span>
                                </Tooltip>
                              ) : (
                                hasDiscount ? (
                                  <div>
                                    <div className="text-[10px] text-slate-400 line-through font-normal">{fmt(it.originalAmount)}</div>
                                    <div className="text-emerald-600">{fmt(it.amount)}</div>
                                  </div>
                                ) : fmt(it.amount)
                              )}
                            </td>
                            {hasAnyDiscount && (
                              <td className="px-4 py-2.5 align-top text-center tabular-nums whitespace-nowrap">
                                {hasDiscount ? (
                                  <span className="text-rose-600 text-[11px] font-medium">{it.discountPercent}% −{fmt(it.discountAmount)}</span>
                                ) : <span className="text-slate-300">—</span>}
                              </td>
                            )}
                            <td className="px-4 py-2.5 align-top text-center">
                              <StatusPill status={it.status} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </section>
              );
            })}
          </div>

          {/* ── Totals block ─────────────────────────────────────── */}
          {!isEmpty && (
            <div className="px-8 pb-6 flex justify-end ukc-bill-section">
              <div className="w-full sm:w-[360px] border-t-2 border-slate-800 pt-3 space-y-1.5 text-sm">
                <div className="flex justify-between text-slate-700">
                  <span className="font-medium">Subtotal</span>
                  <span className="tabular-nums font-semibold">{fmt(totals.subtotal)}</span>
                </div>
                {visibleCategories.map(cat => {
                  const v = totals.subtotalsByCategory[cat] || 0;
                  if (v <= 0) return null;
                  return (
                    <div key={cat} className="flex justify-between text-[11px] text-slate-500 pl-3">
                      <span>{CATEGORY_LABELS[cat]}</span>
                      <span className="tabular-nums">{fmt(v)}</span>
                    </div>
                  );
                })}
                <div className="border-t border-slate-200 mt-2 pt-2 space-y-1.5">
                  <div className="flex justify-between items-baseline text-slate-700">
                    <span className="font-medium">Payments received</span>
                    <span className="tabular-nums font-semibold text-emerald-600 whitespace-nowrap">
                      {fmt(totals.paymentsReceived)}
                    </span>
                  </div>
                </div>
                <div className="border-t-2 border-slate-800 mt-3 pt-3 flex justify-between items-baseline">
                  <span className="text-sm font-semibold uppercase tracking-wide text-slate-700">Balance Due</span>
                  <span
                    className="tabular-nums text-xl font-bold"
                    style={{ color: totals.balanceDue > 0.005 ? '#e11d48' : BRAND_TEAL }}
                  >
                    {fmt(totals.balanceDue)}
                  </span>
                </div>
              </div>
            </div>
          )}

        </Spin>

        {/* ── Action bar (hidden when printing) ──────────────────── */}
        <div className="ukc-bill-no-print px-8 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
          <Button onClick={onClose} icon={<CloseOutlined />}>Close</Button>
          <Button onClick={handlePrint} icon={<PrinterOutlined />}>Print</Button>
          <Button
            type="primary"
            onClick={handlePdf}
            icon={<DownloadOutlined />}
            style={{ background: BRAND_TEAL, borderColor: BRAND_TEAL }}
          >
            Download PDF
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default CustomerBillModal;
