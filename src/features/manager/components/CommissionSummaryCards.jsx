// src/features/manager/components/CommissionSummaryCards.jsx
/* eslint-disable complexity */
import { Row, Col, Card, Statistic } from 'antd';
import { 
  CalendarOutlined, 
  ClockCircleOutlined, 
  RiseOutlined, 
  FallOutlined,
  CheckCircleOutlined 
} from '@ant-design/icons';
import { formatCurrency } from '@/shared/utils/formatters';

function CommissionSummaryCards({ dashboardData }) {
  const { currentPeriod, previousPeriod, yearToDate, comparison } = dashboardData || {};
  const earningsChangePercent = parseFloat(comparison?.earningsChangePercent) || 0;
  const isPositiveChange = earningsChangePercent >= 0;

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} sm={12} lg={6}>
        <Card className="shadow-sm h-full">
          <Statistic
            title={
              <span className="flex items-center gap-1">
                <CalendarOutlined />
                This Month
              </span>
            }
            value={currentPeriod?.totalEarned || 0}
            precision={2}
            prefix="€"
            valueStyle={{ color: '#3f8600' }}
          />
          <div className="mt-2 text-sm text-gray-500">
            {currentPeriod?.breakdown?.bookings?.count || 0} bookings, {currentPeriod?.breakdown?.rentals?.count || 0} rentals
          </div>
        </Card>
      </Col>

      <Col xs={24} sm={12} lg={6}>
        <Card className="shadow-sm h-full">
          <Statistic
            title={
              <span className="flex items-center gap-1">
                <ClockCircleOutlined />
                Pending
              </span>
            }
            value={currentPeriod?.pending?.amount || 0}
            precision={2}
            prefix="€"
            valueStyle={{ color: '#faad14' }}
          />
          <div className="mt-2 text-sm text-gray-500">
            {currentPeriod?.pending?.count || 0} transactions awaiting payout
          </div>
        </Card>
      </Col>

      <Col xs={24} sm={12} lg={6}>
        <Card className="shadow-sm h-full">
          <Statistic
            title={
              <span className="flex items-center gap-1">
                {isPositiveChange ? <RiseOutlined /> : <FallOutlined />}
                vs Last Month
              </span>
            }
            value={Math.abs(earningsChangePercent)}
            precision={1}
            prefix={isPositiveChange ? '+' : '-'}
            suffix="%"
            valueStyle={{ color: isPositiveChange ? '#3f8600' : '#cf1322' }}
          />
          <div className="mt-2 text-sm text-gray-500">
            Previous: {formatCurrency(previousPeriod?.totalEarned || 0, 'EUR')}
          </div>
        </Card>
      </Col>

      <Col xs={24} sm={12} lg={6}>
        <Card className="shadow-sm h-full">
          <Statistic
            title={
              <span className="flex items-center gap-1">
                <CheckCircleOutlined />
                Year to Date
              </span>
            }
            value={yearToDate?.totalEarned || 0}
            precision={2}
            prefix="€"
            valueStyle={{ color: '#1890ff' }}
          />
          <div className="mt-2 text-sm text-gray-500">
            Total paid: {formatCurrency(yearToDate?.paid?.amount || 0, 'EUR')}
          </div>
        </Card>
      </Col>
    </Row>
  );
}

export default CommissionSummaryCards;
