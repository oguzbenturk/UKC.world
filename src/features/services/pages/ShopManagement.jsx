// src/features/services/pages/ShopManagement.jsx
// Combined Shop Management page with Products and Orders tabs

import { useState } from 'react';
import { Tabs } from 'antd';
import { ShoppingOutlined, UnorderedListOutlined } from '@ant-design/icons';
import Products from '../../products/pages/Products';
import OrderManagement from '../../dashboard/pages/OrderManagement';

const ShopManagement = () => {
  const [activeTab, setActiveTab] = useState('products');

  const tabItems = [
    {
      key: 'products',
      label: (
        <span className="flex items-center gap-1.5">
          <ShoppingOutlined />
          Products
        </span>
      ),
      children: <Products />,
    },
    {
      key: 'orders',
      label: (
        <span className="flex items-center gap-1.5">
          <UnorderedListOutlined />
          Orders
        </span>
      ),
      children: <OrderManagement embedded />,
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Page header */}
      <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-100">
          <ShoppingOutlined className="text-base text-purple-600" />
        </div>
        <div>
          <h1 className="text-sm font-semibold text-slate-800 leading-none">Shop Management</h1>
          <p className="text-xs text-slate-400 mt-0.5 leading-none">Products, inventory &amp; orders</p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={tabItems}
        size="small"
        tabBarStyle={{
          margin: 0,
          paddingLeft: 16,
          paddingRight: 16,
          background: 'white',
          borderBottom: '1px solid #e2e8f0',
        }}
      />
    </div>
  );
};

export default ShopManagement;
