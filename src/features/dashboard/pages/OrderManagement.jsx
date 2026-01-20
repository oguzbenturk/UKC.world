// src/features/dashboard/pages/OrderManagement.jsx
// Admin order management page for shop orders

import { useState, useEffect, useCallback } from 'react';
import { 
  Card, Table, Tag, Button, Space, Typography, Tabs, 
  Badge, Dropdown, Modal, Input, Select, DatePicker,
  Statistic, Row, Col, Avatar, Tooltip, Descriptions, Alert,
  message, Empty
} from 'antd';
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
import apiClient from '@/shared/services/apiClient';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const { TextArea } = Input;

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
      render: (text, record) => (
        <Space>
          <Avatar 
            size={40} 
            style={{ background: '#f0f0f0' }}
            icon={<ShoppingCartOutlined style={{ color: '#1890ff' }} />}
          />
          <div>
            <Text strong style={{ display: 'block' }}>{text}</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {new Date(record.created_at).toLocaleDateString()}
            </Text>
          </div>
        </Space>
      )
    },
    {
      title: 'Customer',
      key: 'customer',
      render: (_, record) => (
        <Space>
          <Avatar icon={<UserOutlined />} size="small" />
          <div>
            <Text style={{ display: 'block' }}>
              {record.first_name} {record.last_name}
            </Text>
            <Text type="secondary" style={{ fontSize: 12 }}>{record.email}</Text>
          </div>
        </Space>
      )
    },
    {
      title: 'Items',
      dataIndex: 'item_count',
      key: 'items',
      align: 'center',
      render: (count, record) => (
        <Tooltip title={record.items?.map(i => `${i.quantity}x ${i.product_name}`).join(', ')}>
          <Tag>{count} items</Tag>
        </Tooltip>
      )
    },
    {
      title: 'Total',
      dataIndex: 'total_amount',
      key: 'total',
      render: (amount, record) => (
        <Text strong style={{ color: '#1890ff' }}>
          {formatCurrency(amount, record.currency || 'EUR')}
        </Text>
      )
    },
    {
      title: 'Payment',
      dataIndex: 'payment_status',
      key: 'payment_status',
      render: (status, record) => (
        <Space direction="vertical" size={2}>
          <Tag color={status === 'completed' ? 'green' : status === 'pending' ? 'gold' : 'red'}>
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </Tag>
          <Text type="secondary" style={{ fontSize: 11 }}>
            {record.payment_method === 'wallet' ? 'Wallet' : 
             record.payment_method === 'credit_card' ? 'Card' : 'Cash'}
          </Text>
        </Space>
      )
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => {
        const config = statusConfig[status] || { color: 'default', label: status };
        return (
          <Tag color={config.color} icon={config.icon}>
            {config.label}
          </Tag>
        );
      }
    },
    {
      title: 'Actions',
      key: 'actions',
      align: 'center',
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
      {!embedded && (
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
      )}

      {/* Stats Row */}
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

      {/* Low Stock Alert */}
      {lowStockProducts.length > 0 && (
        <Alert
          message="Low Stock Warning"
          description={
            <Space wrap>
              {lowStockProducts.slice(0, 5).map(p => (
                <Tag key={p.id} color="red">
                  {p.name}: {p.stock_quantity} left
                </Tag>
              ))}
              {lowStockProducts.length > 5 && (
                <Tag>+{lowStockProducts.length - 5} more</Tag>
              )}
            </Space>
          }
          type="warning"
          showIcon
          icon={<WarningOutlined />}
          style={{ marginBottom: 24 }}
        />
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
        />

        {/* Orders Table */}
        <Table
          columns={columns}
          dataSource={orders}
          rowKey="id"
          loading={loading}
          pagination={{
            ...pagination,
            onChange: (page, pageSize) => setPagination({ ...pagination, current: page, pageSize }),
            showSizeChanger: true,
            showTotal: (total) => `Total ${total} orders`
          }}
          locale={{
            emptyText: <Empty description="No orders found" />
          }}
        />
      </Card>

      {/* Order Detail Modal */}
      <Modal
        title={<span><ShoppingCartOutlined /> Order Details</span>}
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setDetailModalVisible(false)}>
            Close
          </Button>,
          <Button 
            key="status" 
            type="primary" 
            onClick={() => {
              setDetailModalVisible(false);
              handleOpenStatusModal(selectedOrder);
            }}
          >
            Update Status
          </Button>
        ]}
        width={700}
      >
        {selectedOrder && (
          <div>
            <Descriptions bordered column={2} size="small">
              <Descriptions.Item label="Order Number">{selectedOrder.order_number}</Descriptions.Item>
              <Descriptions.Item label="Status">
                <Tag color={statusConfig[selectedOrder.status]?.color}>
                  {statusConfig[selectedOrder.status]?.label}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Customer">
                {selectedOrder.first_name} {selectedOrder.last_name}
              </Descriptions.Item>
              <Descriptions.Item label="Email">{selectedOrder.email}</Descriptions.Item>
              <Descriptions.Item label="Payment Method">
                {selectedOrder.payment_method === 'wallet' ? 'Wallet' : 
                 selectedOrder.payment_method === 'credit_card' ? 'Credit Card' : 'Cash'}
              </Descriptions.Item>
              <Descriptions.Item label="Payment Status">
                <Tag color={selectedOrder.payment_status === 'completed' ? 'green' : 'gold'}>
                  {selectedOrder.payment_status}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Total" span={2}>
                <Text strong style={{ fontSize: 18, color: '#1890ff' }}>
                  {formatCurrency(selectedOrder.total_amount, selectedOrder.currency || 'EUR')}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="Created">{new Date(selectedOrder.created_at).toLocaleString()}</Descriptions.Item>
              <Descriptions.Item label="Updated">{new Date(selectedOrder.updated_at).toLocaleString()}</Descriptions.Item>
            </Descriptions>

            <Title level={5} style={{ marginTop: 24, marginBottom: 12 }}>Order Items</Title>
            <Table
              dataSource={selectedOrder.items || []}
              rowKey="id"
              pagination={false}
              size="small"
              columns={[
                {
                  title: 'Product',
                  dataIndex: 'product_name',
                  render: (name, item) => (
                    <Space>
                      {item.product_image && (
                        <Avatar src={item.product_image} shape="square" size="small" />
                      )}
                      <div>
                        <Text>{name}</Text>
                        {(item.selected_size || item.selected_color) && (
                          <div>
                            {item.selected_size && <Tag size="small">Size: {item.selected_size}</Tag>}
                            {item.selected_color && <Tag size="small">Color: {item.selected_color}</Tag>}
                          </div>
                        )}
                      </div>
                    </Space>
                  )
                },
                {
                  title: 'Price',
                  dataIndex: 'unit_price',
                  render: (price) => formatCurrency(price, 'EUR')
                },
                {
                  title: 'Qty',
                  dataIndex: 'quantity',
                  align: 'center'
                },
                {
                  title: 'Total',
                  dataIndex: 'total_price',
                  render: (price) => formatCurrency(price, 'EUR')
                }
              ]}
            />

            {selectedOrder.status_history?.length > 0 && (
              <>
                <Title level={5} style={{ marginTop: 24, marginBottom: 12 }}>Status History</Title>
                <Table
                  dataSource={selectedOrder.status_history}
                  rowKey="id"
                  pagination={false}
                  size="small"
                  columns={[
                    {
                      title: 'Date',
                      dataIndex: 'created_at',
                      render: (date) => new Date(date).toLocaleString()
                    },
                    {
                      title: 'From',
                      dataIndex: 'previous_status',
                      render: (status) => status ? <Tag>{status}</Tag> : '-'
                    },
                    {
                      title: 'To',
                      dataIndex: 'new_status',
                      render: (status) => <Tag color={statusConfig[status]?.color}>{status}</Tag>
                    },
                    {
                      title: 'By',
                      render: (_, record) => record.first_name ? `${record.first_name} ${record.last_name}` : 'System'
                    },
                    {
                      title: 'Notes',
                      dataIndex: 'notes',
                      ellipsis: true
                    }
                  ]}
                />
              </>
            )}
          </div>
        )}
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
