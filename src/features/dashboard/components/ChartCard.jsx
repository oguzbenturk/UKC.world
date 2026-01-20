// src/features/dashboard/components/ChartCard.jsx
import { Card } from 'antd';

const ChartCard = ({ title, children, isLoading }) => (
  <Card title={title} className="shadow-sm" loading={isLoading}>
    <div className="h-72">
      {isLoading ? null : children}
    </div>
  </Card>
);

export default ChartCard;
