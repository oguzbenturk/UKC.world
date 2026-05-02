import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Table, Button, Tag, InputNumber, Input, Space, Empty, Alert, Popconfirm, Tooltip,
} from 'antd';
import { message } from '@/shared/utils/antdStatic';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { useData } from '@/shared/hooks/useData';
import {
  buildBillItems, indexDiscounts, CATEGORY_LABELS,
} from './customerBill/billAggregator';
import {
  applyBulkDiscount, removeDiscount as apiRemoveDiscount,
} from './customerBill/discountApi';

const fmtDate = (d) => d
  ? d.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })
  : '—';

// Inside the customer modal: a unified table of every line item the customer
// owns, sortable + searchable. Multi-select rows + "Apply % to selected"
// pushes a discount onto each selected entity. Per-row "Remove" pulls one.
export default function CustomerDiscountsTab({
  customer,
  bookings = [],
  rentals = [],
  accommodationBookings = [],
  packages = [],
  instructors = [],
  discounts = [],
  onChanged,
  readOnly = false,
}) {
  const { formatCurrency, businessCurrency } = useCurrency();
  const { apiClient } = useData();
  const baseCur = businessCurrency || 'EUR';

  const [selectedKeys, setSelectedKeys] = useState([]);
  const [percent, setPercent] = useState(10);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

  // Fetch the two datasets the parent doesn't load (mirrors CustomerBillModal).
  const [shopOrders, setShopOrders] = useState([]);
  const [memberships, setMemberships] = useState([]);
  useEffect(() => {
    if (!customer?.id) return;
    let cancelled = false;
    Promise.allSettled([
      apiClient.get(`/shop-orders/admin/user/${customer.id}?page=1&limit=200`),
      apiClient.get(`/member-offerings/user/${customer.id}/purchases`),
    ]).then(([shopRes, memberRes]) => {
      if (cancelled) return;
      setShopOrders(shopRes.status === 'fulfilled' ? (shopRes.value?.data?.orders || []) : []);
      setMemberships(memberRes.status === 'fulfilled' && Array.isArray(memberRes.value?.data) ? memberRes.value.data : []);
    });
    return () => { cancelled = true; };
  }, [customer?.id, apiClient]);

  // Reset selection when discounts list changes (after a save).
  useEffect(() => {
    setSelectedKeys([]);
  }, [discounts]);

  const discountsByEntity = useMemo(() => indexDiscounts(discounts), [discounts]);

  const items = useMemo(() => buildBillItems({
    bookings, rentals, accommodationBookings, packages, instructors,
    shopOrders, memberships,
    discountsByEntity,
  }), [bookings, rentals, accommodationBookings, packages, instructors, shopOrders, memberships, discountsByEntity]);

  // Only rows that point at a discountable entity are eligible. Package-funded
  // lessons (status='package') and cancelled rows aren't real charges.
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter(it => it.entityType && it.entityId != null)
      .filter(it => it.status !== 'package' && it.status !== 'cancelled')
      .filter(it => !q
        || (it.description || '').toLowerCase().includes(q)
        || (it.detail || '').toLowerCase().includes(q)
        || (CATEGORY_LABELS[it.category] || '').toLowerCase().includes(q));
  }, [items, search]);

  const selectedRows = useMemo(
    () => rows.filter(r => selectedKeys.includes(r.id)),
    [rows, selectedKeys]
  );

  const selectionTotal = useMemo(() => selectedRows.reduce((s, r) => {
    const orig = Number(r.originalAmount ?? r.amount) || 0;
    return s + orig;
  }, 0), [selectedRows]);

  const previewAfter = useMemo(() => {
    const pct = Number(percent) || 0;
    return selectionTotal * (1 - pct / 100);
  }, [selectionTotal, percent]);

  const handleBulkApply = useCallback(async () => {
    if (!customer?.id || selectedRows.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const itemsPayload = selectedRows.map(r => ({
        entity_type: r.entityType,
        entity_id: r.entityId,
      }));
      const res = await applyBulkDiscount({
        customerId: customer.id,
        percent: Number(percent) || 0,
        items: itemsPayload,
        reason: reason || null,
      });
      const appliedCount = res?.applied?.length ?? 0;
      const skippedCount = res?.skipped?.length ?? 0;
      message.success(`Applied ${Number(percent)}% to ${appliedCount} item${appliedCount === 1 ? '' : 's'}${skippedCount ? ` (${skippedCount} skipped)` : ''}`);
      setSelectedKeys([]);
      await onChanged?.();
    } catch (err) {
      setError(err.message || 'Failed to apply discounts');
    } finally {
      setSubmitting(false);
    }
  }, [customer?.id, selectedRows, percent, reason, onChanged]);

  const handleRemoveOne = useCallback(async (discountId) => {
    if (!discountId) return;
    try {
      await apiRemoveDiscount(discountId);
      message.success('Discount removed');
      await onChanged?.();
    } catch (err) {
      message.error(err.message || 'Failed to remove discount');
    }
  }, [onChanged]);

  const columns = [
    {
      title: 'Date',
      dataIndex: 'date',
      key: 'date',
      width: 110,
      render: (d) => fmtDate(d),
      sorter: (a, b) => (a.date?.getTime() || 0) - (b.date?.getTime() || 0),
      defaultSortOrder: 'descend',
    },
    {
      title: 'Category',
      dataIndex: 'category',
      key: 'category',
      width: 120,
      render: (c) => <Tag>{CATEGORY_LABELS[c] || c}</Tag>,
      filters: Object.entries(CATEGORY_LABELS).map(([value, text]) => ({ value, text })),
      onFilter: (v, r) => r.category === v,
    },
    {
      title: 'Description',
      key: 'description',
      render: (_, r) => (
        <div>
          <div className="font-medium text-slate-700">{r.description}</div>
          {r.detail && <div className="text-[11px] text-slate-400">{r.detail}</div>}
        </div>
      ),
    },
    {
      title: 'Original',
      key: 'original',
      width: 110,
      align: 'right',
      render: (_, r) => (
        <span className="tabular-nums">{formatCurrency(Number(r.originalAmount ?? r.amount) || 0, r.currency || baseCur)}</span>
      ),
      sorter: (a, b) => (a.originalAmount ?? a.amount ?? 0) - (b.originalAmount ?? b.amount ?? 0),
    },
    {
      title: 'Discount',
      key: 'discount',
      width: 130,
      align: 'right',
      render: (_, r) => {
        if (!r.discountAmount) return <span className="text-slate-300 text-xs">—</span>;
        return (
          <Space size={4}>
            <span className="tabular-nums text-rose-600">−{formatCurrency(r.discountAmount, r.currency || baseCur)}</span>
            <Tag color="orange" className="!m-0">{r.discountPercent}%</Tag>
          </Space>
        );
      },
    },
    {
      title: 'Final',
      key: 'final',
      width: 110,
      align: 'right',
      render: (_, r) => (
        <span className={`tabular-nums ${r.discountAmount ? 'font-semibold text-emerald-600' : ''}`}>
          {formatCurrency(Number(r.amount) || 0, r.currency || baseCur)}
        </span>
      ),
    },
    {
      title: '',
      key: 'remove',
      width: 90,
      render: (_, r) => r.discountId
        ? (
          <Popconfirm
            title="Remove this discount?"
            onConfirm={() => handleRemoveOne(r.discountId)}
            okText="Remove"
            cancelText="Cancel"
            disabled={readOnly}
          >
            <Button type="link" size="small" danger disabled={readOnly}>Remove</Button>
          </Popconfirm>
        )
        : null,
    },
  ];

  if (rows.length === 0) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="No discountable items yet — book a lesson, rental, accommodation, or package first."
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Input.Search
          placeholder="Search description, detail, or category"
          allowClear
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 320 }}
        />
        <div className="text-xs text-slate-500">{rows.length} discountable item{rows.length === 1 ? '' : 's'}</div>
      </div>

      {/* Sticky bulk-action bar */}
      {selectedRows.length > 0 && !readOnly && (
        <div className="sticky top-0 z-10 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 shadow-sm">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="text-sm font-semibold text-slate-700">
              {selectedRows.length} item{selectedRows.length === 1 ? '' : 's'} selected
            </div>
            <Tooltip title="Total of original prices for the selection">
              <span className="text-xs text-slate-500">
                Subtotal: <span className="tabular-nums font-medium">{formatCurrency(selectionTotal, baseCur)}</span>
              </span>
            </Tooltip>
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-xs text-slate-500">% off</span>
              <InputNumber
                min={0}
                max={100}
                step={1}
                value={percent}
                onChange={v => setPercent(v ?? 0)}
                addonAfter="%"
                style={{ width: 110 }}
                disabled={submitting}
              />
              <Tooltip title={`Final selection total: ${formatCurrency(previewAfter, baseCur)}`}>
                <span className="text-xs text-emerald-700 font-medium tabular-nums">
                  →&nbsp;{formatCurrency(previewAfter, baseCur)}
                </span>
              </Tooltip>
              <Button
                type="primary"
                onClick={handleBulkApply}
                loading={submitting}
                disabled={submitting || (Number(percent) || 0) <= 0}
              >Apply</Button>
              <Button onClick={() => setSelectedKeys([])} disabled={submitting}>Clear</Button>
            </div>
          </div>
          <div className="mt-2">
            <Input
              placeholder="Reason (optional, applies to all selected)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              disabled={submitting}
              size="small"
            />
          </div>
          {error && <Alert type="error" message={error} className="mt-2" showIcon />}
        </div>
      )}

      <Table
        rowKey="id"
        columns={columns}
        dataSource={rows}
        size="middle"
        pagination={{ pageSize: 15, showSizeChanger: false }}
        rowSelection={readOnly ? undefined : {
          selectedRowKeys: selectedKeys,
          onChange: setSelectedKeys,
          preserveSelectedRowKeys: true,
        }}
        scroll={{ x: 'max-content' }}
      />
    </div>
  );
}
