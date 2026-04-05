// src/features/dashboard/pages/OrderManagement.jsx
// Admin order management page for shop orders

import { useState, useEffect, useCallback } from 'react';
import { 
  Card, Table, Tag, Button, Space, Typography, Tabs, 
  Badge, Dropdown, Modal, Input, Select, DatePicker,
  Statistic, Row, Col, Avatar, Tooltip, Alert,
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
  InboxOutlined
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

const OrderManagement = ({ embedded = false }) => {
  const { formatCurrency } = useCurrency();
  
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
  const [statusModalVisible, setStatusModalVisible] = useState(false);
  const [statusForm, setStatusForm] = useState({ status: '', notes: '' });
  const [updating, setUpdating] = useState(false);

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
      setDetailModalVisible(true);
    } catch (_error) {
      message.error('Failed to load order details');
    }
  };

  const handleOpenStatusModal = (order) => {
    setSelectedOrder(order);
    setStatusForm({ status: order.status, notes: '' });
    setStatusModalVisible(true);
  };

  const handleUpdateStatus = async () => {
    if (!selectedOrder || !statusForm.status) return;

    setUpdating(true);
    try {
      await apiClient.patch(`/shop-orders/${selectedOrder.id}/status`, {
        status: statusForm.status,
        admin_notes: statusForm.notes
      });
      
      message.success(`Order status updated to ${statusForm.status}`);
      setStatusModalVisible(false);
      fetchOrders();
      fetchLowStock(); // Refresh in case of cancellation stock restore
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
              { key: 'cancel', label: 'Cancel Order', icon: <CloseCircleOutlined />, danger: true, disabled: ['delivered', 'cancelled', 'refunded'].includes(record.status) }
            ],
            onClick: ({ key }) => {
              if (key === 'view') {
                handleViewOrder(record);
              } else if (key === 'cancel') {
                Modal.confirm({
                  title: 'Cancel Order?',
                  icon: <ExclamationCircleOutlined />,
                  content: 'This will restore stock and refund the customer if payment was made. Continue?',
                  onOk: () => {
                    setSelectedOrder(record);
                    setStatusForm({ status: 'cancelled', notes: 'Cancelled by admin' });
                    handleUpdateStatus();
                  }
                });
              } else {
                setSelectedOrder(record);
                setStatusForm({ status: key, notes: '' });
                handleUpdateStatus();
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
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Title level={4} style={{ margin: 0 }}>
            <ShoppingCartOutlined style={{ marginRight: 8 }} />
            Shop Order Calendar
          </Title>
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
        <div style={{ marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Input
            placeholder="Search order #, customer..."
            prefix={<SearchOutlined />}
            style={{ width: 250 }}
            value={filters.search}
            onChange={(e) => setFilters(f => ({ ...f, search: e.target.value }))}
            onPressEnter={() => fetchOrders()}
          />
          <Select
            placeholder="Payment Status"
            style={{ width: 150 }}
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
            onChange={(dates) => {
              setFilters(f => ({
                ...f,
                date_from: dates?.[0]?.format('YYYY-MM-DD') || null,
                date_to: dates?.[1]?.format('YYYY-MM-DD') || null
              }));
            }}
          />
          <Button type="primary" onClick={fetchOrders}>
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
        onCancel={() => setDetailModalVisible(false)}
        footer={null}
        width={560}
        centered
        styles={{ body: { padding: 0 }, header: { display: 'none' } }}
        closable={false}
      >
        {selectedOrder && (() => {
          const addr = selectedOrder.shipping_address;
          const parsedAddr = typeof addr === 'string' ? (() => { try { return JSON.parse(addr); } catch { return null; } })() : addr;
          return (
          <div className="max-h-[85vh] overflow-y-auto">
            {/* Top bar — order number + status + close */}
            <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-5 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-base font-bold text-slate-900">{selectedOrder.order_number}</span>
                <Tag
                  color={statusConfig[selectedOrder.status]?.color}
                  className="!text-[11px] !px-2.5 !py-0 !rounded-full !border-0 !font-medium"
                >
                  {statusConfig[selectedOrder.status]?.label || selectedOrder.status}
                </Tag>
              </div>
              <button onClick={() => setDetailModalVisible(false)} className="text-slate-400 hover:text-slate-600 transition-colors p-1">
                <CloseCircleOutlined className="text-lg" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">

              {/* Customer & order info */}
              <div className="grid grid-cols-2 gap-x-5 gap-y-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-0.5">Customer</p>
                  <p className="text-sm font-medium text-slate-900">{selectedOrder.first_name} {selectedOrder.last_name}</p>
                  <p className="text-xs text-slate-500 truncate">{selectedOrder.email}</p>
                  {selectedOrder.phone && (
                    <p className="text-xs text-slate-500 mt-0.5">{selectedOrder.phone}</p>
                  )}
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-0.5">Payment</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Tag
                      color={selectedOrder.payment_status === 'completed' ? 'green' : selectedOrder.payment_status === 'pending' ? 'gold' : 'red'}
                      className="!text-[11px] !rounded-full !border-0 !m-0"
                    >
                      {selectedOrder.payment_status?.charAt(0).toUpperCase() + selectedOrder.payment_status?.slice(1)}
                    </Tag>
                    <span className="text-xs text-slate-500">
                      {selectedOrder.payment_method === 'wallet' ? 'Wallet' :
                       selectedOrder.payment_method === 'credit_card' ? 'Card' : 'Cash'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">{new Date(selectedOrder.created_at).toLocaleDateString()}</p>
                </div>
                {parsedAddr && (
                  <div className="col-span-2">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-0.5">Shipping Address</p>
                    <p className="text-xs text-slate-600">
                      {[parsedAddr.street || parsedAddr.line1, parsedAddr.city, parsedAddr.state, parsedAddr.zip || parsedAddr.postal_code, parsedAddr.country].filter(Boolean).join(', ') || String(addr)}
                    </p>
                  </div>
                )}
              </div>

              {/* Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                    Items ({(selectedOrder.items || []).reduce((s, i) => s + (i.quantity || 1), 0)})
                  </p>
                  <p className="text-sm font-bold text-slate-900">
                    {formatCurrency(selectedOrder.total_amount, selectedOrder.currency || 'EUR')}
                  </p>
                </div>
                <div className="space-y-1.5">
                  {(selectedOrder.items || []).map((item, idx) => (
                    <div key={item.id || idx} className="flex items-center gap-3 rounded-lg border border-slate-100 px-3 py-2">
                      {item.product_image ? (
                        <Avatar src={item.product_image} shape="square" size={36} className="!rounded-md shrink-0" />
                      ) : (
                        <div className="w-9 h-9 rounded-md bg-slate-100 flex items-center justify-center shrink-0">
                          <ShoppingCartOutlined className="text-slate-300 text-sm" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-slate-900 truncate">{item.product_name}</p>
                        <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                          <span className="text-[11px] text-slate-500">{item.quantity} × {formatCurrency(item.unit_price, selectedOrder.currency || 'EUR')}</span>
                          {item.selected_size && <span className="text-[10px] bg-slate-100 rounded px-1.5 py-px text-slate-600 font-medium">{item.selected_size}</span>}
                          {item.selected_color && <span className="text-[10px] bg-slate-100 rounded px-1.5 py-px text-slate-600 font-medium">{item.selected_color}</span>}
                        </div>
                      </div>
                      <p className="text-[13px] font-semibold text-slate-900 shrink-0">
                        {formatCurrency(item.total_price, selectedOrder.currency || 'EUR')}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Footer actions */}
              <div className="flex justify-end gap-2 pt-1">
                <Button size="small" onClick={() => setDetailModalVisible(false)}>Close</Button>
                <Button
                  size="small"
                  type="primary"
                  onClick={() => {
                    setDetailModalVisible(false);
                    handleOpenStatusModal(selectedOrder);
                  }}
                >
                  Update Status
                </Button>
              </div>
            </div>
          </div>
          );
        })()}
      </Modal>

      {/* Update Status Modal */}
      <Modal
        title="Update Order Status"
        open={statusModalVisible}
        onCancel={() => setStatusModalVisible(false)}
        onOk={handleUpdateStatus}
        confirmLoading={updating}
      >
        <Space direction="vertical" style={{ width: '100%' }} size={16}>
          <div>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>New Status</Text>
            <Select
              value={statusForm.status}
              onChange={(value) => setStatusForm(f => ({ ...f, status: value }))}
              style={{ width: '100%' }}
              options={[
                { value: 'pending', label: 'Pending' },
                { value: 'confirmed', label: 'Confirmed' },
                { value: 'processing', label: 'Processing' },
                { value: 'shipped', label: 'Shipped' },
                { value: 'delivered', label: 'Delivered' },
                { value: 'cancelled', label: 'Cancelled' },
                { value: 'refunded', label: 'Refunded' }
              ]}
            />
          </div>
          <div>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>Notes (Optional)</Text>
            <TextArea
              value={statusForm.notes}
              onChange={(e) => setStatusForm(f => ({ ...f, notes: e.target.value }))}
              rows={3}
              placeholder="Add notes about this status change..."
            />
          </div>
        </Space>
      </Modal>
    </div>
  );
};

export default OrderManagement;
