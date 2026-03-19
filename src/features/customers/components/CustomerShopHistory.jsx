import { useState, useEffect } from 'react';
import { Empty, Tag, Button, Spin, Modal, Avatar } from 'antd';
import { EyeOutlined, CloseCircleOutlined, ShoppingCartOutlined } from '@ant-design/icons';
import { message } from '@/shared/utils/antdStatic';
import { useData } from '@/shared/hooks/useData';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { UnifiedResponsiveTable } from '@/components/ui/ResponsiveTableV2';

const statusStyles = {
  pending:    { bg: 'bg-amber-50',   text: 'text-amber-700',  border: 'border-amber-200' },
  confirmed:  { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  processing: { bg: 'bg-yellow-50',  text: 'text-yellow-700', border: 'border-yellow-200' },
  shipped:    { bg: 'bg-violet-50',  text: 'text-violet-700', border: 'border-violet-200' },
  delivered:  { bg: 'bg-green-50',   text: 'text-green-600',  border: 'border-green-200' },
  cancelled:  { bg: 'bg-slate-50',   text: 'text-slate-500',  border: 'border-slate-200' },
  refunded:   { bg: 'bg-red-50',     text: 'text-red-600',    border: 'border-red-200' },
};

function StatusBadge({ status }) {
  const s = statusStyles[status] || statusStyles.pending;
  const label = status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown';
  return (
    <span className={`inline-block text-[11px] font-medium px-2.5 py-0.5 rounded-full border ${s.bg} ${s.text} ${s.border}`}>
      {label}
    </span>
  );
}

const CustomerShopHistory = ({ userId }) => {
  const { apiClient } = useData();
  const { formatCurrency } = useCurrency();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState([]);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 });
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [detailVisible, setDetailVisible] = useState(false);

  const fetchOrders = async (page = 1) => {
    setLoading(true);
    try {
      const response = await apiClient.get(`/shop-orders/admin/user/${userId}?page=${page}&limit=${pagination.pageSize}`);
      setOrders(response.data.orders || []);
      setPagination({
        current: response.data.page,
        pageSize: 10,
        total: response.data.total
      });
    } catch (error) {
      console.error('Failed to fetch orders', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userId) {
      fetchOrders();
    }
  }, [userId]);

  const handleViewOrder = async (order) => {
    try {
      const response = await apiClient.get(`/shop-orders/${order.id}`);
      setSelectedOrder(response.data);
      setDetailVisible(true);
    } catch {
      message.error('Failed to load order details');
    }
  };

  const columns = [
     {
        title: 'Order',
        key: 'order',
        render: (_, record) => {
          const items = record.items || [];
          const firstImage = items.find(i => i.product_image)?.product_image;
          const names = items.map(i => i.product_name).filter(Boolean);
          const summary = names.length <= 2
            ? names.join(', ')
            : `${names.slice(0, 2).join(', ')} +${names.length - 2}`;
          return (
            <div className="flex items-center gap-2.5">
              {firstImage ? (
                <Avatar src={firstImage} shape="square" size={36} className="!rounded-md shrink-0" />
              ) : (
                <div className="w-9 h-9 rounded-md bg-slate-100 flex items-center justify-center shrink-0">
                  <ShoppingCartOutlined className="text-slate-300 text-sm" />
                </div>
              )}
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-slate-900 truncate leading-tight">{summary || 'Order'}</p>
                <p className="text-[11px] text-slate-400">{new Date(record.created_at).toLocaleDateString()} · {items.reduce((s, i) => s + (i.quantity || 1), 0)} item(s)</p>
              </div>
            </div>
          );
        }
     },
     {
        title: 'Status',
        dataIndex: 'status',
        key: 'status',
        width: 110,
        render: (status) => <StatusBadge status={status} />
     },
     {
        title: 'Total',
        dataIndex: 'total_amount',
        key: 'total_amount',
        width: 100,
        render: (amount) => <span className="text-[13px] font-semibold text-slate-900">{formatCurrency(amount)}</span>
     },
     {
        title: '',
        key: 'action',
        width: 40,
        render: (_, record) => (
           <Button type="text" size="small" icon={<EyeOutlined />} onClick={() => handleViewOrder(record)} />
        )
     }
  ];

  // Mobile card renderer
  const OrderMobileCard = ({ record }) => {
    const items = record.items || [];
    const firstImage = items.find(i => i.product_image)?.product_image;
    const names = items.map(i => i.product_name).filter(Boolean);
    const summary = names.length <= 2
      ? names.join(', ')
      : `${names.slice(0, 2).join(', ')} +${names.length - 2}`;
    return (
      <div className="border border-slate-100 rounded-lg p-3 mb-2" onClick={() => handleViewOrder(record)}>
        <div className="flex items-center gap-3">
          {firstImage ? (
            <Avatar src={firstImage} shape="square" size={40} className="!rounded-md shrink-0" />
          ) : (
            <div className="w-10 h-10 rounded-md bg-slate-100 flex items-center justify-center shrink-0">
              <ShoppingCartOutlined className="text-slate-300" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium text-slate-900 truncate">{summary || 'Order'}</p>
            <p className="text-[11px] text-slate-400">{new Date(record.created_at).toLocaleDateString()} · {items.reduce((s, i) => s + (i.quantity || 1), 0)} item(s)</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[13px] font-semibold text-slate-900">{formatCurrency(record.total_amount)}</p>
            <StatusBadge status={record.status} />
          </div>
        </div>
      </div>
    );
  };

  if (loading && orders.length === 0) {
     return <div className="p-12 text-center"><Spin /></div>;
  }

  if (orders.length === 0) {
     return <Empty description="No shop orders found" />;
  }

  return (
    <>
    <UnifiedResponsiveTable
       title="Shop Orders"
       columns={columns}
       dataSource={orders}
       mobileCardRenderer={OrderMobileCard}
       rowKey="id"
       loading={loading}
       onRowClick={handleViewOrder}
       pagination={{
         ...pagination,
         onChange: (page) => fetchOrders(page)
       }}
    />

    {/* Order Detail Modal */}
    <Modal
      open={detailVisible}
      onCancel={() => setDetailVisible(false)}
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
            <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-5 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-base font-bold text-slate-900">{selectedOrder.order_number}</span>
                <StatusBadge status={selectedOrder.status} />
              </div>
              <button onClick={() => setDetailVisible(false)} className="text-slate-400 hover:text-slate-600 transition-colors p-1">
                <CloseCircleOutlined className="text-lg" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-x-5 gap-y-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-0.5">Customer</p>
                  <p className="text-sm font-medium text-slate-900">{selectedOrder.first_name} {selectedOrder.last_name}</p>
                  <p className="text-xs text-slate-500 truncate">{selectedOrder.email}</p>
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

              {selectedOrder.notes && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-0.5">Notes</p>
                  <p className="text-xs text-slate-600">{selectedOrder.notes}</p>
                </div>
              )}

              <div className="flex justify-end pt-1">
                <Button size="small" onClick={() => setDetailVisible(false)}>Close</Button>
              </div>
            </div>
          </div>
        );
      })()}
    </Modal>
    </>
  );
};

export default CustomerShopHistory;