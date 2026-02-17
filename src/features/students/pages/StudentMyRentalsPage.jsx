/**
 * StudentMyRentalsPage
 * 
 * Page for students to view their equipment rental history.
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Typography, Button, Row, Col, Tag, Spin, Empty, Space, Divider } from 'antd';
import {
  ShoppingCartOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  CalendarOutlined,
  HistoryOutlined,
  ThunderboltOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { usePageSEO } from '@/shared/utils/seo';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { useAuth } from '@/shared/hooks/useAuth';
import DataService from '@/shared/services/dataService';

const { Title, Paragraph, Text } = Typography;

// Status configuration
const STATUS_CONFIG = {
  active: { color: 'blue', icon: <ClockCircleOutlined />, text: 'Active' },
  completed: { color: 'green', icon: <CheckCircleOutlined />, text: 'Completed' },
  cancelled: { color: 'red', icon: <ClockCircleOutlined />, text: 'Cancelled' },
  pending: { color: 'orange', icon: <ClockCircleOutlined />, text: 'Pending' },
  returned: { color: 'green', icon: <CheckCircleOutlined />, text: 'Returned' },
};

function StudentMyRentalsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { formatCurrency, convertCurrency, userCurrency } = useCurrency();
  const [rentals, setRentals] = useState([]);
  const [loading, setLoading] = useState(true);

  usePageSEO({
    title: 'My Equipment Rentals | UKC Academy',
    description: 'View your equipment rental history and active rentals.'
  });

  // Load user's rentals
  const loadRentals = useCallback(async () => {
    if (!user?.id) return;
    
    try {
      setLoading(true);
      const data = await DataService.getRentalsByUserId(user.id);
      setRentals(data || []);
    } catch {
      // Error loading rentals
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadRentals();
  }, [loadRentals]);

  const formatPrice = (price, currency = 'EUR') => {
    const converted = convertCurrency(price, currency, userCurrency);
    return formatCurrency(converted, userCurrency);
  };

  // Separate active and past rentals
  const activeRentals = rentals.filter(r => 
    r.status === 'active' || r.status === 'pending' || 
    (r.end_date && dayjs(r.end_date).isAfter(dayjs()))
  );
  const pastRentals = rentals.filter(r => 
    r.status === 'completed' || r.status === 'returned' || r.status === 'cancelled' ||
    (r.end_date && dayjs(r.end_date).isBefore(dayjs()) && r.status !== 'active')
  );

  const renderRentalCard = (rental) => {
    const status = STATUS_CONFIG[rental.status] || STATUS_CONFIG.pending;
    const rentalDate = rental.rental_date || rental.start_date;
    const equipment = Array.isArray(rental.equipment) ? rental.equipment : [];

    return (
      <Card 
        key={rental.id}
        className="rounded-xl border-gray-200 hover:shadow-md transition-shadow mb-4"
      >
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} sm={4}>
            <div className="w-16 h-16 bg-gradient-to-br from-orange-400 to-orange-600 rounded-lg flex items-center justify-center">
              <ThunderboltOutlined className="text-2xl text-white" />
            </div>
          </Col>
          <Col xs={24} sm={14}>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Text strong className="text-lg">
                  Rental #{rental.id}
                </Text>
                <Tag color={status.color} className="rounded-full">
                  {status.icon} {status.text}
                </Tag>
              </div>
              
              <div className="flex flex-wrap items-center gap-3 text-gray-600 text-sm">
                <span className="flex items-center gap-1">
                  <CalendarOutlined />
                  {rentalDate ? dayjs(rentalDate).format('MMM D, YYYY') : 'N/A'}
                </span>
                {rental.end_date && (
                  <>
                    <span className="text-gray-400">→</span>
                    <span>{dayjs(rental.end_date).format('MMM D, YYYY')}</span>
                  </>
                )}
                {rental.duration_hours && (
                  <span className="flex items-center gap-1">
                    <ClockCircleOutlined />
                    {rental.duration_hours}h
                  </span>
                )}
              </div>

              {/* Equipment List */}
              {equipment.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {equipment.map((eq) => (
                    <Tag key={eq.id || eq.name} color="blue" className="rounded">
                      {eq.name || `Equipment #${eq.id}`}
                    </Tag>
                  ))}
                </div>
              )}
            </div>
          </Col>
          <Col xs={24} sm={6} className="text-right">
            <div className="text-2xl font-bold text-orange-600">
              {formatPrice(rental.total_price || 0)}
            </div>
          </Col>
        </Row>
      </Card>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-5xl px-4 py-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <Title level={2} className="!mb-1">
              <HistoryOutlined className="mr-2" />
              My Equipment Rentals
            </Title>
            <Paragraph className="text-gray-600 !mb-0">
              View your rental history and active equipment
            </Paragraph>
          </div>
          <Button
            type="primary"
            size="large"
            icon={<ShoppingCartOutlined />}
            onClick={() => navigate('/rental/book-equipment')}
            className="bg-orange-500 hover:bg-orange-600 border-none rounded-lg"
          >
            Book Equipment
          </Button>
        </div>

        {rentals.length === 0 ? (
          <Card className="rounded-xl shadow-sm">
            <Empty 
              description="You haven't rented any equipment yet"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              className="py-12"
            >
              <Button 
                type="primary" 
                icon={<ShoppingCartOutlined />}
                onClick={() => navigate('/rental/book-equipment')}
                className="bg-orange-500 hover:bg-orange-600 border-none"
              >
                Book Equipment Now
              </Button>
            </Empty>
          </Card>
        ) : (
          <>
            {/* Active Rentals */}
            {activeRentals.length > 0 && (
              <div className="mb-8">
                <Title level={4} className="mb-4 flex items-center gap-2">
                  <ClockCircleOutlined className="text-blue-500" />
                  Active Rentals
                </Title>
                {activeRentals.map(renderRentalCard)}
              </div>
            )}

            {/* Past Rentals */}
            {pastRentals.length > 0 && (
              <div>
                <Title level={4} className="mb-4 flex items-center gap-2">
                  <CheckCircleOutlined className="text-green-500" />
                  Past Rentals
                </Title>
                {pastRentals.map(renderRentalCard)}
              </div>
            )}

            {/* Stats */}
            <Divider />
            <div className="text-center text-gray-500">
              <Space size="large">
                <span>Total Rentals: {rentals.length}</span>
                <span>Active: {activeRentals.length}</span>
                <span>Completed: {pastRentals.length}</span>
              </Space>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default StudentMyRentalsPage;
