// src/features/manager/components/CommissionBreakdownCards.jsx
/* eslint-disable complexity */
import { Row, Col, Card, Progress } from 'antd';
import { ShoppingCartOutlined, CarOutlined } from '@ant-design/icons';
import { formatCurrency } from '@/shared/utils/formatters';

function CommissionBreakdownCards({ currentPeriod }) {
  const totalEarned = currentPeriod?.totalEarned || 0;
  const bookingsAmount = currentPeriod?.breakdown?.bookings?.amount || 0;
  const rentalsAmount = currentPeriod?.breakdown?.rentals?.amount || 0;
  
  const bookingsPercent = totalEarned > 0 ? Math.round((bookingsAmount / totalEarned) * 100) : 0;
  const rentalsPercent = totalEarned > 0 ? Math.round((rentalsAmount / totalEarned) * 100) : 0;

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} md={12}>
        <Card 
          title={
            <span className="flex items-center gap-2">
              <ShoppingCartOutlined className="text-blue-500" />
              Booking Commissions
            </span>
          }
          className="shadow-sm"
        >
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-600">This Month</span>
              <span className="font-semibold">
                {formatCurrency(bookingsAmount, 'EUR')}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Bookings Count</span>
              <span className="font-semibold">{currentPeriod?.breakdown?.bookings?.count || 0}</span>
            </div>
            <Progress 
              percent={bookingsPercent} 
              strokeColor="#1890ff"
              showInfo={true}
            />
          </div>
        </Card>
      </Col>

      <Col xs={24} md={12}>
        <Card 
          title={
            <span className="flex items-center gap-2">
              <CarOutlined className="text-green-500" />
              Rental Commissions
            </span>
          }
          className="shadow-sm"
        >
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-600">This Month</span>
              <span className="font-semibold">
                {formatCurrency(rentalsAmount, 'EUR')}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Rentals Count</span>
              <span className="font-semibold">{currentPeriod?.breakdown?.rentals?.count || 0}</span>
            </div>
            <Progress 
              percent={rentalsPercent} 
              strokeColor="#52c41a"
              showInfo={true}
            />
          </div>
        </Card>
      </Col>
    </Row>
  );
}

export default CommissionBreakdownCards;
