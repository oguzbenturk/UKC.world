// src/features/dashboard/pages/OrderManagement.jsx
// Admin order management page for shop orders

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Tag, Button, Dropdown, Modal, Input, Select, DatePicker, Avatar
} from 'antd';
import { message } from '@/shared/utils/antdStatic';
import {
  ShoppingCartOutlined,
  EyeOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CarOutlined,
  CloseCircleOutlined,
  SearchOutlined,
  MoreOutlined,
  ExclamationCircleOutlined,
  UserOutlined,
  WarningOutlined,
  ReloadOutlined,
  InboxOutlined,
  FileImageOutlined,
  HistoryOutlined,
  EditOutlined,
  SendOutlined,
  DeleteOutlined
} from '@ant-design/icons';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import ResponsiveTable from '@/components/ui/ResponsiveTableV2';
import apiClient from '@/shared/services/apiClient';
import { realTimeService } from '@/shared/services/realTimeService';
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue';
import { getSubcategories } from '@/shared/constants/productCategories';
import { useProductCategories } from '@/shared/hooks/useProductCategories';
import {
  StatusPill,
  PaymentPill,
  PaymentCell,
  OrderThumb,
  OrdersHeader,
  StatusTabs,
  OrdersEmpty,
  LowStockStrip,
  OrderMobileCard,
} from '../components/orders/OrderManagementUi';
import {
  STATUS_META,
  getPaymentMethodInfo,
  formatOrderDate,
  summarizeOrderItems,
  customerDisplay,
} from '../components/orders/orderPresentation';

const { RangePicker } = DatePicker;
const { TextArea } = Input;

// antd-flavoured status config (colour names + icons) still used by the detail
// modal's history tags and the row action menu. Labels come from STATUS_META.
const statusConfig = {
  pending: { color: 'gold', icon: <ClockCircleOutlined />, label: STATUS_META.pending.label },
  confirmed: { color: 'blue', icon: <CheckCircleOutlined />, label: STATUS_META.confirmed.label },
  processing: { color: 'cyan', icon: <InboxOutlined />, label: STATUS_META.processing.label },
  shipped: { color: 'purple', icon: <CarOutlined />, label: STATUS_META.shipped.label },
  delivered: { color: 'green', icon: <CheckCircleOutlined />, label: STATUS_META.delivered.label },
  cancelled: { color: 'default', icon: <CloseCircleOutlined />, label: STATUS_META.cancelled.label },
  refunded: { color: 'red', icon: <CloseCircleOutlined />, label: STATUS_META.refunded.label }
};

const statusFlow = ['pending', 'confirmed', 'processing', 'shipped', 'delivered'];

// Table skin (same recipe as the Instructors page): quiet uppercase header,
// soft row dividers, hover tint, and padded mobile-card list.
const TABLE_CLASS = [
  '[&_.ant-table]:!bg-transparent',
  '[&_.ant-table-thead>tr>th]:!bg-slate-50/80',
  '[&_.ant-table-thead>tr>th]:!border-b-slate-200/60',
  '[&_.ant-table-thead>tr>th]:!px-4',
  '[&_.ant-table-thead>tr>th]:!py-2.5',
  '[&_.ant-table-thead>tr>th]:!text-[10px]',
  '[&_.ant-table-thead>tr>th]:!font-bold',
  '[&_.ant-table-thead>tr>th]:!uppercase',
  '[&_.ant-table-thead>tr>th]:!tracking-widest',
  '[&_.ant-table-thead>tr>th]:!text-slate-400',
  '[&_.ant-table-thead>tr>th::before]:!hidden',
  '[&_.ant-table-tbody>tr>td]:!border-b-slate-100',
  '[&_.ant-table-tbody>tr>td]:!px-4',
  '[&_.ant-table-tbody>tr>td]:!py-2.5',
  '[&_.ant-table-tbody>tr:hover>td]:!bg-sky-50/40',
  '[&_.ant-table-tbody>tr:last-child>td]:!border-b-0',
  '[&_.ant-table-placeholder>td]:!py-0',
  '[&_.ant-pagination]:!my-3',
  '[&_.ant-pagination]:!px-4',
  '[&_.responsive-table-container>.space-y-3]:p-3',
  '[&_.responsive-table-container>.space-y-3]:bg-slate-50/60',
].join(' ');

const OrderManagement = ({ embedded = false }) => {
  const { formatCurrency } = useCurrency();
  const location = useLocation();

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [lowStockProducts, setLowStockProducts] = useState([]);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });
  const [filters, setFilters] = useState({
    status: 'all',
    payment_status: 'all',
    category: 'all',
    subcategory: 'all',
    search: '',
    date_from: null,
    date_to: null
  });

  // Local search box value — typed immediately, debounced into `filters.search`
  // so we don't fire an API request on every keystroke.
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebouncedValue(searchInput, 350);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [statusForm, setStatusForm] = useState({ status: '', notes: '' });
  const [updating, setUpdating] = useState(false);
  const [editingStatus, setEditingStatus] = useState(false);
  // ResponsiveTable hands us its "View: Auto/Table/Cards" control so it can sit in the filter bar.
  const [viewToggle, setViewToggle] = useState(null);
  const [dateRange, setDateRange] = useState(null);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: pagination.current,
        limit: pagination.pageSize,
        sort_by: 'created_at',
        sort_order: 'DESC'
      });

      if (filters.status !== 'all') params.append('status', filters.status);
      if (filters.payment_status !== 'all') params.append('payment_status', filters.payment_status);
      if (filters.category !== 'all') params.append('category', filters.category);
      if (filters.subcategory !== 'all') params.append('subcategory', filters.subcategory);
      if (filters.search) params.append('search', filters.search);
      if (filters.date_from) params.append('date_from', filters.date_from);
      if (filters.date_to) params.append('date_to', filters.date_to);

      const response = await apiClient.get(`/shop-orders/admin/all?${params}`);
      setOrders(response.data.orders || []);
      setPagination(prev => ({ ...prev, total: response.data.total }));
      if (response.data.stats) setStats(response.data.stats);
    } catch (error) {
      console.error('Error fetching orders:', error);
      message.error('Failed to fetch orders');
    } finally {
      setLoading(false);
    }
  }, [pagination.current, pagination.pageSize, filters]);

  const fetchLowStock = async () => {
    try {
      const response = await apiClient.get('/shop-orders/admin/low-stock');
      setLowStockProducts(response.data.products || []);
    } catch (error) {
      console.error('Error fetching low stock:', error);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Commit the debounced search term into filters (auto-searches once the user
  // stops typing) and jump back to the first page.
  useEffect(() => {
    setFilters((f) => (f.search === debouncedSearch ? f : { ...f, search: debouncedSearch }));
    setPagination((p) => (p.current === 1 ? p : { ...p, current: 1 }));
  }, [debouncedSearch]);

  // Category filter options — built-in + custom, merged from the DB.
  const { options: mergedCategories } = useProductCategories();

  // Subcategory options for the currently selected category (children indented).
  const subcategoryOptions = useMemo(() => {
    if (!filters.category || filters.category === 'all') return [];
    return getSubcategories(filters.category).map((sub) => ({
      value: sub.value,
      label: sub.parent ? `   ↳ ${sub.label}` : sub.label,
    }));
  }, [filters.category]);

  useEffect(() => {
    fetchLowStock();
  }, []);

  useEffect(() => {
    const handleOrderChange = () => {
      fetchOrders();
      fetchLowStock();
    };
    realTimeService.on('shop:newOrder', handleOrderChange);
    realTimeService.on('shop:orderStatusChanged', handleOrderChange);
    realTimeService.on('shop:orderDeleted', handleOrderChange);
    realTimeService.on('shop:lowStock', fetchLowStock);
    return () => {
      realTimeService.off('shop:newOrder', handleOrderChange);
      realTimeService.off('shop:orderStatusChanged', handleOrderChange);
      realTimeService.off('shop:orderDeleted', handleOrderChange);
      realTimeService.off('shop:lowStock', fetchLowStock);
    };
  }, [fetchOrders]);

  const handleViewOrder = async (order) => {
    try {
      const response = await apiClient.get(`/shop-orders/${order.id}`);
      setSelectedOrder(response.data);
      setStatusForm({ status: response.data.status, notes: '' });
      setEditingStatus(false);
      setDetailModalVisible(true);
    } catch (_error) {
      message.error('Failed to load order details');
    }
  };

  const handleViewOrderById = useCallback(async (orderId) => {
    try {
      const response = await apiClient.get(`/shop-orders/${orderId}`);
      setSelectedOrder(response.data);
      setStatusForm({ status: response.data.status, notes: '' });
      setEditingStatus(false);
      setDetailModalVisible(true);
    } catch (_error) {
      message.error('Failed to load order details');
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const orderId = params.get('orderId');
    if (orderId) {
      handleViewOrderById(orderId);
    }
  }, [location.search, handleViewOrderById]);

  const handleUpdateStatus = async () => {
    if (!selectedOrder || !statusForm.status) return;

    setUpdating(true);
    try {
      await apiClient.patch(`/shop-orders/${selectedOrder.id}/status`, {
        status: statusForm.status,
        admin_notes: statusForm.notes
      });

      message.success(`Order status updated to ${statusConfig[statusForm.status]?.label || statusForm.status}`);
      setEditingStatus(false);
      // Refresh the order detail in-place
      const response = await apiClient.get(`/shop-orders/${selectedOrder.id}`);
      setSelectedOrder(response.data);
      setStatusForm({ status: response.data.status, notes: '' });
      fetchOrders();
      fetchLowStock();
    } catch (error) {
      message.error(error.response?.data?.error || 'Failed to update order status');
    } finally {
      setUpdating(false);
    }
  };

  const columns = [
    {
      title: 'Order',
      key: 'order',
      width: 260,
      render: (_, record) => {
        // The list endpoint already ships the order's line items, so the row can
        // lead with what was bought (thumbnail + product name) and demote the
        // order number to a secondary line.
        const { primaryName, extraCount, thumbnail } = summarizeOrderItems(record);
        return (
          <div className="flex items-center gap-3">
            <OrderThumb src={thumbnail} name={primaryName} />
            <div className="min-w-0">
              <p className="m-0 truncate text-[13px] font-semibold leading-tight text-slate-900">
                {primaryName}
                {extraCount > 0 && (
                  <span className="ml-1 font-normal text-slate-400">+{extraCount} more</span>
                )}
              </p>
              <p className="m-0 mt-0.5 text-[11px] leading-tight text-slate-400">
                <span className="font-medium tabular-nums text-slate-500">{record.order_number}</span>
                {' · '}
                {formatOrderDate(record.created_at)}
              </p>
            </div>
          </div>
        );
      }
    },
    {
      title: 'Customer',
      key: 'customer',
      width: 180,
      render: (_, record) => {
        const { name, phone } = customerDisplay(record);
        return (
          <div className="min-w-0">
            <p className="m-0 truncate text-[13px] font-medium leading-tight text-slate-800">{name}</p>
            <p className="m-0 mt-0.5 text-[11px] leading-tight tabular-nums text-slate-400">{phone}</p>
          </div>
        );
      }
    },
    {
      title: 'Total',
      dataIndex: 'total_amount',
      key: 'total',
      align: 'right',
      width: 110,
      render: (amount, record) => (
        <span className="text-[13px] font-bold tabular-nums text-slate-900">
          {formatCurrency(amount, record.currency || 'EUR')}
        </span>
      )
    },
    {
      title: 'Payment',
      key: 'payment',
      width: 150,
      render: (_, record) => <PaymentCell order={record} formatCurrency={formatCurrency} />
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status) => <StatusPill status={status} />
    },
    {
      title: '',
      key: 'actions',
      align: 'center',
      width: 48,
      render: (_, record) => (
        // Keep the menu click from reaching the row, which would also open the details modal.
        <div onClick={(e) => e.stopPropagation()}>
          <Dropdown
            menu={{
              items: [
                { key: 'view', label: 'View Details', icon: <EyeOutlined /> },
                { type: 'divider' },
                { key: 'confirm', label: 'Mark Confirmed', icon: <CheckCircleOutlined />, disabled: record.status !== 'pending' },
                { key: 'processing', label: 'Mark Processing', icon: <InboxOutlined />, disabled: !['pending', 'confirmed'].includes(record.status) },
                { key: 'shipped', label: 'Mark Shipped', icon: <CarOutlined />, disabled: !['confirmed', 'processing'].includes(record.status) },
                { key: 'delivered', label: 'Mark Delivered', icon: <CheckCircleOutlined />, disabled: record.status !== 'shipped' },
                { type: 'divider' },
                { key: 'cancel', label: 'Cancel Order', icon: <CloseCircleOutlined />, danger: true, disabled: ['delivered', 'cancelled', 'refunded'].includes(record.status) },
                { key: 'delete', label: 'Delete Order', icon: <DeleteOutlined />, danger: true }
              ],
              onClick: async ({ key, domEvent }) => {
                domEvent?.stopPropagation?.();
                if (key === 'view') {
                  handleViewOrder(record);
                } else if (key === 'cancel') {
                  Modal.confirm({
                    title: 'Cancel Order?',
                    icon: <ExclamationCircleOutlined />,
                    content: 'This will restore stock and refund the customer if payment was made. Continue?',
                    onOk: async () => {
                      try {
                        await apiClient.patch(`/shop-orders/${record.id}/status`, { status: 'cancelled', admin_notes: 'Cancelled by admin' });
                        message.success('Order cancelled');
                        fetchOrders();
                        fetchLowStock();
                      } catch (err) {
                        message.error(err.response?.data?.error || 'Failed to cancel order');
                      }
                    }
                  });
                } else if (key === 'delete') {
                  const stockWillRestore = !['cancelled', 'refunded'].includes(record.status);
                  Modal.confirm({
                    title: `Delete order ${record.order_number}?`,
                    icon: <ExclamationCircleOutlined />,
                    okText: 'Delete',
                    okButtonProps: { danger: true },
                    content: stockWillRestore
                      ? 'This permanently removes the order and its items, status history, and messages. Stock will be restored. This cannot be undone.'
                      : 'This permanently removes the order and its items, status history, and messages. This cannot be undone.',
                    onOk: async () => {
                      try {
                        await apiClient.delete(`/shop-orders/${record.id}`);
                        message.success('Order deleted');
                        fetchOrders();
                        fetchLowStock();
                      } catch (err) {
                        message.error(err.response?.data?.error || 'Failed to delete order');
                      }
                    }
                  });
                } else {
                  try {
                    await apiClient.patch(`/shop-orders/${record.id}/status`, { status: key });
                    message.success(`Order marked as ${statusConfig[key]?.label || key}`);
                    fetchOrders();
                  } catch (err) {
                    message.error(err.response?.data?.error || 'Failed to update status');
                  }
                }
              }
            }}
            trigger={['click']}
          >
            <Button
              type="text"
              size="small"
              icon={<MoreOutlined />}
              aria-label="Order actions"
              className="!text-slate-400 hover:!bg-slate-100 hover:!text-slate-800"
            />
          </Dropdown>
        </div>
      )
    }
  ];

  const filtersActive = Boolean(
    searchInput ||
    filters.category !== 'all' ||
    filters.payment_status !== 'all' ||
    filters.date_from ||
    filters.date_to
  );

  const setStatus = (key) => {
    setFilters((f) => ({ ...f, status: key }));
    setPagination((p) => ({ ...p, current: 1 }));
  };

  const clearFilters = () => {
    setSearchInput('');
    setDateRange(null);
    setFilters((f) => ({
      ...f,
      category: 'all',
      subcategory: 'all',
      payment_status: 'all',
      search: '',
      date_from: null,
      date_to: null,
    }));
    setPagination((p) => ({ ...p, current: 1 }));
  };

  const refreshAll = () => {
    fetchOrders();
    fetchLowStock();
  };

  return (
    <div className={embedded ? 'p-4' : 'mx-auto max-w-[1400px] p-4 sm:p-6'}>
      {!embedded && (
        <OrdersHeader
          stats={stats}
          revenueLabel={formatCurrency(stats?.total_revenue || 0, 'EUR')}
          lowStockCount={lowStockProducts.length}
          activeStatus={filters.status}
          onStatus={setStatus}
          onRefresh={refreshAll}
          loading={loading}
        />
      )}

      {!embedded && <LowStockStrip products={lowStockProducts} />}

      {/* Orders card */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm">
        {/* Status rail */}
        <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <StatusTabs value={filters.status} stats={stats} onChange={setStatus} />
          {embedded && (
            <Button
              type="text"
              size="small"
              icon={<ReloadOutlined spin={loading} />}
              onClick={refreshAll}
              className="!text-slate-500 hover:!text-slate-800"
            >
              Refresh
            </Button>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-2.5">
          <Input
            placeholder="Search order #, customer, email…"
            prefix={<SearchOutlined className="text-slate-400" />}
            className="w-full !rounded-lg sm:w-64"
            allowClear
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <Select
            placeholder="Product Type"
            className="w-44"
            showSearch
            optionFilterProp="label"
            value={filters.category}
            onChange={(value) => {
              setFilters(f => ({ ...f, category: value, subcategory: 'all' }));
              setPagination(p => ({ ...p, current: 1 }));
            }}
            options={[
              { value: 'all', label: 'All Categories' },
              ...mergedCategories.map((c) => ({ value: c.value, label: `${c.icon || ''} ${c.label}`.trim() })),
            ]}
          />
          {subcategoryOptions.length > 0 && (
            <Select
              placeholder="Type"
              className="w-44"
              showSearch
              optionFilterProp="label"
              value={filters.subcategory}
              onChange={(value) => {
                setFilters(f => ({ ...f, subcategory: value }));
                setPagination(p => ({ ...p, current: 1 }));
              }}
              options={[
                { value: 'all', label: 'All Types' },
                ...subcategoryOptions,
              ]}
            />
          )}
          <Select
            placeholder="Payment Status"
            className="w-36"
            value={filters.payment_status}
            onChange={(value) => {
              setFilters(f => ({ ...f, payment_status: value }));
              setPagination(p => ({ ...p, current: 1 }));
            }}
            options={[
              { value: 'all', label: 'All Payments' },
              { value: 'pending', label: 'Pending' },
              { value: 'completed', label: 'Completed' },
              { value: 'failed', label: 'Failed' },
              { value: 'refunded', label: 'Refunded' }
            ]}
          />
          <RangePicker
            value={dateRange}
            className="!rounded-lg"
            onChange={(dates) => {
              setDateRange(dates);
              setFilters(f => ({
                ...f,
                date_from: dates?.[0]?.format('YYYY-MM-DD') || null,
                date_to: dates?.[1]?.format('YYYY-MM-DD') || null
              }));
              setPagination(p => ({ ...p, current: 1 }));
            }}
          />
          {filtersActive && (
            <Button type="text" size="small" onClick={clearFilters} className="!text-slate-500 hover:!text-slate-800">
              Clear
            </Button>
          )}
          <div className="ml-auto">{viewToggle}</div>
        </div>

        {/* Orders table / cards */}
        <div className={TABLE_CLASS}>
          <ResponsiveTable
            columns={columns}
            dataSource={orders}
            rowKey="id"
            loading={loading}
            size="small"
            hideViewToggle
            onViewToggleReady={setViewToggle}
            onRow={(record) => ({
              onClick: () => handleViewOrder(record),
              style: { cursor: 'pointer' },
            })}
            pagination={{
              ...pagination,
              onChange: (page, pageSize) => setPagination({ ...pagination, current: page, pageSize }),
              showSizeChanger: true,
              showTotal: (total) => `${total.toLocaleString()} orders`
            }}
            locale={{
              emptyText: <OrdersEmpty filtered={filtersActive || filters.status !== 'all'} />
            }}
            mobileCardRenderer={(props) => (
              <OrderMobileCard
                {...props}
                formatCurrency={formatCurrency}
                onAction={(action, record) => handleViewOrder(record)}
              />
            )}
          />
        </div>
      </div>

      {/* Order Detail Modal */}
      <Modal
        open={detailModalVisible}
        onCancel={() => { setDetailModalVisible(false); setEditingStatus(false); }}
        footer={null}
        width={620}
        centered
        styles={{ body: { padding: 0 }, header: { display: 'none' } }}
        closable={false}
      >
        {selectedOrder && (() => {
          const addr = selectedOrder.shipping_address;
          const parsedAddr = typeof addr === 'string' ? (() => { try { return JSON.parse(addr); } catch { return null; } })() : addr;
          const pmInfo = getPaymentMethodInfo(selectedOrder.payment_method);
          const currentIdx = statusFlow.indexOf(selectedOrder.status);
          const isFinalState = ['delivered', 'cancelled', 'refunded'].includes(selectedOrder.status);

          return (
          <div className="max-h-[85vh] overflow-y-auto">
            {/* ── Header ─────────────────────────────────────────────── */}
            <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-sky-50 flex items-center justify-center">
                  <ShoppingCartOutlined className="text-sky-500 text-base" />
                </div>
                <div>
                  <div className="text-[15px] font-bold text-slate-900 leading-tight">{selectedOrder.order_number}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {new Date(selectedOrder.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {' · '}
                    {new Date(selectedOrder.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
              <button onClick={() => { setDetailModalVisible(false); setEditingStatus(false); }} className="w-8 h-8 rounded-lg hover:bg-slate-50 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors">
                <CloseCircleOutlined className="text-lg" />
              </button>
            </div>

            {/* ── Status pipeline ─────────────────────────────────────── */}
            <div className="px-6 py-3 bg-slate-50/60 border-b border-slate-100">
              <div className="flex items-center justify-between">
                {statusFlow.map((step, i) => {
                  const isActive = step === selectedOrder.status;
                  const isPast = currentIdx >= 0 && i < currentIdx;
                  const config = statusConfig[step];
                  return (
                    <div key={step} className="flex items-center flex-1">
                      <div className="flex flex-col items-center flex-1">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-all ${
                          isActive ? 'bg-sky-500 text-white shadow-sm shadow-sky-200' :
                          isPast ? 'bg-emerald-500 text-white' :
                          'bg-slate-200 text-slate-400'
                        }`}>
                          {isPast ? <CheckCircleOutlined /> : i + 1}
                        </div>
                        <span className={`text-[10px] mt-1 font-medium ${
                          isActive ? 'text-sky-600' : isPast ? 'text-emerald-600' : 'text-slate-400'
                        }`}>{config.label}</span>
                      </div>
                      {i < statusFlow.length - 1 && (
                        <div className={`h-0.5 flex-1 -mt-4 mx-1 rounded ${
                          isPast ? 'bg-emerald-400' : 'bg-slate-200'
                        }`} />
                      )}
                    </div>
                  );
                })}
              </div>
              {selectedOrder.status === 'cancelled' && (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-red-500 font-medium">
                  <CloseCircleOutlined /> Order was cancelled
                </div>
              )}
              {selectedOrder.status === 'refunded' && (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-red-500 font-medium">
                  <CloseCircleOutlined /> Order was refunded
                </div>
              )}
            </div>

            <div className="px-6 py-5 space-y-5">

              {/* ── Customer + Payment cards ──────────────────────────── */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-slate-100 bg-white p-3.5">
                  <div className="flex items-center gap-2 mb-2.5">
                    <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center">
                      <UserOutlined className="text-slate-400 text-[11px]" />
                    </div>
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Customer</span>
                  </div>
                  <p className="text-[13px] font-semibold text-slate-900 leading-tight">{selectedOrder.first_name} {selectedOrder.last_name}</p>
                  <p className="text-[11px] text-slate-500 mt-1 truncate">{selectedOrder.email}</p>
                  {selectedOrder.phone && <p className="text-[11px] text-slate-500 mt-0.5">{selectedOrder.phone}</p>}
                </div>

                <div className="rounded-xl border border-slate-100 bg-white p-3.5">
                  <div className="flex items-center gap-2 mb-2.5">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: `${pmInfo.color}14` }}>
                      <span className="text-[11px]" style={{ color: pmInfo.color }}><pmInfo.Icon /></span>
                    </div>
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Payment</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold text-slate-900">{pmInfo.label}</span>
                    <PaymentPill order={selectedOrder} />
                  </div>
                  {selectedOrder.deposit_amount > 0 && (
                    <p className="text-[11px] text-amber-600 mt-1 font-medium">
                      Deposit: {formatCurrency(selectedOrder.deposit_amount, selectedOrder.currency || 'EUR')}
                    </p>
                  )}
                  {/* Bank transfer receipt */}
                  {selectedOrder.receipt && (
                    <a
                      href={selectedOrder.receipt.receipt_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 mt-2 text-[11px] font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
                    >
                      <FileImageOutlined /> View receipt
                    </a>
                  )}
                </div>
              </div>

              {/* ── Shipping address ──────────────────────────────────── */}
              {parsedAddr && (
                <div className="rounded-xl border border-slate-100 bg-white p-3.5">
                  <div className="flex items-center gap-2 mb-1.5">
                    <CarOutlined className="text-slate-400 text-xs" />
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Shipping Address</span>
                  </div>
                  <p className="text-[12px] text-slate-700 leading-relaxed">
                    {[parsedAddr.street || parsedAddr.line1, parsedAddr.city, parsedAddr.state, parsedAddr.zip || parsedAddr.postal_code, parsedAddr.country].filter(Boolean).join(', ') || String(addr)}
                  </p>
                </div>
              )}

              {/* ── Items ────────────────────────────────────────────── */}
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2">
                    <InboxOutlined className="text-slate-400 text-xs" />
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                      Items ({(selectedOrder.items || []).reduce((s, i) => s + (i.quantity || 1), 0)})
                    </span>
                  </div>
                  <span className="text-[15px] font-bold text-slate-900">
                    {formatCurrency(selectedOrder.total_amount, selectedOrder.currency || 'EUR')}
                  </span>
                </div>
                <div className="space-y-2">
                  {(selectedOrder.items || []).map((item, idx) => (
                    <div key={item.id || idx} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white px-3.5 py-2.5 hover:border-slate-200 transition-colors">
                      {item.product_image ? (
                        <Avatar src={item.product_image} shape="square" size={40} className="!rounded-lg shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
                          <ShoppingCartOutlined className="text-slate-300 text-sm" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-slate-900 truncate leading-tight">{item.product_name}</p>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <span className="text-[11px] text-slate-500">{item.quantity} × {formatCurrency(item.unit_price, selectedOrder.currency || 'EUR')}</span>
                          {item.selected_size && (
                            <span className="text-[10px] bg-slate-100 rounded-md px-1.5 py-0.5 text-slate-600 font-medium">{item.selected_size}</span>
                          )}
                          {item.selected_color && (
                            <span className="text-[10px] bg-slate-100 rounded-md px-1.5 py-0.5 text-slate-600 font-medium">{item.selected_color}</span>
                          )}
                        </div>
                      </div>
                      <p className="text-[13px] font-bold text-slate-900 shrink-0">
                        {formatCurrency(item.total_price, selectedOrder.currency || 'EUR')}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Admin notes (if any) ──────────────────────────────── */}
              {selectedOrder.admin_notes && (
                <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-3.5">
                  <div className="flex items-center gap-2 mb-1">
                    <WarningOutlined className="text-amber-500 text-xs" />
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-amber-600">Admin Notes</span>
                  </div>
                  <p className="text-[12px] text-amber-800">{selectedOrder.admin_notes}</p>
                </div>
              )}

              {/* ── Status history ────────────────────────────────────── */}
              {selectedOrder.status_history?.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <HistoryOutlined className="text-slate-400 text-xs" />
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Activity</span>
                  </div>
                  <div className="space-y-0">
                    {selectedOrder.status_history.slice(0, 5).map((h, i) => (
                      <div key={h.id || i} className="flex items-start gap-3 py-1.5">
                        <div className="flex flex-col items-center mt-0.5">
                          <div className={`w-2 h-2 rounded-full ${i === 0 ? 'bg-sky-400' : 'bg-slate-200'}`} />
                          {i < Math.min(selectedOrder.status_history.length - 1, 4) && (
                            <div className="w-px h-5 bg-slate-200 mt-0.5" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0 -mt-0.5">
                          <div className="flex items-center gap-2">
                            <Tag
                              color={statusConfig[h.new_status]?.color || 'default'}
                              className="!text-[10px] !rounded-full !border-0 !m-0 !px-2 !py-0 !leading-[18px]"
                            >
                              {statusConfig[h.new_status]?.label || h.new_status}
                            </Tag>
                            <span className="text-[10px] text-slate-400">
                              {new Date(h.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                              {' '}
                              {new Date(h.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          {h.notes && <p className="text-[11px] text-slate-500 mt-0.5 truncate">{h.notes}</p>}
                          {h.first_name && <p className="text-[10px] text-slate-400 mt-0.5">by {h.first_name} {h.last_name}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Inline status update ──────────────────────────────── */}
              {!isFinalState && (
                <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3.5">
                  {!editingStatus ? (
                    <button
                      onClick={() => { setEditingStatus(true); setStatusForm({ status: selectedOrder.status, notes: '' }); }}
                      className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-dashed border-slate-300 text-slate-500 hover:border-sky-400 hover:text-sky-600 hover:bg-sky-50/50 transition-all text-[13px] font-medium"
                    >
                      <EditOutlined className="text-xs" /> Update Status
                    </button>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 mb-1">
                        <EditOutlined className="text-sky-500 text-xs" />
                        <span className="text-[10px] font-semibold uppercase tracking-widest text-sky-600">Update Status</span>
                      </div>
                      <Select
                        value={statusForm.status}
                        onChange={(value) => setStatusForm(f => ({ ...f, status: value }))}
                        className="w-full"
                        size="small"
                        options={[
                          { value: 'pending', label: 'Pending' },
                          { value: 'confirmed', label: 'Confirmed' },
                          { value: 'processing', label: 'Processing' },
                          { value: 'shipped', label: 'Shipped' },
                          { value: 'delivered', label: 'Delivered' },
                          { value: 'cancelled', label: 'Cancelled', className: 'text-red-500' },
                          { value: 'refunded', label: 'Refunded', className: 'text-red-500' }
                        ]}
                      />
                      <TextArea
                        value={statusForm.notes}
                        onChange={(e) => setStatusForm(f => ({ ...f, notes: e.target.value }))}
                        rows={2}
                        placeholder="Add a note (optional)..."
                        className="!text-[13px] !rounded-lg"
                        size="small"
                      />
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="small"
                          onClick={() => setEditingStatus(false)}
                          className="!text-[12px] !rounded-lg"
                        >
                          Cancel
                        </Button>
                        <Button
                          size="small"
                          type="primary"
                          loading={updating}
                          disabled={statusForm.status === selectedOrder.status}
                          onClick={handleUpdateStatus}
                          icon={<SendOutlined className="text-[10px]" />}
                          className="!text-[12px] !rounded-lg"
                        >
                          Save
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          );
        })()}
      </Modal>
    </div>
  );
};

export default OrderManagement;
