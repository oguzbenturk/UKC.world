import { useState, useEffect } from 'react';
import { Card, Empty, Tag, Button, Spin, Typography } from 'antd';
import { ShoppingOutlined, EyeOutlined } from '@ant-design/icons';
import { useData } from '@/shared/hooks/useData';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { UnifiedResponsiveTable } from '@/components/ui/ResponsiveTableV2';

const { Text } = Typography;

const CustomerShopHistory = ({ userId }) => {
  const { apiClient } = useData();
  const { formatCurrency } = useCurrency();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState([]);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 });

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

  const columns = [
     {
        title: 'Order',
        dataIndex: 'order_number',
        key: 'order_number',
        render: (text) => <span className="font-medium">{text}</span>
     },
     {
        title: 'Date',
        dataIndex: 'created_at',
        key: 'created_at',
        render: (date) => new Date(date).toLocaleDateString()
     },
     {
        title: 'Status',
        dataIndex: 'status',
        key: 'status',
        render: (status) => {
            let color = 'default';
            if (status === 'delivered' || status === 'completed') color = 'green';
            if (status === 'cancelled') color = 'red';
            if (status === 'pending') color = 'orange';
            if (status === 'shipped') color = 'blue';
            return <Tag color={color}>{status ? status.toUpperCase() : 'UNKNOWN'}</Tag>;
        }
     },
     {
        title: 'Total',
        dataIndex: 'total_amount',
        key: 'total_amount',
        render: (amount) => formatCurrency(amount)
     },
     {
        title: 'Action',
        key: 'action',
        render: (_, record) => (
           <Button size="small" icon={<EyeOutlined />}>View</Button>
        )
     }
  ];

  // Mobile card renderer
  const OrderMobileCard = ({ record }) => (
    <Card size="small" className="mb-2">
      <div className="flex justify-between items-start mb-2">
         <div>
            <div className="font-medium">{record.order_number}</div>
            <div className="text-xs text-gray-500">{new Date(record.created_at).toLocaleDateString()}</div>
         </div>
         <Tag color={record.status === 'delivered' ? 'green' : record.status === 'cancelled' ? 'red' : 'blue'}>
            {record.status ? record.status.toUpperCase() : 'UNKNOWN'}
         </Tag>
      </div>
      <div className="flex justify-between items-center">
         <div className="text-lg font-semibold text-blue-600">
            {formatCurrency(record.total_amount)}
         </div>
         <Button size="small" icon={<EyeOutlined />}>Details</Button>
      </div>
      {record.items && record.items.length > 0 && (
         <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-600">
            {record.items.length} items: {record.items.map(i => i.product_name).join(', ').substring(0, 50)}...
         </div>
      )}
    </Card>
  );

  if (loading && orders.length === 0) {
     return <div className="p-12 text-center"><Spin /></div>;
  }

  if (orders.length === 0) {
     return <Empty description="No shop orders found" />;
  }

  return (
    <UnifiedResponsiveTable
       title="Shop Orders"
       columns={columns}
       dataSource={orders}
       mobileCardRenderer={OrderMobileCard}
       rowKey="id"
       loading={loading}
       pagination={{
         ...pagination,
         onChange: (page) => fetchOrders(page)
       }}
    />
  );
};

export default CustomerShopHistory;