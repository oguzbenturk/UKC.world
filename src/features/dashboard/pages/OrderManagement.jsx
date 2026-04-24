// src/features/dashboard/pages/OrderManagement.jsx
// Admin order management page for shop orders

import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Card, Tag, Button, Space, Typography, Tabs,
  Badge, Dropdown, Modal, Input, Select, DatePicker,
  Statistic, Row, Col, Avatar, Alert,
  Empty
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
  DollarOutlined,
  InboxOutlined,
  BankOutlined,
  CreditCardOutlined,
  WalletOutlined,
  SafetyCertificateOutlined,
  FileImageOutlined,
  HistoryOutlined,
  EditOutlined,
  SendOutlined,
  DeleteOutlined
} from '@ant-design/icons';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { UnifiedResponsiveTable } from '@/components/ui/ResponsiveTableV2';
import apiClient from '@/shared/services/apiClient';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const { TextArea } = Input;

const OrderMobileCard = ({ record, onAction }) => (
    <Card size="small" className="mb-2">
      <div className="flex justify-between items-start mb-2">
         <Space>
           <Avatar icon={<UserOutlined />} size="small" /> 
           <div>
              <div className="font-medium">{record.order_number}</div>
              <div className="text-xs text-gray-500">{record.first_name} {record.last_name}</div>
           </div>
         </Space>
         <Tag color={statusConfig[record.status]?.color || 'default'}>
            {statusConfig[record.status]?.label || record.status}
         </Tag>
      </div>
      <div className="flex justify-between items-center mt-3">
         <div>
            <div className="text-xs text-gray-500">{new Date(record.created_at).toLocaleDateString()}</div>
             <Tag className="mt-1" color={record.payment_status === 'completed' ? 'green' : 'gold'}>
                {record.payment_status}
             </Tag>
         </div>
         <div className="text-right">
             <div className="text-lg font-semibold text-blue-600">
                €{Number(record.total_amount).toFixed(2)}
             </div>
             <Button size="small" type="link" onClick={() => onAction('view', record)}>
                View Details
             </Button>
         </div>
      </div>
    </Card>
);

const statusConfig = {
  pending: { color: 'gold', icon: <ClockCircleOutlined />, label: 'Pending' },
  confirmed: { color: 'blue', icon: <CheckCircleOutlined />, label: 'Confirmed' },
  processing: { color: 'cyan', icon: <InboxOutlined />, label: 'Processing' },
  shipped: { color: 'purple', icon: <CarOutlined />, label: 'Shipped' },
  delivered: { color: 'green', icon: <CheckCircleOutlined />, label: 'Delivered' },
  cancelled: { color: 'default', icon: <CloseCircleOutlined />, label: 'Cancelled' },
  refunded: { color: 'red', icon: <CloseCircleOutlined />, label: 'Refunded' }
};

const paymentMethodConfig = {
  wallet: { icon: <WalletOutlined />, label: 'Wallet', color: '#16a34a' },
  credit_card: { icon: <CreditCardOutlined />, label: 'Credit Card', color: '#0ea5e9' },
  bank_transfer: { icon: <BankOutlined />, label: 'Bank Transfer', color: '#6366f1' },
  deposit: { icon: <SafetyCertificateOutlined />, label: 'Deposit', color: '#d97706' },
  wallet_hybrid: { icon: <WalletOutlined />, label: 'Wallet + Card', color: '#0d9488' },
  cash: { icon: <DollarOutlined />, label: 'Cash', color: '#78716c' },
};

const getPaymentMethodInfo = (method) =>
  paymentMethodConfig[method] || { icon: <DollarOutlined />, label: method?.replace(/_/g, ' ')?.replace(/\b\w/g, c => c.toUpperCase()) || 'Unknown', color: '#94a3b8' };

const statusFlow = ['pending', 'confirmed', 'processing', 'shipped', 'delivered'];

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
    search: '',
    date_from: null,
    date_to: null
  });
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [statusForm, setStatusForm] = useState({ status: '', notes: '' });
  const [updating, setUpdating] = useState(false);
  const [editingStatus, setEditingStatus] = useState(false);

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

  useEffect(() => {
    fetchLowStock();
  }, []);

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
      dataIndex: 'order_number',
      key: 'order_number',
      width: 130,
      render: (text, record) => (
        <div>
          <Text strong style={{ fontSize: 13 }}>{text}</Text>
          <div style={{ fontSize: 11, color: '#999' }}>
            {new Date(record.created_at).toLocaleDateString()}
          </div>
        </div>
      )
    },
    {
      title: 'Customer',
      key: 'customer',
      width: 120,
      ellipsis: true,
      render: (_, record) => (
        <Text style={{ fontSize: 13 }}>
          {record.first_name} {record.last_name?.[0] ? record.last_name[0] + '.' : ''}
        </Text>
      )
    },
    {
      title: 'Items',
      dataIndex: 'item_count',
      key: 'items',
      align: 'center',
      width: 60,
      render: (count) => <Tag>{count}</Tag>
    },
    {
      title: 'Total',
      dataIndex: 'total_amount',
      key: 'total',
      width: 90,
      render: (amount, record) => (
        <Text strong style={{ color: '#1890ff', fontSize: 13 }}>
          {formatCurrency(amount, record.currency || 'EUR')}
        </Text>
      )
    },
    {
      title: 'Payment',
      dataIndex: 'payment_status',
      key: 'payment_status',
      width: 90,
      render: (status) => (
        <Tag color={status === 'completed' ? 'green' : status === 'pending' ? 'gold' : 'red'} style={{ fontSize: 11 }}>
          {status.charAt(0).toUpperCase() + status.slice(1)}
        </Tag>
      )
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status) => {
        const config = statusConfig[status] || { color: 'default', label: status };
        return <Tag color={config.color} style={{ fontSize: 11 }}>{config.label}</Tag>;
      }
    },
    {
      title: '',
      key: 'actions',
      align: 'center',
      width: 40,
      render: (_, record) => (
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
          <Button type="text" icon={<MoreOutlined />} />
        </Dropdown>
      )
    }
  ];

  const tabItems = [
    { key: 'all', label: <span>All Orders <Badge count={stats?.total_orders || 0} showZero style={{ marginLeft: 8 }} /></span> },
    { key: 'pending', label: <span>Pending <Badge count={stats?.pending_count || 0} showZero style={{ marginLeft: 8, backgroundColor: '#faad14' }} /></span> },
    { key: 'confirmed', label: <span>Confirmed <Badge count={stats?.confirmed_count || 0} showZero style={{ marginLeft: 8, backgroundColor: '#1890ff' }} /></span> },
    { key: 'processing', label: <span>Processing <Badge count={stats?.processing_count || 0} showZero style={{ marginLeft: 8, backgroundColor: '#13c2c2' }} /></span> },
    { key: 'shipped', label: <span>Shipped <Badge count={stats?.shipped_count || 0} showZero style={{ marginLeft: 8, backgroundColor: '#722ed1' }} /></span> },
    { key: 'delivered', label: <span>Delivered <Badge count={stats?.delivered_count || 0} showZero style={{ marginLeft: 8, backgroundColor: '#52c41a' }} /></span> }
  ];

  return (
    <div style={{ padding: embedded ? 0 : 24 }}>
      {/* Header */}
      {!embedded ? (
        <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <Title level={3} style={{ margin: 0 }}>
              <ShoppingCartOutlined style={{ marginRight: 12 }} />
              Order Management
            </Title>
            <Text type="secondary">Manage shop orders, track status, and handle fulfillment</Text>
          </div>
          <Button icon={<ReloadOutlined />} onClick={fetchOrders}>
            Refresh
          </Button>
        </div>
      ) : (
        <div className="flex justify-end mb-3">
          <Button icon={<ReloadOutlined />} size="small" onClick={fetchOrders}>Refresh</Button>
        </div>
      )}

      {/* Stats Row */}
      {!embedded && (
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="Total Revenue"
              value={stats?.total_revenue || 0}
              prefix={<DollarOutlined />}
              formatter={(val) => formatCurrency(val, 'EUR')}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="Pending Orders"
              value={stats?.pending_count || 0}
              prefix={<ClockCircleOutlined />}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="Low Stock Items"
              value={lowStockProducts.length}
              prefix={<WarningOutlined />}
              valueStyle={{ color: lowStockProducts.length > 0 ? '#ff4d4f' : '#52c41a' }}
            />
          </Card>
        </Col>
      </Row>
      )}

      {/* Low Stock Alert */}
      {!embedded && lowStockProducts.length > 0 && (
        <div className="mb-4 sm:mb-6">
          <Alert
            message={<span className="text-sm sm:text-base font-medium">Low Stock Warning</span>}
            description={
              <div className="mt-2">
                <div className="flex flex-wrap gap-1.5 sm:gap-2">
                  {lowStockProducts.slice(0, 5).map(p => (
                    <Tag 
                      key={p.id} 
                      color="red" 
                      className="!text-xs !py-0.5 !px-2 !mb-0"
                      style={{ fontSize: '11px', lineHeight: '18px' }}
                    >
                      <span className="truncate inline-block max-w-[200px] sm:max-w-none">
                        {p.name}: {p.stock_quantity} left
                      </span>
                    </Tag>
                  ))}
                  {lowStockProducts.length > 5 && (
                    <Tag 
                      className="!text-xs !py-0.5 !px-2"
                      style={{ fontSize: '11px', lineHeight: '18px' }}
                    >
                      +{lowStockProducts.length - 5} more
                    </Tag>
                  )}
                </div>
              </div>
            }
            type="warning"
            showIcon
            icon={<WarningOutlined className="!text-base sm:!text-lg" />}
            className="!p-3 sm:!p-4"
          />
        </div>
      )}

      {/* Main Card */}
      <Card>
        {/* Filters */}
        <div className="mb-4 flex flex-wrap gap-2">
          <Input
            placeholder="Search order #, customer..."
            prefix={<SearchOutlined className="text-slate-400" />}
            className="w-56"
            size="small"
            value={filters.search}
            onChange={(e) => setFilters(f => ({ ...f, search: e.target.value }))}
            onPressEnter={() => fetchOrders()}
          />
          <Select
            placeholder="Payment Status"
            className="w-36"
            size="small"
            value={filters.payment_status}
            onChange={(value) => setFilters(f => ({ ...f, payment_status: value }))}
            options={[
              { value: 'all', label: 'All Payments' },
              { value: 'pending', label: 'Pending' },
              { value: 'completed', label: 'Completed' },
              { value: 'failed', label: 'Failed' },
              { value: 'refunded', label: 'Refunded' }
            ]}
          />
          <RangePicker
            size="small"
            onChange={(dates) => {
              setFilters(f => ({
                ...f,
                date_from: dates?.[0]?.format('YYYY-MM-DD') || null,
                date_to: dates?.[1]?.format('YYYY-MM-DD') || null
              }));
            }}
          />
          <Button type="primary" size="small" onClick={fetchOrders}>
            Search
          </Button>
        </div>

        {/* Tabs */}
        <Tabs
          activeKey={filters.status}
          onChange={(key) => {
            setFilters(f => ({ ...f, status: key }));
            setPagination(p => ({ ...p, current: 1 }));
          }}
          items={tabItems}
          tabBarStyle={{ overflowX: 'auto' }}
        />

        {/* Orders Table */}
        <UnifiedResponsiveTable
          columns={columns}
          dataSource={orders}
          rowKey="id"
          loading={loading}
          size="small"
          onRow={(record) => ({
            onClick: () => handleViewOrder(record),
            style: { cursor: 'pointer' },
          })}
          pagination={{
            ...pagination,
            onChange: (page, pageSize) => setPagination({ ...pagination, current: page, pageSize }),
            showSizeChanger: true,
            showTotal: (total) => `Total ${total} orders`
          }}
          locale={{
            emptyText: <Empty description="No orders found" />
          }}
          mobileCardRenderer={(props) => (
             <OrderMobileCard 
                {...props} 
                onAction={(action, record) => handleViewOrder(record)} 
             />
          )}

        />
      </Card>

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
                      <span className="text-[11px]" style={{ color: pmInfo.color }}>{pmInfo.icon}</span>
                    </div>
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Payment</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold text-slate-900">{pmInfo.label}</span>
                    <Tag
                      color={selectedOrder.payment_status === 'completed' ? 'green' : selectedOrder.payment_status === 'pending' ? 'gold' : 'red'}
                      className="!text-[10px] !rounded-full !border-0 !m-0 !px-2 !py-0 !leading-[18px]"
                    >
                      {selectedOrder.payment_status?.charAt(0).toUpperCase() + selectedOrder.payment_status?.slice(1)}
                    </Tag>
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
