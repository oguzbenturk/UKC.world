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
import { useTranslation } from 'react-i18next';
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
const buildStatusConfig = (t) => ({
  pending:     { color: 'orange',   icon: <ClockCircleOutlined />,  label: t('student:myOrders.statusLabels.pending'),     dotClass: 'bg-amber-400' },
  confirmed:   { color: 'blue',     icon: <CheckCircleOutlined />,  label: t('student:myOrders.statusLabels.confirmed'),   dotClass: 'bg-sky-400' },
  processing:  { color: 'geekblue', icon: <InboxOutlined />,        label: t('student:myOrders.statusLabels.processing'),  dotClass: 'bg-sky-500' },
  shipped:     { color: 'cyan',     icon: <CarOutlined />,          label: t('student:myOrders.statusLabels.shipped'),     dotClass: 'bg-sky-600' },
  delivered:   { color: 'green',    icon: <CheckCircleOutlined />,  label: t('student:myOrders.statusLabels.delivered'),   dotClass: 'bg-emerald-500' },
  completed:   { color: 'green',    icon: <CheckCircleOutlined />,  label: t('student:myOrders.statusLabels.completed'),   dotClass: 'bg-emerald-500' },
  cancelled:   { color: 'red',      icon: <CloseCircleOutlined />,  label: t('student:myOrders.statusLabels.cancelled'),   dotClass: 'bg-rose-400' },
  refunded:    { color: 'volcano',  icon: <DollarOutlined />,       label: t('student:myOrders.statusLabels.refunded'),    dotClass: 'bg-rose-500' },
});

const PAYMENT_ICONS = {
  wallet: <WalletOutlined />,
  credit_card: <CreditCardOutlined />,
  cash: <DollarOutlined />,
};

const buildFilterOptions = (t) => [
  { label: t('student:myOrders.filters.all'), value: 'all' },
  { label: t('student:myOrders.filters.active'), value: 'active' },
  { label: t('student:myOrders.filters.completed'), value: 'completed' },
  { label: t('student:myOrders.filters.cancelled'), value: 'cancelled' },
];

const FILTER_STATUS_MAP = {
  active: 'pending,confirmed,processing,shipped',
  completed: 'delivered',
  cancelled: 'cancelled,refunded'
};

const STATUS_FLOW = ['pending', 'confirmed', 'processing', 'shipped', 'delivered'];

const buildPaymentLabels = (t) => ({
  wallet: t('student:myOrders.paymentLabels.wallet'),
  credit_card: t('student:myOrders.paymentLabels.credit_card'),
  cash: t('student:myOrders.paymentLabels.cash'),
});

function MyOrdersPage() {
  const { t } = useTranslation(['student']);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { formatCurrency, convertCurrency, userCurrency } = useCurrency();

  const STATUS_CONFIG = buildStatusConfig(t);
  const FILTER_OPTIONS = buildFilterOptions(t);
  const PAYMENT_LABELS = buildPaymentLabels(t);

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

  const getPaymentLabel = (method) => PAYMENT_LABELS[method] || t('student:myOrders.paymentLabels.other');

  /* ─── Summary Metric Strip ─── */
  const metricCards = [
    { title: t('student:myOrders.metrics.totalOrders'), value: orders.length, hint: t('student:myOrders.metrics.totalOrdersHint'), dotClass: 'bg-sky-400' },
    { title: t('student:myOrders.metrics.active'), value: activeOrdersCount, hint: t('student:myOrders.metrics.activeHint'), dotClass: 'bg-amber-400' },
    { title: t('student:myOrders.metrics.completed'), value: completedOrdersCount, hint: t('student:myOrders.metrics.completedHint'), dotClass: 'bg-emerald-500' },
    { title: t('student:myOrders.metrics.unreadMessages'), value: unreadMessageCount, hint: t('student:myOrders.metrics.unreadThreads', { count: unreadThreadCount }), dotClass: 'bg-violet-500' },
  ];

  /* ─── Order Card ─── */
  const renderOrderCard = (order) => {
    const statusCfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending;
    const items = order.items || [];
    const itemCount = order.item_count || items.length;
    const paymentIcon = PAYMENT_ICONS[order.payment_method] || <DollarOutlined />;
    const unread = unreadCounts[order.id] || 0;

    return (
      <article
        key={order.id}
        className="group cursor-pointer rounded-xl border border-slate-100 bg-white p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-md"
        onClick={() => openDetail(order)}
      >
        {/* Header */}
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
              <ShoppingOutlined className="text-base" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-800">{order.order_number}</span>
                {unread > 0 && <Badge count={unread} size="small" />}
              </div>
              <span className="text-[11px] text-slate-400">{dayjs(order.created_at).fromNow()}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Tag icon={statusCfg.icon} color={statusCfg.color}>{statusCfg.label}</Tag>
            {order.payment_status === 'completed' && <Tag color="green" icon={paymentIcon}>{t('student:myOrders.paymentTags.paid')}</Tag>}
            {order.payment_status === 'pending' && <Tag color="orange" icon={paymentIcon}>{t('student:myOrders.paymentTags.paymentPending')}</Tag>}
          </div>
        </div>

        {/* Items preview */}
        <div className="mb-3 rounded-lg border border-slate-100 bg-slate-50/60 p-2.5">
          <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.15em] text-slate-400 font-semibold">
            <span>{t('student:myOrders.orderCard.items', { count: itemCount })}</span>
            <span className="text-slate-200">|</span>
            <span>{getPaymentLabel(order.payment_method)}</span>
          </div>
          <div className="space-y-1.5">
          {items.slice(0, 3).map((item, idx) => (
            <div key={item.id || `item-${idx}`} className="flex items-center gap-3 rounded-lg bg-white px-2.5 py-2 border border-slate-50">
              {item.product_image ? (
                <Image
                  src={getImageUrl(item.product_image)}
                  alt={item.product_name}
                  width={40} height={40}
                  className="rounded-lg object-cover"
                  preview={false}
                  fallback="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDQiIGhlaWdodD0iNDQiIHZpZXdCb3g9IjAgMCA0NCA0NCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNDQiIGhlaWdodD0iNDQiIHJ4PSI4IiBmaWxsPSIjZjFmNWY5Ii8+PC9zdmc+"
                />
              ) : (
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100">
                  <ShoppingOutlined className="text-slate-400" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <span className="block truncate text-sm font-medium text-slate-700">{item.product_name}</span>
                <div className="flex items-center gap-2 text-[11px] text-slate-400">
                  <span>{t('student:myOrders.orderCard.qty', { qty: item.quantity })}</span>
                  {item.selected_size && <span>· {t('student:myOrders.orderCard.size', { size: item.selected_size })}</span>}
                  {item.selected_color && <span>· {item.selected_color}</span>}
                </div>
              </div>
              <span className="text-sm font-semibold text-slate-700">{formatPrice(item.unit_price * item.quantity)}</span>
            </div>
          ))}
          {items.length > 3 && (
            <p className="px-1 text-[11px] text-slate-400">{t('student:myOrders.orderCard.moreItems', { count: items.length - 3 })}</p>
          )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 pt-2.5">
          <div className="flex items-center gap-2.5 text-[11px] text-slate-400">
            <span>{t('student:myOrders.orderCard.items', { count: itemCount })}</span>
            <span className="text-slate-200">·</span>
            <span>{dayjs(order.created_at).format('D MMM YYYY, HH:mm')}</span>
            {unread > 0 && (
              <>
                <span className="text-slate-200">·</span>
                <span className="flex items-center gap-1 text-sky-500 font-medium">
                  <MessageOutlined /> {t('student:myOrders.orderCard.newMessages', { count: unread })}
                </span>
              </>
            )}
          </div>
          <span className="text-base font-bold text-slate-800 transition-colors group-hover:text-sky-600">{formatPrice(order.total_amount)}</span>
        </div>
      </article>
    );
  };

  /* ─── Status Progress Stepper ─── */
  const renderStatusProgress = (order) => {
    if (!order) return null;
    const isCancelled = order.status === 'cancelled' || order.status === 'refunded';
    const currentIdx = STATUS_FLOW.indexOf(order.status);

    if (isCancelled) {
      return (
        <div className="mb-4 rounded-xl border border-rose-100 bg-rose-50 p-4">
          <div className="flex items-center gap-2 text-rose-600">
            {order.status === 'cancelled' ? <CloseCircleOutlined /> : <DollarOutlined />}
            <Text strong className="text-rose-600">
              {order.status === 'cancelled' ? t('student:myOrders.detail.orderCancelledTitle') : t('student:myOrders.detail.orderRefundedTitle')}
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
      <div className="mb-4 rounded-xl border border-slate-100 bg-slate-50/70 p-4">
        <div className="flex items-start justify-between relative">
          <div className="absolute top-4 left-4 right-4 h-0.5 bg-slate-200" />
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
                        : 'bg-slate-200 text-slate-400'
                  }`}
                >
                  {isActive ? <CheckCircleOutlined /> : idx + 1}
                </div>
                <Text className={`text-[10px] sm:text-xs mt-1.5 text-center leading-tight ${isCurrent ? 'font-semibold text-sky-600' : isActive ? 'text-slate-600' : 'text-slate-400'}`}>
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
      <div className="mb-4 rounded-xl border border-slate-100 bg-white p-4">
        <Text strong className="mb-3 block text-sm text-slate-700">{t('student:myOrders.detail.statusHistory')}</Text>
        <Timeline
          items={history.map((h) => {
            const cfg = STATUS_CONFIG[h.new_status] || {};
            return {
              color: cfg.dotClass?.includes('emerald') ? 'green' : cfg.dotClass?.includes('sky') ? 'blue' : cfg.dotClass?.includes('amber') ? 'orange' : cfg.dotClass?.includes('rose') ? 'red' : 'gray',
              children: (
                <div>
                  <div className="flex items-center gap-2">
                    <Tag color={cfg.color} size="small">{cfg.label || h.new_status}</Tag>
                    {h.previous_status && (
                      <Text type="secondary" className="text-xs">{t('student:myOrders.detail.fromStatus', { status: STATUS_CONFIG[h.previous_status]?.label || h.previous_status })}</Text>
                    )}
                  </div>
                  {h.notes && <Text className="text-xs text-slate-500 block mt-1">{h.notes}</Text>}
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
    <div className="flex flex-col rounded-xl border border-slate-100 bg-white p-4" style={{ height: 360 }}>
      <div className="mb-3 flex items-center gap-2">
        <MessageOutlined className="text-sky-500" />
        <Text strong className="text-sm text-slate-700">{t('student:myOrders.messages.heading')}</Text>
      </div>

      {/* Message list */}
      <div className="mb-3 flex-1 space-y-3 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50/60 p-3">
        {messagesLoading ? (
          <div className="flex justify-center py-8"><Spin size="small" /></div>
        ) : messages.length === 0 ? (
          <div className="text-center py-8">
            <MessageOutlined className="text-3xl text-slate-300 mb-2 block" />
            <Text type="secondary" className="text-xs">{t('student:myOrders.messages.emptyState')}</Text>
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
                    className={msg.is_staff ? 'bg-sky-50 text-sky-600' : 'bg-slate-100 text-slate-500'}
                  />
                </Tooltip>
                <div className={`max-w-[75%] rounded-xl px-3 py-2 ${isMe ? 'bg-sky-500 text-white rounded-br-sm' : 'bg-white border border-slate-200 rounded-bl-sm'}`}>
                  {msg.is_staff && !isMe && (
                    <Text className="text-xs font-semibold block mb-0.5 text-sky-600">
                      {msg.first_name || t('student:myOrders.messages.staffFallback')}
                    </Text>
                  )}
                  <Paragraph className={`!mb-0 text-sm ${isMe ? '!text-white' : ''}`} style={{ whiteSpace: 'pre-wrap' }}>
                    {msg.message}
                  </Paragraph>
                  <Text className={`text-[10px] block text-right mt-0.5 ${isMe ? 'text-sky-100' : 'text-slate-400'}`}>
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
          placeholder={t('student:myOrders.messages.placeholder')}
          autoSize={{ minRows: 1, maxRows: 3 }}
          className="flex-1 !rounded-lg"
          disabled={sending}
        />
        <Button
          type="primary"
          icon={<SendOutlined />}
          onClick={sendMessage}
          loading={sending}
          disabled={!newMessage.trim()}
          className="!rounded-lg self-end"
        />
      </div>
    </div>
  );

  /* ─── Order Info Panel ─── */
  const renderOrderInfo = (order) => (
    <div className="mb-4 rounded-xl border border-slate-100 bg-slate-50/60 p-4">
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <Text type="secondary" className="text-[11px] block mb-1">{t('student:myOrders.detail.infoLabels.status')}</Text>
          <Tag icon={STATUS_CONFIG[order.status]?.icon} color={STATUS_CONFIG[order.status]?.color}>
            {STATUS_CONFIG[order.status]?.label || order.status}
          </Tag>
        </div>
        <div>
          <Text type="secondary" className="text-[11px] block mb-1">{t('student:myOrders.detail.infoLabels.payment')}</Text>
          <Tag color={order.payment_status === 'completed' ? 'green' : 'orange'} icon={PAYMENT_ICONS[order.payment_method]}>
            {getPaymentLabel(order.payment_method)} · {order.payment_status}
          </Tag>
        </div>
        {order.voucher_code && (
          <div>
            <Text type="secondary" className="text-[11px] block mb-1">{t('student:myOrders.detail.infoLabels.voucher')}</Text>
            <Tag icon={<GiftOutlined />} color="purple">{order.voucher_code}</Tag>
          </div>
        )}
        {order.shipping_address && (
          <div className="col-span-2">
            <Text type="secondary" className="text-[11px] block mb-1">{t('student:myOrders.detail.infoLabels.shippingAddress')}</Text>
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
      <Text strong className="text-sm block mb-2 text-slate-700">{t('student:myOrders.detail.itemsHeading')}</Text>
      <div className="space-y-1.5 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
        {(order.items || []).map((item, idx) => (
          <div key={item.id || idx} className="flex items-center gap-3 rounded-lg bg-white px-3 py-2 border border-slate-50">
            {item.product_image ? (
              <Image
                src={getImageUrl(item.product_image)}
                alt={item.product_name}
                width={48} height={48}
                className="rounded-lg object-cover"
                preview={false}
                fallback="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNTIiIGhlaWdodD0iNTIiIHZpZXdCb3g9IjAgMCA1MiA1MiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNTIiIGhlaWdodD0iNTIiIHJ4PSI4IiBmaWxsPSIjZjFmNWY5Ii8+PC9zdmc+"
              />
            ) : (
              <div className="bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0" style={{ width: 48, height: 48 }}>
                <ShoppingOutlined className="text-slate-400" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <Text className="text-sm font-medium truncate block text-slate-700">{item.product_name}</Text>
              <div className="flex items-center gap-2 text-[11px] text-slate-400">
                <span>{t('student:myOrders.orderCard.qty', { qty: item.quantity })}</span>
                {item.selected_size && <span>· {t('student:myOrders.orderCard.size', { size: item.selected_size })}</span>}
                {item.selected_color && <span>· {item.selected_color}</span>}
                {item.brand && <span>· {item.brand}</span>}
              </div>
            </div>
            <Text className="text-sm font-semibold text-slate-700">{formatPrice(item.unit_price * item.quantity, item.currency)}</Text>
          </div>
        ))}
      </div>

      {/* Totals */}
      <div className="mt-3 space-y-1 border-t border-slate-100 pt-3">
        {order.discount_amount > 0 && (
          <div className="flex justify-between text-sm">
            <Text type="secondary">{t('student:myOrders.detail.totals.subtotal')}</Text>
            <Text>{formatPrice(order.subtotal)}</Text>
          </div>
        )}
        {order.discount_amount > 0 && (
          <div className="flex justify-between text-sm">
            <Text type="secondary">{t('student:myOrders.detail.totals.discount')}</Text>
            <Text className="text-emerald-600">-{formatPrice(order.discount_amount)}</Text>
          </div>
        )}
        <div className="flex justify-between text-base">
          <Text strong>{t('student:myOrders.detail.totals.total')}</Text>
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
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
              <ShoppingOutlined />
            </div>
            <div>
              <Text strong className="text-slate-800">{order.order_number}</Text>
              <Text type="secondary" className="text-xs block">{dayjs(order.created_at).format('D MMM YYYY, HH:mm')}</Text>
            </div>
          </div>
        ) : t('student:myOrders.detail.drawerTitle')}
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
              <div className="mb-4 rounded-xl border border-amber-100 bg-amber-50 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <ExclamationCircleOutlined className="text-amber-500" />
                  <Text strong className="text-xs text-amber-700">{t('student:myOrders.detail.orderNotes')}</Text>
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
    <div className="min-h-screen bg-gradient-to-b from-white via-sky-50/40 to-white">
      <div className="mx-auto max-w-5xl px-3 py-4 sm:px-5 md:px-6 lg:px-8">

        {/* ── Header ── */}
        <header className="mb-4 sm:mb-5">
          <div className="flex items-start gap-3">
            <button
              onClick={() => navigate(-1)}
              className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-sky-200 hover:text-sky-600 active:scale-95"
            >
              <ArrowLeftOutlined className="text-sm" />
            </button>
            <div className="flex-1">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h1 className="text-lg sm:text-2xl font-bold text-slate-800">{t('student:myOrders.pageTitle')}</h1>
                  <p className="mt-0.5 text-xs sm:text-sm text-slate-400">{t('student:myOrders.pageSubtitle')}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    icon={<ShoppingOutlined />}
                    onClick={() => navigate('/shop')}
                    className="!rounded-xl !border-slate-200 !text-slate-600 !shadow-sm hover:!border-sky-200 hover:!text-sky-600"
                    size="middle"
                  >
                    {t('student:myOrders.browseShop')}
                  </Button>
                  <Button
                    icon={<ReloadOutlined />}
                    onClick={() => { fetchOrders(); fetchUnreadCounts(); }}
                    loading={loading}
                    className="!rounded-xl !border-slate-200 !text-slate-600 !shadow-sm hover:!border-sky-200 hover:!text-sky-600"
                    size="middle"
                  />
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* ── Summary Metrics ── */}
        <section className="mb-4 sm:mb-5">
          <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
            {loading && !orders.length ? (
              Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="h-[80px] sm:h-[90px] rounded-xl border border-slate-100 bg-slate-50/70 animate-pulse" />
              ))
            ) : (
              metricCards.map((card) => (
                <article
                  key={card.title}
                  className="rounded-xl border border-slate-100 bg-white shadow-sm px-3 py-2.5 sm:p-4 transition hover:-translate-y-0.5 hover:shadow-md hover:border-sky-200"
                >
                  <header className="flex items-center gap-1.5">
                    <span className={`h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full ${card.dotClass}`} />
                    <p className="text-[9px] sm:text-[11px] font-semibold uppercase tracking-wider text-slate-400 truncate">
                      {card.title}
                    </p>
                  </header>
                  <p className="mt-1 sm:mt-2 text-base sm:text-xl font-bold tabular-nums text-slate-900">
                    {card.value}
                  </p>
                  <p className="mt-0.5 sm:mt-1.5 text-[10px] sm:text-xs text-slate-400 truncate">
                    {card.hint}
                  </p>
                </article>
              ))
            )}
          </div>
        </section>

        {/* ── Latest order hint ── */}
        {latestOrder && !loading && (
          <div className="mb-4 rounded-xl border border-sky-100 bg-sky-50/50 px-4 py-3 flex items-center gap-3">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-600">
              <ShoppingOutlined className="text-sm" />
            </div>
            <p className="text-xs sm:text-sm text-slate-600">
              {t('student:myOrders.latestOrderHint', { number: latestOrder.order_number, time: dayjs(latestOrder.created_at).fromNow() })}
            </p>
          </div>
        )}

        {/* ── Orders List ── */}
        <section className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm sm:p-4">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-sm sm:text-base font-semibold text-slate-800">{t('student:myOrders.orderHistory.heading')}</h2>
              <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5">{t('student:myOrders.orderHistory.subheading')}</p>
            </div>
            <div className="w-full lg:max-w-sm">
              <Segmented options={FILTER_OPTIONS} value={filter} onChange={setFilter} block />
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-16"><Spin size="large" /></div>
          ) : orders.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-6 py-14 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-50 text-sky-500 text-xl">
                <ShoppingOutlined />
              </div>
              <h3 className="text-base font-semibold text-slate-700 mb-1">
                {filter === 'all' ? t('student:myOrders.emptyState.noOrdersTitle') : t('student:myOrders.emptyState.noFilterTitle', { filter })}
              </h3>
              <p className="mx-auto max-w-sm text-xs sm:text-sm text-slate-400">
                {filter === 'all'
                  ? t('student:myOrders.emptyState.noOrdersBody')
                  : t('student:myOrders.emptyState.noFilterBody')}
              </p>
              <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
                <Button type="primary" onClick={() => navigate('/shop')} className="!h-9 !rounded-xl !px-5">
                  {t('student:myOrders.browseShop')}
                </Button>
                {filter !== 'all' && (
                  <Button onClick={() => setFilter('all')} className="!h-9 !rounded-xl !px-5">
                    {t('student:myOrders.emptyState.clearFilter')}
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {orders.map(renderOrderCard)}
              </div>
              {total > pageSize && (
                <div className="mt-5 flex justify-center">
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
