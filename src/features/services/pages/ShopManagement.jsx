// src/features/services/pages/ShopManagement.jsx
// Combined Shop Management page with Products and Orders tabs

import { useState } from 'react';
import { Tabs, Card, Typography } from 'antd';
import { ShoppingOutlined, UnorderedListOutlined } from '@ant-design/icons';
import Products from '../../products/pages/Products';
import OrderManagement from '../../dashboard/pages/OrderManagement';

const { Title } = Typography;

const ShopManagement = () => {
  const [activeTab, setActiveTab] = useState('products');

  const tabItems = [
    {
      key: 'products',
      label: (
        <span>
          <ShoppingOutlined style={{ marginRight: 8 }} />
          Products
        </span>
      ),
      children: <Products />
    },
    {
      key: 'orders',
      label: (
        <span>
          <UnorderedListOutlined style={{ marginRight: 8 }} />
          Orders
        </span>
      ),
      children: <OrderManagement embedded />
    }
  ];

  return (
    <div style={{ padding: 24 }}>
      <Title level={3} style={{ marginBottom: 24 }}>
        <ShoppingOutlined style={{ marginRight: 12 }} />
        Shop Management
      </Title>
      
      <Card>
        <Tabs 
          activeKey={activeTab}
          onChange={setActiveTab}
          items={tabItems}
          size="large"
          style={{ marginTop: -12 }}
        />
      </Card>
    </div>
  );
};

export default ShopManagement;
