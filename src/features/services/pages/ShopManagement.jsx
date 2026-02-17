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
    <div className="p-3 sm:p-6">
      <Title 
        level={3} 
        className="!text-lg sm:!text-xl md:!text-2xl !mb-4 sm:!mb-6"
      >
        <ShoppingOutlined className="mr-2 sm:mr-3" />
        Shop Management
      </Title>
      
      <Card>
        <Tabs 
          activeKey={activeTab}
          onChange={setActiveTab}
          items={tabItems}
          size="middle"
          className="-mt-3"
        />
      </Card>
    </div>
  );
};

export default ShopManagement;
