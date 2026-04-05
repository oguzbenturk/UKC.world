/**
 * MyOrdersPage
 * 
 * Full-featured customer order history page with:
 * - Order list with filtering and pagination
 * - Order detail drawer with status timeline
 * - Per-order messaging between customer and staff
 * 
 * Accessible from profile menu → "My Orders"
 * Route: /shop/my-orders
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card, Typography, Tag, Spin, Empty, Button, Segmented, Pagination,
  Image, Drawer, Timeline, Divider, Input, Avatar, Badge, Tooltip
} from 'antd';
import {
  ShoppingOutlined, ClockCircleOutlined, CheckCircleOutlined,
  CloseCircleOutlined, CarOutlined, InboxOutlined, CreditCardOutlined,
  WalletOutlined, DollarOutlined, ArrowLeftOutlined, MessageOutlined,
  SendOutlined, UserOutlined, CustomerServiceOutlined, GiftOutlined,
  ExclamationCircleOutlined, ReloadOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { useAuth } from '@/shared/hooks/useAuth';
import apiClient from '@/shared/services/apiClient';

dayjs.extend(relativeTime);

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;
/* ─── Status config ─── */
const STATUS_CONFIG = {
  pending:     { color: 'orange',   icon: <ClockCircleOutlined />,  label: 'Pending',     dotColor: '#fa8c16' },
  confirmed:   { color: 'blue',     icon: <CheckCircleOutlined />,  label: 'Confirmed',   dotColor: '#1677ff' },
  processing:  { color: 'geekblue', icon: <InboxOutlined />,        label: 'Processing',  dotColor: '#2f54eb' },
  shipped:     { color: 'cyan',     icon: <CarOutlined />,          label: 'Shipped',     dotColor: '#13c2c2' },
  delivered:   { color: 'green',    icon: <CheckCircleOutlined />,  label: 'Delivered',   dotColor: '#52c41a' },
  completed:   { color: 'green',    icon: <CheckCircleOutlined />,  label: 'Completed',   dotColor: '#52c41a' },
  cancelled:   { color: 'red',      icon: <CloseCircleOutlined />,  label: 'Cancelled',   dotColor: '#ff4d4f' },
  refunded:    { color: 'volcano',  icon: <DollarOutlined />,       label: 'Refunded',    dotColor: '#fa541c' },
};

const PAYMENT_ICONS = {
  wallet: <WalletOutlined />,
  credit_card: <CreditCardOutlined />,
  cash: <DollarOutlined />,
};

const FILTER_OPTIONS = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Completed', value: 'completed' },
  { label: 'Cancelled', value: 'cancelled' },
];

const FILTER_STATUS_MAP = {
  active: 'pending,confirmed,processing,shipped',
  completed: 'delivered',
  cancelled: 'cancelled,refunded'
};

const STATUS_FLOW = ['pending', 'confirmed', 'processing', 'shipped', 'delivered'];

const PAYMENT_LABELS = {
  wallet: 'Wallet',
  credit_card: 'Credit Card',
  cash: 'Cash'
};

function MyOrdersPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { formatCurrency, convertCurrency, userCurrency } = useCurrency();

  // Order list state
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [unreadCounts, setUnreadCounts] = useState({});
  const pageSize = 10;

  // Detail drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Messages state
  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);

  /* ─── Fetchers ─── */
  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);
      const params = { page, limit: pageSize };
      if (filter !== 'all') params.status = FILTER_STATUS_MAP[filter] || filter;
      const response = await apiClient.get('/shop-orders/my-orders', { params });
      setOrders(response.data.orders || []);
      setTotal(response.data.total || 0);
    } catch {
      // empty state shown
    } finally {
      setLoading(false);
    }
  }, [filter, page]);

  const fetchUnreadCounts = useCallback(async () => {
    try {
      const response = await apiClient.get('/shop-orders/my-orders/unread-counts');
      setUnreadCounts(response.data.unreadCounts || {});
    } catch { /* ignore */ }
  }, []);

  const fetchOrderDetail = async (orderId) => {
    try {
      setDetailLoading(true);
      const response = await apiClient.get(`/shop-orders/${orderId}`);
      setSelectedOrder(response.data);
    } catch { setSelectedOrder(null); }
    finally { setDetailLoading(false); }
  };

  const fetchMessages = async (orderId) => {
    try {
      setMessagesLoading(true);
      const response = await apiClient.get(`/shop-orders/${orderId}/messages`);
      setMessages(response.data.messages || []);
      setUnreadCounts(prev => { const n = { ...prev }; delete n[orderId]; return n; });
    } catch { setMessages([]); }
    finally { setMessagesLoading(false); }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedOrder) return;
    try {
      setSending(true);
      const response = await apiClient.post(`/shop-orders/${selectedOrder.id}/messages`, { message: newMessage.trim() });
      setMessages(prev => [...prev, response.data.message]);
      setNewMessage('');
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch { /* silent */ }
    finally { setSending(false); }
  };

  /* ─── Effects ─── */
  useEffect(() => { fetchOrders(); }, [fetchOrders]);
  useEffect(() => { fetchUnreadCounts(); }, [fetchUnreadCounts]);
  useEffect(() => { setPage(1); }, [filter]);
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  }, [messages.length]);

  const activeOrdersCount = orders.filter((order) => ['pending', 'confirmed', 'processing', 'shipped'].includes(order.status)).length;
  const completedOrdersCount = orders.filter((order) => ['delivered', 'completed'].includes(order.status)).length;
  const unreadThreadCount = Object.keys(unreadCounts).length;
  const unreadMessageCount = Object.values(unreadCounts).reduce((sum, count) => sum + Number(count || 0), 0);
  const latestOrder = orders[0] || null;

  /* ─── Helpers ─── */
  const formatPrice = (price, currency = 'EUR') => {
    const converted = convertCurrency(price, currency, userCurrency);
    return formatCurrency(converted, userCurrency);
  };

  const getImageUrl = (url) => {
    if (!url) return null;
    if (url.startsWith('http')) return url;
    const backendUrl = import.meta.env.VITE_BACKEND_URL || '';
    return `${backendUrl}${url.startsWith('/') ? '' : '/'}${url}`;
  };

  const openDetail = (order) => {
    setDrawerOpen(true);
    setMessages([]);
    setNewMessage('');
    fetchOrderDetail(order.id);
    fetchMessages(order.id);
  };

  const closeDetail = () => {
    setDrawerOpen(false);
    setSelectedOrder(null);
    setMessages([]);
  };

  const getPaymentLabel = (method) => PAYMENT_LABELS[method] || 'Other';

  /* ─── Order Card ─── */
  const renderOrderCard = (order) => {
    const statusCfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending;
    const items = order.items || [];
    const itemCount = order.item_count || items.length;
    const paymentIcon = PAYMENT_ICONS[order.payment_method] || <DollarOutlined />;
    const unread = unreadCounts[order.id] || 0;

    return (
      <Card
        key={order.id}
        className="group mb-4 cursor-pointer overflow-hidden rounded-3xl border border-slate-200/80 bg-white/95 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-[0_20px_45px_rgba(14,105,194,0.12)]"
        onClick={() => openDetail(order)}
        hoverable
      >
        {/* Header */}
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 via-sky-600 to-indigo-600 text-white shadow-[0_12px_28px_rgba(37,99,235,0.22)]">
              <ShoppingOutlined className="text-lg text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <Text strong className="font-mono text-base text-slate-800">{order.order_number}</Text>
                {unread > 0 && <Badge count={unread} size="small" />}
              </div>
              <div className="text-xs text-slate-400">Placed {dayjs(order.created_at).fromNow()}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Tag icon={statusCfg.icon} color={statusCfg.color}>{statusCfg.label}</Tag>
            {order.payment_status === 'completed' && <Tag color="green" icon={paymentIcon}>Paid</Tag>}
            {order.payment_status === 'pending' && <Tag color="orange" icon={paymentIcon}>Payment Pending</Tag>}
          </div>
        </div>

        {/* Items preview */}
        <div className="mb-4 rounded-2xl border border-slate-100 bg-slate-50/80 p-3 shadow-inner shadow-slate-100/40">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-slate-400">
            <span>{itemCount} item{itemCount !== 1 ? 's' : ''}</span>
            <span>•</span>
            <span>{getPaymentLabel(order.payment_method)}</span>
          </div>
          <div className="space-y-2">
          {items.slice(0, 3).map((item, idx) => (
            <div key={item.id || `item-${idx}`} className="flex items-center gap-3 rounded-2xl bg-white px-3 py-2 shadow-sm">
              {item.product_image ? (
                <Image
                  src={getImageUrl(item.product_image)}
                  alt={item.product_name}
                  width={44} height={44}
                  className="rounded-lg object-cover"
                  preview={false}
                  fallback="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDQiIGhlaWdodD0iNDQiIHZpZXdCb3g9IjAgMCA0NCA0NCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNDQiIGhlaWdodD0iNDQiIHJ4PSI4IiBmaWxsPSIjZjFmNWY5Ii8+PC9zdmc+"
                />
              ) : (
                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-slate-100">
                  <ShoppingOutlined className="text-gray-400" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <Text className="block truncate text-sm font-medium text-slate-700">{item.product_name}</Text>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span>Qty: {item.quantity}</span>
                  {item.selected_size && <span>• Size: {item.selected_size}</span>}
                  {item.selected_color && <span>• {item.selected_color}</span>}
                </div>
              </div>
              <Text className="text-sm font-semibold text-slate-700">{formatPrice(item.unit_price * item.quantity)}</Text>
            </div>
          ))}
          {items.length > 3 && (
            <Text type="secondary" className="px-1 text-xs">+{items.length - 3} more item{items.length - 3 > 1 ? 's' : ''}</Text>
          )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 pt-3">
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span>{itemCount} item{itemCount !== 1 ? 's' : ''}</span>
            <span>•</span>
            <span>{dayjs(order.created_at).format('D MMM YYYY, HH:mm')}</span>
            {unread > 0 && (
              <>
                <span>•</span>
                <span className="flex items-center gap-1 text-sky-500">
                  <MessageOutlined /> {unread} new
                </span>
              </>
            )}
          </div>
          <Text strong className="text-base text-slate-800 transition-colors group-hover:text-sky-700">{formatPrice(order.total_amount)}</Text>
        </div>
      </Card>
    );
  };

  /* ─── Status Progress Stepper ─── */
  const renderStatusProgress = (order) => {
    if (!order) return null;
    const isCancelled = order.status === 'cancelled' || order.status === 'refunded';
    const currentIdx = STATUS_FLOW.indexOf(order.status);

    if (isCancelled) {
      return (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4">
          <div className="flex items-center gap-2 text-red-600">
            {order.status === 'cancelled' ? <CloseCircleOutlined /> : <DollarOutlined />}
            <Text strong className="text-red-600">
              Order {order.status === 'cancelled' ? 'Cancelled' : 'Refunded'}
            </Text>
          </div>
          {order.cancelled_at && (
            <Text type="secondary" className="text-xs mt-1 block">
              {dayjs(order.cancelled_at).format('D MMM YYYY, HH:mm')}
            </Text>
          )}
        </div>
      );
    }

    return (
      <div className="mb-6 rounded-2xl border border-slate-200/70 bg-slate-50/70 p-4">
        <div className="flex items-start justify-between relative">
          {/* Background line */}
          <div className="absolute top-4 left-4 right-4 h-0.5 bg-gray-200" />
          <div
            className="absolute top-4 left-4 h-0.5 bg-sky-400 transition-all"
            style={{ width: currentIdx > 0 ? `${(currentIdx / (STATUS_FLOW.length - 1)) * (100 - 8)}%` : 0 }}
          />
          {STATUS_FLOW.map((status, idx) => {
            const cfg = STATUS_CONFIG[status];
            const isActive = idx <= currentIdx;
            const isCurrent = status === order.status;
            return (
              <div key={status} className="flex flex-col items-center relative z-10" style={{ flex: 1 }}>
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                    isCurrent
                      ? 'bg-sky-500 text-white ring-4 ring-sky-100'
                      : isActive
                        ? 'bg-sky-500 text-white'
                        : 'bg-gray-200 text-gray-400'
                  }`}
                >
                  {isActive ? <CheckCircleOutlined /> : idx + 1}
                </div>
                <Text className={`text-xs mt-1.5 text-center leading-tight ${isCurrent ? 'font-semibold text-sky-600' : isActive ? 'text-gray-600' : 'text-gray-400'}`}>
                  {cfg.label}
                </Text>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  /* ─── Status History Timeline ─── */
  const renderTimeline = (order) => {
    const history = order?.status_history || [];
    if (history.length === 0) return null;

    return (
      <div className="mb-4 rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
        <Text strong className="mb-3 block text-sm text-slate-700">Status History</Text>
        <Timeline
          items={history.map((h) => {
            const cfg = STATUS_CONFIG[h.new_status] || {};
            return {
              color: cfg.dotColor || 'gray',
              children: (
                <div>
                  <div className="flex items-center gap-2">
                    <Tag color={cfg.color} size="small">{cfg.label || h.new_status}</Tag>
                    {h.previous_status && (
                      <Text type="secondary" className="text-xs">from {STATUS_CONFIG[h.previous_status]?.label || h.previous_status}</Text>
                    )}
                  </div>
                  {h.notes && <Text className="text-xs text-gray-500 block mt-1">{h.notes}</Text>}
                  <Text type="secondary" className="text-xs block">
                    {dayjs(h.created_at).format('D MMM YYYY, HH:mm')}
                    {h.first_name && ` · by ${h.first_name} ${h.last_name || ''}`}
                  </Text>
                </div>
              )
            };
          })}
        />
      </div>
    );
  };

  /* ─── Messages Panel ─── */
  const renderMessages = () => (
    <div className="flex flex-col rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm" style={{ height: 360 }}>
      <div className="mb-3 flex items-center gap-2">
        <MessageOutlined className="text-sky-500" />
        <Text strong className="text-sm text-slate-700">Order Messages</Text>
      </div>

      {/* Message list */}
      <div className="mb-3 flex-1 space-y-3 overflow-y-auto rounded-2xl border border-slate-100 bg-slate-50 p-3">
        {messagesLoading ? (
          <div className="flex justify-center py-8"><Spin size="small" /></div>
        ) : messages.length === 0 ? (
          <div className="text-center py-8">
            <MessageOutlined className="text-3xl text-gray-300 mb-2 block" />
            <Text type="secondary" className="text-xs">No messages yet. Ask a question about your order!</Text>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.user_id === user?.id;
            return (
              <div key={msg.id} className={`flex gap-2 ${isMe ? 'flex-row-reverse' : ''}`}>
                <Tooltip title={`${msg.first_name || ''} ${msg.last_name || ''}`}>
                  <Avatar
                    size={28}
                    src={msg.profile_image_url ? getImageUrl(msg.profile_image_url) : undefined}
                    icon={msg.is_staff ? <CustomerServiceOutlined /> : <UserOutlined />}
                    className={msg.is_staff ? 'bg-sky-100 text-sky-600' : 'bg-gray-200 text-gray-600'}
                  />
                </Tooltip>
                <div className={`max-w-[75%] rounded-2xl px-3 py-2 ${isMe ? 'bg-sky-500 text-white rounded-br-md' : 'bg-white border border-gray-200 rounded-bl-md'}`}>
                  {msg.is_staff && !isMe && (
                    <Text className="text-xs font-semibold block mb-0.5" style={{ color: '#1677ff' }}>
                      {msg.first_name || 'Staff'}
                    </Text>
                  )}
                  <Paragraph className={`!mb-0 text-sm ${isMe ? '!text-white' : ''}`} style={{ whiteSpace: 'pre-wrap' }}>
                    {msg.message}
                  </Paragraph>
                  <Text className={`text-xs block text-right mt-0.5 ${isMe ? 'text-sky-100' : 'text-gray-400'}`}>
                    {dayjs(msg.created_at).format('HH:mm')}
                  </Text>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2">
        <TextArea
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onPressEnter={(e) => { if (!e.shiftKey) { e.preventDefault(); sendMessage(); } }}
          placeholder="Type your message..."
          autoSize={{ minRows: 1, maxRows: 3 }}
          className="flex-1 rounded-xl"
          disabled={sending}
        />
        <Button
          type="primary"
          icon={<SendOutlined />}
          onClick={sendMessage}
          loading={sending}
          disabled={!newMessage.trim()}
          className="rounded-xl self-end"
        />
      </div>
    </div>
  );

  /* ─── Order Info Panel ─── */
  const renderOrderInfo = (order) => (
    <div className="mb-4 rounded-2xl border border-slate-200/70 bg-slate-50/80 p-4">
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <Text type="secondary" className="text-xs block">Status</Text>
          <Tag icon={STATUS_CONFIG[order.status]?.icon} color={STATUS_CONFIG[order.status]?.color}>
            {STATUS_CONFIG[order.status]?.label || order.status}
          </Tag>
        </div>
        <div>
          <Text type="secondary" className="text-xs block">Payment</Text>
          <Tag color={order.payment_status === 'completed' ? 'green' : 'orange'} icon={PAYMENT_ICONS[order.payment_method]}>
            {getPaymentLabel(order.payment_method)} · {order.payment_status}
          </Tag>
        </div>
        {order.voucher_code && (
          <div>
            <Text type="secondary" className="text-xs block">Voucher</Text>
            <Tag icon={<GiftOutlined />} color="purple">{order.voucher_code}</Tag>
          </div>
        )}
        {order.shipping_address && (
          <div className="col-span-2">
            <Text type="secondary" className="text-xs block">Shipping Address</Text>
            <Text className="text-sm">
              {typeof order.shipping_address === 'object'
                ? [order.shipping_address.street, order.shipping_address.city, order.shipping_address.country].filter(Boolean).join(', ')
                : order.shipping_address}
            </Text>
          </div>
        )}
      </div>
    </div>
  );

  /* ─── Order Items List ─── */
  const renderOrderItems = (order) => (
    <div className="mb-4">
      <Text strong className="text-sm block mb-3">Items</Text>
      <div className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-3">
        {(order.items || []).map((item, idx) => (
          <div key={item.id || idx} className="flex items-center gap-3 rounded-2xl bg-white px-3 py-2 shadow-sm">
            {item.product_image ? (
              <Image
                src={getImageUrl(item.product_image)}
                alt={item.product_name}
                width={52} height={52}
                className="rounded-lg object-cover"
                preview={false}
                fallback="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNTIiIGhlaWdodD0iNTIiIHZpZXdCb3g9IjAgMCA1MiA1MiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNTIiIGhlaWdodD0iNTIiIHJ4PSI4IiBmaWxsPSIjZjFmNWY5Ii8+PC9zdmc+"
              />
            ) : (
              <div className="bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0" style={{ width: 52, height: 52 }}>
                <ShoppingOutlined className="text-gray-400" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <Text className="text-sm font-medium truncate block">{item.product_name}</Text>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <span>Qty: {item.quantity}</span>
                {item.selected_size && <span>• Size: {item.selected_size}</span>}
                {item.selected_color && <span>• {item.selected_color}</span>}
                {item.brand && <span>• {item.brand}</span>}
              </div>
            </div>
            <Text className="text-sm font-semibold">{formatPrice(item.unit_price * item.quantity, item.currency)}</Text>
          </div>
        ))}
      </div>

      {/* Totals */}
      <div className="mt-3 space-y-1 border-t border-slate-100 pt-3">
        {order.discount_amount > 0 && (
          <div className="flex justify-between text-sm">
            <Text type="secondary">Subtotal</Text>
            <Text>{formatPrice(order.subtotal)}</Text>
          </div>
        )}
        {order.discount_amount > 0 && (
          <div className="flex justify-between text-sm">
            <Text type="secondary">Discount</Text>
            <Text className="text-green-600">-{formatPrice(order.discount_amount)}</Text>
          </div>
        )}
        <div className="flex justify-between text-base">
          <Text strong>Total</Text>
          <Text strong className="text-lg">{formatPrice(order.total_amount)}</Text>
        </div>
      </div>
    </div>
  );

  /* ─── Detail Drawer ─── */
  const renderDrawer = () => {
    const order = selectedOrder;
    return (
      <Drawer
        title={order ? (
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 via-sky-600 to-indigo-600 text-white shadow-sm">
              <ShoppingOutlined />
            </div>
            <div>
              <Text strong>{order.order_number}</Text>
              <Text type="secondary" className="text-xs block">{dayjs(order.created_at).format('D MMM YYYY, HH:mm')}</Text>
            </div>
          </div>
        ) : 'Order Details'}
        open={drawerOpen}
        onClose={closeDetail}
        width={520}
        className="shop-order-drawer"
        destroyOnHidden
      >
        {detailLoading || !order ? (
          <div className="flex justify-center py-16"><Spin size="large" /></div>
        ) : (
          <div className="space-y-4">
            {renderStatusProgress(order)}
            {renderOrderInfo(order)}
            {renderOrderItems(order)}

            <Divider className="!my-1" />
            {renderTimeline(order)}

            {order.notes && (
              <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <ExclamationCircleOutlined className="text-amber-500" />
                  <Text strong className="text-xs text-amber-700">Order Notes</Text>
                </div>
                <Text className="text-sm text-amber-800">{order.notes}</Text>
              </div>
            )}

            <Divider className="!my-1" />
            {renderMessages()}
          </div>
        )}
      </Drawer>
    );
  };

  /* ─── Main Render ─── */
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-sky-50/60">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-sky-500 via-sky-600 to-indigo-700 p-6 text-white shadow-[0_22px_50px_rgba(30,64,175,0.28)]">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-stretch lg:justify-between">
            <div className="flex-1 space-y-5">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.25em] text-white/85 shadow-sm">
                <ShoppingOutlined /> Order Tracking
              </div>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <Button
                    type="text"
                    icon={<ArrowLeftOutlined />}
                    onClick={() => navigate(-1)}
                    className="!mt-0.5 !flex !h-10 !w-10 !items-center !justify-center !rounded-2xl !border !border-white/20 !bg-white/10 !text-white hover:!border-white/35 hover:!bg-white/20 hover:!text-white"
                  />
                  <div>
                    <Title level={2} className="!mb-2 !text-white !font-duotone-bold-extended">My Orders</Title>
                    <Text className="max-w-2xl text-sm !text-white/75">
                      Follow your shop purchases, check payment progress, and keep conversations with the team in one place.
                    </Text>
                  </div>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-white/20 bg-white/12 p-4 shadow-[0_10px_24px_rgba(24,64,192,0.24)] backdrop-blur">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/85">Visible Orders</p>
                  <p className="mt-3 text-3xl font-duotone-bold-extended text-white">{orders.length}</p>
                  <p className="mt-1 text-xs text-white/70">Orders loaded on this page</p>
                </div>
                <div className="rounded-2xl border border-white/18 bg-white/10 p-4 shadow-[0_10px_24px_rgba(13,139,255,0.24)] backdrop-blur">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/85">Active</p>
                  <p className="mt-3 text-3xl font-duotone-bold-extended text-white">{activeOrdersCount}</p>
                  <p className="mt-1 text-xs text-white/70">Pending, processing, or shipped</p>
                </div>
                <div className="rounded-2xl border border-white/18 bg-white/10 p-4 shadow-[0_10px_24px_rgba(53,231,138,0.24)] backdrop-blur">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/85">Completed</p>
                  <p className="mt-3 text-3xl font-duotone-bold-extended text-white">{completedOrdersCount}</p>
                  <p className="mt-1 text-xs text-white/70">Delivered or fully completed</p>
                </div>
                <div className="rounded-2xl border border-white/18 bg-white/10 p-4 shadow-[0_10px_24px_rgba(251,191,36,0.20)] backdrop-blur">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/85">Unread</p>
                  <p className="mt-3 text-3xl font-duotone-bold-extended text-white">{unreadMessageCount}</p>
                  <p className="mt-1 text-xs text-white/70">Across {unreadThreadCount} order thread{unreadThreadCount === 1 ? '' : 's'}</p>
                </div>
              </div>
            </div>

            <div className="flex w-full max-w-sm flex-col gap-3 rounded-3xl border border-white/18 bg-white/14 p-5 backdrop-blur-xl shadow-[0_16px_36px_rgba(14,58,190,0.32)]">
              <p className="text-sm text-white/80">
                {latestOrder
                  ? `Latest order ${latestOrder.order_number} was placed ${dayjs(latestOrder.created_at).fromNow()}. Open it to see updates or message the team.`
                  : 'Once you place a shop order, its status, payment progress, and support messages will appear here.'}
              </p>
              <Button
                type="primary"
                icon={<ShoppingOutlined />}
                onClick={() => navigate('/shop')}
                className="h-11 rounded-2xl border-0 bg-white text-sky-600 shadow-[0_10px_25px_rgba(11,78,240,0.35)] transition hover:bg-slate-100"
              >
                Browse Shop
              </Button>
              <Button
                ghost
                icon={<ReloadOutlined />}
                onClick={() => {
                  fetchOrders();
                  fetchUnreadCounts();
                }}
                loading={loading}
                className="h-11 rounded-2xl border-white/45 text-white shadow-[0_8px_22px_rgba(255,255,255,0.22)] hover:bg-white/15"
              >
                Refresh Orders
              </Button>
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-3xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur sm:p-5">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <Title level={5} className="!mb-1 !text-slate-800">Order history</Title>
              <Text type="secondary" className="text-sm">Review purchases, watch status changes, and open any order to continue the conversation.</Text>
            </div>
            <div className="w-full lg:max-w-md">
              <Segmented options={FILTER_OPTIONS} value={filter} onChange={setFilter} block />
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-20"><Spin size="large" /></div>
          ) : orders.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-gradient-to-br from-slate-50 to-sky-50/70 px-6 py-16 text-center">
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-sky-500 to-indigo-600 text-2xl text-white shadow-[0_16px_36px_rgba(37,99,235,0.22)]">
                <ShoppingOutlined />
              </div>
              <Title level={4} className="!mb-2 !text-slate-800">
                {filter === 'all' ? 'No orders yet' : `No ${filter} orders found`}
              </Title>
              <Text className="mx-auto block max-w-md text-sm text-slate-500">
                {filter === 'all'
                  ? 'Your purchases will show up here with payment details, shipping updates, and direct messaging once you place an order.'
                  : 'Try another filter or refresh the list to see the latest activity for your orders.'}
              </Text>
              <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
                <Button type="primary" onClick={() => navigate('/shop')} className="h-11 rounded-2xl border-0 bg-gradient-to-r from-sky-500 to-indigo-600 px-6 shadow-[0_12px_28px_rgba(37,99,235,0.25)]">
                  Browse Shop
                </Button>
                <Button onClick={() => setFilter('all')} className="h-11 rounded-2xl px-6">
                  Clear Filter
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                {orders.map(renderOrderCard)}
              </div>
              {total > pageSize && (
                <div className="mt-6 flex justify-center">
                  <Pagination current={page} total={total} pageSize={pageSize} onChange={setPage} showSizeChanger={false} />
                </div>
              )}
            </>
          )}
        </section>
      </div>
      {renderDrawer()}
    </div>
  );
}

export default MyOrdersPage;
