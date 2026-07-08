import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Form, Input, InputNumber, Select, Result } from 'antd';
import {
  PlusOutlined, ReloadOutlined, FilePdfOutlined, SearchOutlined,
  DeleteOutlined, EditOutlined, CloseCircleFilled, RightOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { message } from '@/shared/utils/antdStatic';
import { listSpareParts, createSparePart, updateSparePart, deleteSparePart } from '../api/sparePartsApi';
import { exportSparePartsPdf } from '../pdf/sparePartsPdfExport';
import { useAuth } from '@/shared/hooks/useAuth';

const BLUE = '#00a8c4';
const CURRENCIES = ['EUR', 'TRY', 'USD', 'GBP'];
const CURRENCY_SYMBOLS = { EUR: '€', TRY: '₺', USD: '$', GBP: '£' };
const STAGES = ['pending', 'ordered', 'received'];

const formatMoney = (amount, currency = 'EUR') => {
  if (amount === null || amount === undefined || amount === '') return '—';
  const sym = CURRENCY_SYMBOLS[currency] || `${currency} `;
  return `${sym}${Number(amount).toFixed(2)}`;
};

/* The signature element: a conveyor-style lifecycle rail. Blue = pipeline
   channel; the payment chip owns the amber/emerald money channel. */
function LifecycleRail({ order, t }) {
  if (order.status === 'cancelled') {
    return (
      <div className="flex w-full max-w-[340px] items-center gap-2" aria-label={t('admin:spareParts.filters.status.cancelled')}>
        <span className="h-[3px] flex-1 rounded bg-gradient-to-r from-slate-200 to-rose-300" />
        <CloseCircleFilled className="text-rose-400" />
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-rose-500">
          {t('admin:spareParts.filters.status.cancelled')}
        </span>
        <span className="h-[3px] flex-1 rounded bg-gradient-to-l from-slate-200 to-rose-300" />
      </div>
    );
  }
  const idx = STAGES.indexOf(order.status);
  const dates = [order.createdAt, order.orderedAt, order.receivedAt];
  return (
    <div className="flex w-full max-w-[340px] items-start" aria-label={t(`admin:spareParts.filters.status.${order.status}`)}>
      {STAGES.map((stage, i) => (
        <span key={stage} className="contents">
          {i > 0 && (
            <span
              className="mt-[7px] h-[3px] flex-1 rounded-full"
              style={{
                background: i <= idx
                  ? `linear-gradient(90deg, ${BLUE}, #22d3ee)`
                  : '#e2e8f0'
              }}
            />
          )}
          <span className="flex w-16 flex-col items-center gap-1">
            <span
              className={`h-4 w-4 rounded-full border-2 transition-colors ${
                i <= idx ? 'border-[#00a8c4] bg-[#00a8c4]' : 'border-slate-300 bg-white'
              } ${i === idx ? 'ring-4 ring-[#00a8c4]/20' : ''}`}
            />
            <span className={`text-[9px] font-bold uppercase tracking-[0.12em] ${i <= idx ? 'text-[#0489a0]' : 'text-slate-400'}`}>
              {t(`admin:spareParts.filters.status.${stage}`)}
            </span>
            <span className="font-mono text-[9px] tabular-nums text-slate-400">
              {dates[i] ? dayjs(dates[i]).format('DD MMM') : '·'}
            </span>
          </span>
        </span>
      ))}
    </div>
  );
}

function PaymentSwitch({ order, onToggle, t, disabled }) {
  const paid = order.paymentStatus === 'paid';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={paid}
      disabled={disabled}
      onClick={() => onToggle(order, paid ? 'unpaid' : 'paid')}
      title={paid ? t('admin:spareParts.table.markUnpaid') : t('admin:spareParts.table.markPaid')}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.1em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00a8c4] focus-visible:ring-offset-1 ${
        paid
          ? 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
          : 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
      }`}
    >
      <span className={`h-2 w-2 rounded-full ${paid ? 'bg-emerald-500' : 'sp-dot-pulse bg-amber-500'}`} />
      {paid ? t('admin:spareParts.payment.paid') : t('admin:spareParts.payment.unpaid')}
    </button>
  );
}

const FieldLabel = ({ children }) => (
  <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">{children}</span>
);

/* antd Form-compatible chip group: Form.Item injects value/onChange. */
function ChoiceChips({ value, onChange, options }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange?.(o.value)}
            className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-bold uppercase tracking-[0.08em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00a8c4] focus-visible:ring-offset-1 ${
              active
                ? o.activeClass || 'border-[#00a8c4] bg-[#00a8c4]/10 text-[#0489a0]'
                : 'border-slate-200 bg-white text-slate-400 hover:border-slate-300 hover:text-slate-600'
            }`}
          >
            {o.dot && <span className={`h-2 w-2 rounded-full ${active ? o.dot : 'bg-slate-300'}`} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Chip({ active, activeClass, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00a8c4] focus-visible:ring-offset-1 ${
        active
          ? activeClass || 'border-transparent bg-[#00a8c4] text-white shadow-sm'
          : 'border-slate-200 bg-white text-slate-500 hover:border-[#00a8c4]/50 hover:text-slate-700'
      }`}
    >
      {children}
    </button>
  );
}

export default function SparePartsOrders() {
  const { t, i18n } = useTranslation(['admin']);
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const [q, setQ] = useState('');
  const [editingCostId, setEditingCostId] = useState(null);
  const [costDraft, setCostDraft] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [form] = Form.useForm();

  const isAuthorized = user && ['admin', 'manager', 'front_desk', 'receptionist', 'owner'].includes(user.role?.toLowerCase());

  const load = useCallback(async () => {
    // Skip loading if not authorized
    if (!isAuthorized) return;

    try {
      setLoading(true);
      const data = await listSpareParts({ status: status || undefined, paymentStatus: paymentStatus || undefined, q: q || undefined });
      setOrders(data);
    } catch {
      message.error(t('admin:spareParts.toast.loadError'));
    } finally {
      setLoading(false);
    }
  }, [status, paymentStatus, q, isAuthorized]);

  useEffect(() => { load(); }, [load]);

  // Totals grouped by currency so mixed-currency orders never get summed together.
  const totals = useMemo(() => {
    const acc = {};
    for (const o of orders) {
      if (o.costAmount === null || o.costAmount === undefined) continue;
      const cur = o.currency || 'EUR';
      acc[cur] = acc[cur] || { paid: 0, unpaid: 0 };
      const amt = Number(o.costAmount) || 0;
      if (o.paymentStatus === 'paid') acc[cur].paid += amt;
      else acc[cur].unpaid += amt;
    }
    return acc;
  }, [orders]);

  if (!isAuthorized) {
    return (
      <Result
        status="403"
        title="403"
        subTitle={t('admin:spareParts.unauthorized')}
      />
    );
  }

  const onCreate = async (values) => {
    try {
      const created = await createSparePart(values);
      setOrders((prev) => [created, ...prev]);
      message.success(t('admin:spareParts.toast.created'));
      setOpen(false);
      form.resetFields();
    } catch {
      message.error(t('admin:spareParts.toast.createError'));
    }
  };

  const updateStatus = async (o, status) => {
    try {
      const ts = new Date().toISOString();
      const patch = { status };
      if (status === 'ordered') patch.orderedAt = ts;
      if (status === 'received') patch.receivedAt = ts;
      const updated = await updateSparePart(o.id, patch);
      setOrders((prev) => prev.map((it) => (it.id === o.id ? updated : it)));
      message.success(t('admin:spareParts.toast.statusUpdated', { status }));
    } catch {
      message.error(t('admin:spareParts.toast.statusError'));
    }
  };

  const updatePayment = async (o, paymentStatus) => {
    try {
      const updated = await updateSparePart(o.id, { paymentStatus });
      setOrders((prev) => prev.map((it) => (it.id === o.id ? updated : it)));
      message.success(t(`admin:spareParts.toast.payment.${paymentStatus}`));
    } catch {
      message.error(t('admin:spareParts.toast.paymentError'));
    }
  };

  const saveCost = async (o) => {
    try {
      const updated = await updateSparePart(o.id, { costAmount: costDraft ?? null });
      setOrders((prev) => prev.map((it) => (it.id === o.id ? updated : it)));
      setEditingCostId(null);
    } catch {
      message.error(t('admin:spareParts.toast.costError'));
    }
  };

  const onDelete = async (o) => {
    try {
      await deleteSparePart(o.id);
      setOrders((prev) => prev.filter((it) => it.id !== o.id));
      message.success(t('admin:spareParts.toast.deleted'));
    } catch {
      message.error(t('admin:spareParts.toast.deleteError'));
    }
  };

  const exportPdf = async () => {
    try {
      setExporting(true);
      await exportSparePartsPdf({ orders, totals, t, lang: i18n.language?.slice(0, 2) || 'en' });
    } catch {
      message.error(t('admin:spareParts.toast.exportError'));
    } finally {
      setExporting(false);
    }
  };

  const ghostBtn = 'inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:border-[#00a8c4]/50 hover:text-[#0489a0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00a8c4] focus-visible:ring-offset-1';

  return (
    <div className="p-4">
      <style>{`
        @keyframes sp-rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
        @keyframes sp-pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(245,158,11,.45); } 60% { box-shadow: 0 0 0 5px rgba(245,158,11,0); } }
        @keyframes sp-shimmer { from { background-position: -200% 0; } to { background-position: 200% 0; } }
        .sp-rise { animation: sp-rise .4s cubic-bezier(.22,.9,.35,1) both; }
        .sp-dot-pulse { animation: sp-pulse 2.2s ease-out infinite; }
        .sp-shimmer { background: linear-gradient(90deg, #f1f5f9 25%, #e8f6f9 50%, #f1f5f9 75%); background-size: 200% 100%; animation: sp-shimmer 1.4s linear infinite; }
        .sp-card { transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease; }
        .sp-card:hover { transform: translateY(-2px); border-color: rgba(0,168,196,.35); box-shadow: 0 10px 28px -14px rgba(0,168,196,.35); }
        @media (prefers-reduced-motion: reduce) {
          .sp-rise, .sp-dot-pulse, .sp-shimmer { animation: none !important; }
          .sp-card, .sp-card:hover { transform: none; }
        }
      `}</style>

      <div
        className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-b from-white to-sky-50/50 p-4 shadow-[0_1px_0_rgba(15,23,42,.03),0_16px_40px_-24px_rgba(0,168,196,.25)] sm:p-6"
        style={{
          backgroundImage: 'linear-gradient(rgba(0,168,196,.045) 1px, transparent 1px), linear-gradient(90deg, rgba(0,168,196,.045) 1px, transparent 1px)',
          backgroundSize: '24px 24px'
        }}
      >
        {/* Spectrum hairline: pipeline blue flowing into settled emerald */}
        <span className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-[#00a8c4] via-sky-300 to-emerald-300" />

        {/* Header */}
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-[#0489a0]">UKC.Care</p>
            <h1 className="font-duotone-bold-extended text-2xl uppercase tracking-wide text-slate-900">
              {t('admin:spareParts.title')}
            </h1>
            <p className="mt-0.5 text-xs text-slate-500">{t('admin:spareParts.subtitle', 'Every part you order, where it is, and whether it’s paid.')}</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className={ghostBtn} onClick={load} disabled={loading}>
              <ReloadOutlined /> {t('admin:spareParts.actions.refresh')}
            </button>
            <button type="button" className={ghostBtn} onClick={exportPdf} disabled={loading || exporting || orders.length === 0}>
              <FilePdfOutlined /> {t('admin:spareParts.actions.exportPdf', 'Export PDF')}
            </button>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#00a8c4] px-4 py-2 text-xs font-bold uppercase tracking-wide text-white shadow-md shadow-cyan-500/25 transition-colors hover:bg-[#0093ac] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00a8c4] focus-visible:ring-offset-2"
            >
              <PlusOutlined /> {t('admin:spareParts.actions.newOrder')}
            </button>
          </div>
        </div>

        {/* Money readouts, one tile per currency */}
        {Object.keys(totals).length > 0 && (
          <div className="mb-5 flex flex-wrap gap-3">
            {Object.entries(totals).map(([cur, v]) => (
              <div key={cur} className="flex items-center gap-5 rounded-2xl border border-slate-200 bg-white/85 px-5 py-3 backdrop-blur-sm">
                <span className="font-duotone-bold-extended text-sm text-slate-400">{cur}</span>
                <div>
                  <p className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.18em] text-amber-600">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    {t('admin:spareParts.totals.outstanding')}
                  </p>
                  <p className="font-mono text-xl font-bold tabular-nums text-amber-600">{formatMoney(v.unpaid, cur)}</p>
                </div>
                <span className="h-8 w-px bg-slate-200" />
                <div>
                  <p className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.18em] text-emerald-600">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    {t('admin:spareParts.totals.paid')}
                  </p>
                  <p className="font-mono text-xl font-bold tabular-nums text-emerald-600">{formatMoney(v.paid, cur)}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Command bar: filter chips + search */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Chip active={!status} onClick={() => setStatus('')}>{t('admin:spareParts.filters.all', 'All')}</Chip>
          {['pending', 'ordered', 'received', 'cancelled'].map((s) => (
            <Chip key={s} active={status === s} onClick={() => setStatus(status === s ? '' : s)}>
              {t(`admin:spareParts.filters.status.${s}`)}
            </Chip>
          ))}
          <span className="mx-1 h-5 w-px bg-slate-200" />
          <Chip
            active={paymentStatus === 'unpaid'}
            activeClass="border-transparent bg-amber-500 text-white shadow-sm"
            onClick={() => setPaymentStatus(paymentStatus === 'unpaid' ? '' : 'unpaid')}
          >
            {t('admin:spareParts.payment.unpaid')}
          </Chip>
          <Chip
            active={paymentStatus === 'paid'}
            activeClass="border-transparent bg-emerald-500 text-white shadow-sm"
            onClick={() => setPaymentStatus(paymentStatus === 'paid' ? '' : 'paid')}
          >
            {t('admin:spareParts.payment.paid')}
          </Chip>
          <div className="relative ml-auto min-w-[220px] flex-1 sm:max-w-[280px]">
            <SearchOutlined className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') load(); }}
              placeholder={t('admin:spareParts.filters.searchPlaceholder')}
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-[#00a8c4] focus:outline-none focus:ring-2 focus:ring-[#00a8c4]/20"
            />
          </div>
        </div>

        <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-slate-400">
          {t('admin:spareParts.results', '{{count}} orders', { count: orders.length })}
        </p>

        {/* Manifest */}
        {loading && orders.length === 0 ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => <div key={i} className="sp-shimmer h-24 rounded-2xl" />)}
          </div>
        ) : orders.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white/60 px-6 py-14 text-center">
            <p className="mx-auto max-w-sm text-sm text-slate-500">{t('admin:spareParts.empty', 'No spare part orders yet. Log the first part you order.')}</p>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[#00a8c4] px-4 py-2 text-xs font-bold uppercase tracking-wide text-white hover:bg-[#0093ac]"
            >
              <PlusOutlined /> {t('admin:spareParts.actions.newOrder')}
            </button>
          </div>
        ) : (
          <ul className={`space-y-3 ${loading ? 'opacity-60' : ''}`}>
            {orders.map((o, i) => {
              const nextStage = o.status === 'pending' ? 'ordered' : o.status === 'ordered' ? 'received' : null;
              return (
                <li
                  key={o.id}
                  className="sp-card sp-rise grid grid-cols-1 items-center gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-4 sm:px-5 lg:grid-cols-[minmax(200px,1.1fr)_minmax(260px,1.4fr)_auto]"
                  style={{ animationDelay: `${Math.min(i * 45, 400)}ms` }}
                >
                  {/* Identity */}
                  <div className="min-w-0">
                    <p className="font-mono text-[10px] tabular-nums text-slate-400">#{String(o.id).padStart(4, '0')}</p>
                    <p className="truncate text-base font-semibold text-slate-900">{o.partName}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      <span className="font-mono font-bold text-slate-600">×{o.quantity}</span>
                      {o.supplier ? <span> · {o.supplier}</span> : null}
                    </p>
                    {o.notes ? <p className="mt-1 truncate text-xs italic text-slate-400">{o.notes}</p> : null}
                  </div>

                  {/* Pipeline rail */}
                  <div className="flex justify-start lg:justify-center">
                    <LifecycleRail order={o} t={t} />
                  </div>

                  {/* Money + actions */}
                  <div className="flex flex-wrap items-center gap-3 lg:flex-col lg:items-end lg:gap-2">
                    {editingCostId === o.id ? (
                      <span className="flex items-center gap-1" onKeyDown={(e) => { if (e.key === 'Escape') setEditingCostId(null); }}>
                        <InputNumber
                          size="small"
                          min={0}
                          step={0.01}
                          value={costDraft}
                          onChange={setCostDraft}
                          onPressEnter={() => saveCost(o)}
                          autoFocus
                          style={{ width: 96 }}
                        />
                        <button type="button" className={ghostBtn} onClick={() => saveCost(o)}>✓</button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="group inline-flex items-center gap-1.5 rounded-lg px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00a8c4]"
                        onClick={() => { setEditingCostId(o.id); setCostDraft(o.costAmount); }}
                        title={t('admin:spareParts.modal.costLabel')}
                      >
                        <span className="font-mono text-lg font-bold tabular-nums text-slate-900">
                          {formatMoney(o.costAmount, o.currency)}
                        </span>
                        <EditOutlined className="text-xs text-slate-300 transition-opacity group-hover:text-[#0489a0]" />
                      </button>
                    )}

                    <PaymentSwitch order={o} onToggle={updatePayment} t={t} disabled={loading} />

                    <span className="flex items-center gap-2">
                      {nextStage && (
                        <button
                          type="button"
                          onClick={() => updateStatus(o, nextStage)}
                          disabled={loading}
                          className="inline-flex items-center gap-1 rounded-lg border border-[#00a8c4]/40 px-2.5 py-1 text-[11px] font-semibold text-[#0489a0] transition-colors hover:bg-[#00a8c4]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00a8c4]"
                        >
                          {nextStage === 'ordered' ? t('admin:spareParts.table.markOrdered') : t('admin:spareParts.table.markReceived')}
                          <RightOutlined className="text-[9px]" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onDelete(o)}
                        disabled={loading}
                        title={t('admin:spareParts.table.delete')}
                        className="rounded-lg p-1.5 text-slate-300 transition-colors hover:bg-rose-50 hover:text-rose-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                      >
                        <DeleteOutlined />
                      </button>
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Modal
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        title={null}
        width={540}
        styles={{ content: { padding: 0, overflow: 'hidden', borderRadius: 20 } }}
      >
        <div
          className="relative"
          style={{
            backgroundImage: 'linear-gradient(rgba(0,168,196,.045) 1px, transparent 1px), linear-gradient(90deg, rgba(0,168,196,.045) 1px, transparent 1px)',
            backgroundSize: '24px 24px'
          }}
        >
          <span className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-[#00a8c4] via-sky-300 to-emerald-300" />
          <div className="px-6 pb-6 pt-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-[#0489a0]">UKC.Care</p>
            <h2 className="font-duotone-bold-extended mb-4 text-xl uppercase tracking-wide text-slate-900">
              {t('admin:spareParts.modal.title')}
            </h2>
            <Form form={form} layout="vertical" onFinish={onCreate} requiredMark={false} initialValues={{ quantity: 1, status: 'pending', paymentStatus: 'unpaid', currency: 'EUR' }}>
              <Form.Item name="partName" label={<FieldLabel>{t('admin:spareParts.modal.partLabel')}</FieldLabel>} rules={[{ required: true, message: t('admin:spareParts.modal.partRequired') }]}>
                <Input size="large" placeholder={t('admin:spareParts.modal.partPlaceholder')} />
              </Form.Item>
              <div className="flex gap-3">
                <Form.Item name="quantity" label={<FieldLabel>{t('admin:spareParts.modal.quantityLabel')}</FieldLabel>} rules={[{ required: true, message: t('admin:spareParts.modal.quantityRequired') }]} style={{ width: 110 }}>
                  <InputNumber min={1} style={{ width: '100%' }} placeholder={t('admin:spareParts.modal.quantityPlaceholder')} />
                </Form.Item>
                <Form.Item name="supplier" label={<FieldLabel>{t('admin:spareParts.modal.supplierLabel')}</FieldLabel>} className="flex-1">
                  <Input placeholder={t('admin:spareParts.modal.supplierPlaceholder')} />
                </Form.Item>
              </div>
              <div className="flex gap-3">
                <Form.Item name="costAmount" label={<FieldLabel>{t('admin:spareParts.modal.costLabel')}</FieldLabel>} className="flex-1">
                  <InputNumber min={0} step={0.01} style={{ width: '100%' }} placeholder="0.00" />
                </Form.Item>
                <Form.Item name="currency" label={<FieldLabel>{t('admin:spareParts.modal.currencyLabel')}</FieldLabel>} style={{ width: 110 }}>
                  <Select options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
                </Form.Item>
              </div>
              <Form.Item name="paymentStatus" label={<FieldLabel>{t('admin:spareParts.modal.paymentLabel')}</FieldLabel>}>
                <ChoiceChips options={[
                  { value: 'unpaid', label: t('admin:spareParts.payment.unpaid'), dot: 'bg-amber-500', activeClass: 'border-amber-300 bg-amber-50 text-amber-700' },
                  { value: 'paid', label: t('admin:spareParts.payment.paid'), dot: 'bg-emerald-500', activeClass: 'border-emerald-300 bg-emerald-50 text-emerald-700' },
                ]} />
              </Form.Item>
              <Form.Item name="status" label={<FieldLabel>{t('admin:spareParts.modal.statusLabel')}</FieldLabel>}>
                <ChoiceChips options={[
                  { value: 'pending', label: t('admin:spareParts.filters.status.pending') },
                  { value: 'ordered', label: t('admin:spareParts.filters.status.ordered') },
                  { value: 'received', label: t('admin:spareParts.filters.status.received') },
                ]} />
              </Form.Item>
              <Form.Item name="notes" label={<FieldLabel>{t('admin:spareParts.modal.notesLabel', 'Notes')}</FieldLabel>}>
                <Input.TextArea rows={2} />
              </Form.Item>
              <button
                type="submit"
                className="mt-1 w-full rounded-xl bg-[#00a8c4] px-4 py-3 text-sm font-bold uppercase tracking-[0.12em] text-white shadow-md shadow-cyan-500/25 transition-colors hover:bg-[#0093ac] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00a8c4] focus-visible:ring-offset-2"
              >
                {t('admin:spareParts.modal.create')}
              </button>
            </Form>
          </div>
        </div>
      </Modal>
    </div>
  );
}
