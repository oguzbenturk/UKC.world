// src/features/services/pages/ShopOrdersPage.jsx
// Standalone Shop Orders page for admin (Orders only, no Products)

import OrderManagement from '@/features/dashboard/pages/OrderManagement';
import { Typography } from 'antd';
import { ShoppingCartOutlined } from '@ant-design/icons';

const { Title } = Typography;

const ShopOrdersPage = () => {
  return (
    <div style={{ padding: 24 }}>
      <Title level={3} style={{ marginBottom: 24 }}>
        <ShoppingCartOutlined style={{ marginRight: 12 }} />
        Shop Orders
      </Title>
      
      <OrderManagement embedded />
    </div>
  );
};

export default ShopOrdersPage;
