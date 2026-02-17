/**
 * RentalPremiumPage
 * 
 * Informational page about premium rental equipment.
 * Shows Duotone SLS and D/LAB equipment with pricing.
 * Opens booking wizard directly on this page without navigation.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Typography, Button, Row, Col, Tag, Divider, Space, List, Alert } from 'antd';
import {
  StarOutlined,
  CheckCircleOutlined,
  CalendarOutlined,
  ThunderboltOutlined,
  RocketOutlined
} from '@ant-design/icons';
import { usePageSEO } from '@/shared/utils/seo';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import StudentBookingWizard from '@/features/students/components/StudentBookingWizard';

const { Title, Paragraph, Text } = Typography;

const RentalPremiumPage = () => {
  const navigate = useNavigate();
  const { formatCurrency, convertCurrency, userCurrency } = useCurrency();
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingInitialData, setBookingInitialData] = useState({});

  usePageSEO({
    title: 'Premium Rental Equipment | UKC Academy',
    description: 'Rent the latest Duotone SLS and D/LAB premium equipment. Experience the best gear in the industry.'
  });

  // Convert EUR prices to user currency
  const formatPrice = (eurPrice) => {
    const converted = convertCurrency(eurPrice, 'EUR', userCurrency);
    return formatCurrency(converted, userCurrency);
  };

  const handleBookRental = () => {
    // Open booking wizard on this page with rental category pre-selected
    setBookingInitialData({ serviceCategory: 'rental' });
    setBookingOpen(true);
  };

  const handleBookingClose = () => {
    setBookingOpen(false);
    setBookingInitialData({});
  };

  const packages = [
    {
      key: 'sls-hourly',
      title: 'SLS Equipment',
      subtitle: 'Hourly Rental',
      icon: <StarOutlined className="text-4xl text-amber-500" />,
      description: 'The Duotone SLS (Strong Light Superior) range offers the ultimate in performance. Lighter, stiffer, and more responsive than standard equipment.',
      options: [
        { duration: '1 hour', price: 40 },
        { duration: '4 hours (Half Day)', price: 65 },
        { duration: '8 hours (Full Day)', price: 85 },
        { duration: '1 Week', price: 510 }
      ],
      included: [
        'Latest SLS kite model',
        'SLS board of your choice',
        'Premium harness & bar',
        'ION wetsuit',
        'Safety equipment'
      ],
      color: 'gold'
    },
    {
      key: 'dlab-hourly',
      title: 'D/LAB Equipment',
      subtitle: 'Top-Tier Performance',
      icon: <RocketOutlined className="text-4xl text-purple-500" />,
      description: 'D/LAB is Duotone\'s most advanced line. Hand-crafted, limited production equipment for riders who demand absolute perfection.',
      options: [
        { duration: '1 hour', price: 48 },
        { duration: '4 hours (Half Day)', price: 75 },
        { duration: '8 hours (Full Day)', price: 95 }
      ],
      included: [
        'D/LAB kite (limited edition)',
        'D/LAB or SLS board',
        'Premium harness & bar',
        'ION wetsuit',
        'Priority rescue support'
      ],
      color: 'purple'
    },
    {
      key: 'foil-board',
      title: 'SLS Foil Board',
      subtitle: 'Hydrofoil Equipment',
      icon: <ThunderboltOutlined className="text-4xl text-cyan-500" />,
      description: 'Premium foil boards for experienced riders. Perfect for light wind sessions or taking your foiling to the next level.',
      options: [
        { duration: '1 day', price: 27 },
        { duration: '1 week', price: 135 }
      ],
      included: [
        'SLS foil board',
        'Complete foil set',
        'Board bag',
        'Foil safety briefing'
      ],
      color: 'cyan'
    }
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Hero Section */}
      <div className="text-center mb-12">
        <Title level={1} className="!mb-4">
          ⭐ Premium Equipment Rental
        </Title>
        <Paragraph className="text-lg text-gray-600 max-w-3xl mx-auto">
          Experience the difference with Duotone's SLS and D/LAB equipment. 
          Our premium range offers the lightest, most responsive gear available. 
          Perfect for advanced riders or those who want the absolute best experience.
        </Paragraph>
        <Button
          type="primary"
          size="large"
          icon={<CalendarOutlined />}
          onClick={handleBookRental}
          className="mt-4"
        >
          Book Premium Equipment
        </Button>
      </div>

      <Divider />

      {/* Premium Badge */}
      <Alert
        type="warning"
        showIcon
        icon={<StarOutlined />}
        message="Official Duotone Test Center"
        description="As Turkey's only Duotone Pro Test Center, we offer the latest equipment for testing. Try before you buy!"
        className="mb-8"
      />

      {/* Why Premium */}
      <div className="mb-12">
        <Title level={2} className="text-center mb-8">Why Choose Premium?</Title>
        <Row gutter={[24, 24]}>
          <Col xs={24} sm={12} md={6}>
            <Card className="text-center h-full">
              <div className="text-4xl mb-4">🪶</div>
              <Title level={4}>Ultra Light</Title>
              <Text type="secondary">SLS technology reduces weight by up to 20%</Text>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card className="text-center h-full">
              <div className="text-4xl mb-4">⚡</div>
              <Title level={4}>More Response</Title>
              <Text type="secondary">Stiffer frames for instant feedback</Text>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card className="text-center h-full">
              <div className="text-4xl mb-4">🔧</div>
              <Title level={4}>Daily Serviced</Title>
              <Text type="secondary">Equipment checked and maintained every day</Text>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card className="text-center h-full">
              <div className="text-4xl mb-4">🆕</div>
              <Title level={4}>Latest Models</Title>
              <Text type="secondary">2024 season equipment updated annually</Text>
            </Card>
          </Col>
        </Row>
      </div>

      {/* Rental Packages */}
      <Title level={2} className="text-center mb-8">Premium Rental Options</Title>
      <Row gutter={[24, 24]}>
        {packages.map((pkg) => (
          <Col xs={24} md={8} key={pkg.key}>
            <Card 
              className="h-full hover:shadow-lg transition-shadow"
              title={
                <div className="flex items-center gap-4">
                  {pkg.icon}
                  <div>
                    <div className="text-xl font-semibold">{pkg.title}</div>
                    <div className="text-sm text-gray-500 font-normal">{pkg.subtitle}</div>
                  </div>
                </div>
              }
            >
              <Paragraph>{pkg.description}</Paragraph>
              
              <div className="mb-4">
                <Text strong className="block mb-2">Pricing:</Text>
                <Space direction="vertical" className="w-full">
                  {pkg.options.map((opt) => (
                    <div key={`${pkg.key}-${opt.duration}`} className="flex justify-between items-center bg-gray-50 p-3 rounded-lg">
                      <Text strong>{opt.duration}</Text>
                      <Tag color={pkg.color} className="text-base px-3 py-1">
                        {formatPrice(opt.price)}
                      </Tag>
                    </div>
                  ))}
                </Space>
              </div>

              <div className="mb-4">
                <Text strong className="block mb-2">What's Included:</Text>
                <List
                  size="small"
                  dataSource={pkg.included}
                  renderItem={(item) => (
                    <List.Item className="!py-1 !px-0 border-none">
                      <CheckCircleOutlined className="text-green-500 mr-2" />
                      {item}
                    </List.Item>
                  )}
                />
              </div>

              <Button
                type="primary"
                block
                icon={<CalendarOutlined />}
                onClick={handleBookRental}
              >
                Book {pkg.title}
              </Button>
            </Card>
          </Col>
        ))}
      </Row>

      {/* Bottom CTA */}
      <div className="text-center mt-12 p-8 bg-gradient-to-r from-amber-50 to-purple-50 rounded-xl">
        <Title level={3}>Ready for the Premium Experience?</Title>
        <Paragraph className="text-gray-600 mb-4">
          Feel the difference that top-tier equipment makes. Book your premium rental today!
        </Paragraph>
        <Space>
          <Button
            type="primary"
            size="large"
            icon={<StarOutlined />}
            onClick={handleBookRental}
          >
            Book Premium Gear
          </Button>
          <Button
            size="large"
            onClick={() => navigate('/rental/standard')}
          >
            View Standard Rentals
          </Button>
        </Space>
      </div>

      {/* Booking Wizard Modal */}
      <StudentBookingWizard
        open={bookingOpen}
        onClose={handleBookingClose}
        initialData={bookingInitialData}
      />
    </div>
  );
};

export default RentalPremiumPage;
