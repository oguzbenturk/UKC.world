/**
 * StudentBookEquipmentPage
 * 
 * Page for students to browse and book rental equipment.
 * Opens the booking wizard with rental category pre-selected.
 */

import { useState, useEffect } from 'react';
import { Card, Typography, Button, Row, Col, Tag, Spin, Empty, Space, Divider } from 'antd';
import {
  ShoppingCartOutlined,
  ClockCircleOutlined,
  SafetyOutlined,
  ThunderboltOutlined
} from '@ant-design/icons';
import { usePageSEO } from '@/shared/utils/seo';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import StudentBookingWizard from '@/features/students/components/StudentBookingWizard';
import apiClient from '@/shared/services/apiClient';

const { Title, Paragraph } = Typography;

function StudentBookEquipmentPage() {
  const { formatCurrency, convertCurrency, userCurrency } = useCurrency();
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingInitialData, setBookingInitialData] = useState({});
  const [rentalServices, setRentalServices] = useState([]);
  const [loading, setLoading] = useState(true);

  usePageSEO({
    title: 'Book Equipment | UKC Academy',
    description: 'Browse and book rental equipment for your kitesurfing session.'
  });

  // Load rental services
  useEffect(() => {
    const loadRentalServices = async () => {
      try {
        setLoading(true);
        const response = await apiClient.get('/services', {
          params: { serviceType: 'rental', status: 'active' }
        });
        setRentalServices(response.data || []);
      } catch {
        // Error loading rental services
      } finally {
        setLoading(false);
      }
    };
    loadRentalServices();
  }, []);

  const formatPrice = (eurPrice) => {
    const converted = convertCurrency(eurPrice, 'EUR', userCurrency);
    return formatCurrency(converted, userCurrency);
  };

  const handleBookEquipment = (service = null) => {
    const initialData = { serviceCategory: 'rental' };
    if (service) {
      initialData.serviceId = service.id;
    }
    setBookingInitialData(initialData);
    setBookingOpen(true);
  };

  const handleBookingClose = () => {
    setBookingOpen(false);
    setBookingInitialData({});
  };

  // Group services by type
  const groupedServices = rentalServices.reduce((acc, service) => {
    const type = service.name?.toLowerCase().includes('premium') ? 'premium' : 'standard';
    if (!acc[type]) acc[type] = [];
    acc[type].push(service);
    return acc;
  }, {});

  const renderServiceCard = (service) => {
    const imageUrl = service.image_url 
      ? (service.image_url.startsWith('http') ? service.image_url : `${import.meta.env.VITE_API_URL}${service.image_url}`)
      : null;

    return (
      <Col xs={24} sm={12} lg={8} key={service.id}>
        <Card
          className="h-full hover:shadow-xl transition-all duration-300 rounded-xl border-gray-200"
          cover={
            imageUrl ? (
              <div className="h-48 overflow-hidden rounded-t-xl">
                <img 
                  src={imageUrl}
                  alt={service.name}
                  className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                />
              </div>
            ) : (
              <div className="h-48 bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center rounded-t-xl">
                <ThunderboltOutlined className="text-6xl text-white opacity-80" />
              </div>
            )
          }
        >
          <div className="flex justify-between items-start mb-3">
            <h3 className="text-lg font-semibold text-gray-800">{service.name}</h3>
            {service.name?.toLowerCase().includes('premium') && (
              <Tag color="gold" className="rounded-full">Premium</Tag>
            )}
          </div>
          
          <div className="space-y-3 mb-4">
            {service.description && (
              <p className="text-gray-500 text-sm line-clamp-2 leading-relaxed">
                {service.description}
              </p>
            )}
            
            <div className="flex items-center gap-2 text-gray-600 text-sm">
              <ClockCircleOutlined />
              <span>{service.duration || 60} min</span>
            </div>

            <div className="flex items-baseline justify-between pt-2 border-t border-gray-100">
              <div>
                <span className="text-2xl font-bold text-orange-600">
                  {formatPrice(service.price)}
                </span>
              </div>
            </div>
          </div>

          <Button 
            type="primary" 
            icon={<ShoppingCartOutlined />}
            onClick={() => handleBookEquipment(service)}
            className="w-full h-10 bg-orange-500 hover:bg-orange-600 border-none rounded-lg font-medium"
            size="large"
          >
            Book Now
          </Button>
        </Card>
      </Col>
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
      <div className="mx-auto max-w-7xl px-4 py-6">
        {/* Header */}
        <div className="text-center mb-8">
          <Title level={1} className="!mb-2">
            🏄 Book Equipment
          </Title>
          <Paragraph className="text-gray-600 text-lg max-w-2xl mx-auto">
            Rent quality Duotone equipment for your session. All gear is maintained daily and includes safety equipment.
          </Paragraph>
          <Space className="mt-4">
            <Tag icon={<SafetyOutlined />} color="green">Safety Equipment Included</Tag>
            <Tag icon={<ClockCircleOutlined />} color="blue">Hourly & Daily Rates</Tag>
          </Space>
        </div>

        {/* Quick Book Button */}
        <div className="text-center mb-8">
          <Button
            type="primary"
            size="large"
            icon={<ShoppingCartOutlined />}
            onClick={() => handleBookEquipment()}
            className="h-12 px-8 bg-orange-500 hover:bg-orange-600 border-none rounded-lg font-medium text-lg"
          >
            Quick Book Equipment
          </Button>
        </div>

        <Divider />

        {/* Equipment Grid */}
        {rentalServices.length === 0 ? (
          <Card className="rounded-xl shadow-sm">
            <Empty 
              description="No rental equipment available at the moment"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              className="py-12"
            >
              <Button type="primary" onClick={() => handleBookEquipment()}>
                Contact Us for Rentals
              </Button>
            </Empty>
          </Card>
        ) : (
          <>
            {/* Standard Equipment */}
            {groupedServices.standard?.length > 0 && (
              <>
                <Title level={3} className="mb-4">Standard Equipment</Title>
                <Row gutter={[16, 16]} className="mb-8">
                  {groupedServices.standard.map(renderServiceCard)}
                </Row>
              </>
            )}

            {/* Premium Equipment */}
            {groupedServices.premium?.length > 0 && (
              <>
                <Title level={3} className="mb-4">⭐ Premium Equipment</Title>
                <Row gutter={[16, 16]}>
                  {groupedServices.premium.map(renderServiceCard)}
                </Row>
              </>
            )}

            {/* Show all if not grouped */}
            {!groupedServices.standard?.length && !groupedServices.premium?.length && (
              <Row gutter={[16, 16]}>
                {rentalServices.map(renderServiceCard)}
              </Row>
            )}
          </>
        )}
      </div>

      {/* Booking Wizard */}
      <StudentBookingWizard
        open={bookingOpen}
        onClose={handleBookingClose}
        initialData={bookingInitialData}
      />
    </div>
  );
}

export default StudentBookEquipmentPage;
