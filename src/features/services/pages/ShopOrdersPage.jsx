// src/features/services/pages/ShopOrdersPage.jsx
// Standalone Shop Orders page for admin (Orders only, no Products)

import OrderManagement from '@/features/dashboard/pages/OrderManagement';

const ShopOrdersPage = () => {
  return (
    <div style={{ padding: 24 }}>
      <OrderManagement embedded />
    </div>
  );
};

export default ShopOrdersPage;
