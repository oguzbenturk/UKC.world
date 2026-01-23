/**
 * StayBookingPage
 * 
 * Main Stay booking page with overview of accommodation options.
 * Links to Hotel and Home pages with ability to book accommodation packages.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Typography, Button, Row, Col, Tag, Divider, Space, List } from 'antd';
import {
  EnvironmentOutlined,
  CalendarOutlined,
  PhoneOutlined,
  RightOutlined,
  CheckCircleOutlined,
  StarOutlined
} from '@ant-design/icons';
import { usePageSEO } from '@/shared/utils/seo';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import StudentBookingWizard from '@/features/students/components/StudentBookingWizard';

const { Title, Paragraph, Text } = Typography;

const StayBookingPage = () => {
  const navigate = useNavigate();
  const { formatCurrency, convertCurrency, userCurrency } = useCurrency();
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingInitialData, setBookingInitialData] = useState({});

  usePageSEO({
    title: 'Book Accommodation | Stay | UKC',
    description: 'Find the perfect accommodation for your kitesurfing vacation. Hotels, pool studios, and home options in Urla.'
  });

  // Convert EUR prices to user currency
  const formatPrice = (eurPrice) => {
    const converted = convertCurrency(eurPrice, 'EUR', userCurrency);
    return formatCurrency(converted, userCurrency);
  };

  const handleBookAccommodation = () => {
    // Open booking wizard on this page with accommodation category pre-selected
    setBookingInitialData({ serviceCategory: 'accommodation' });
    setBookingOpen(true);
  };

  const handleBookingClose = () => {
    setBookingOpen(false);
    setBookingInitialData({});
  };

  const accommodationTypes = [
    {
      key: 'hotel',
      title: 'Hotel',
      subtitle: 'Burlahan Otel',
      emoji: '🏨',
      description: 'Comfortable hotel accommodation with full amenities. Breakfast included, pool access, and professional service.',
      highlights: ['Breakfast included', 'Swimming pool', 'Daily housekeeping', 'Restaurant on-site'],
      priceFrom: 60,
      path: '/stay/hotel',
      color: 'blue'
    },
    {
      key: 'home',
      title: 'Home',
      subtitle: 'Pool Studios & Farm House',
      emoji: '🏠',
      description: 'Authentic home-style accommodations. Pool studios for couples, farm house for families, and budget-friendly staff options.',
      highlights: ['Self-catering options', 'Pool access', 'More space', 'Community atmosphere'],
      priceFrom: 25,
      path: '/stay/home',
      color: 'green'
    }
  ];

  const combinedPackages = [
    {
      key: 'weekend',
      title: 'Weekend Getaway',
      emoji: '🌊',
      includes: ['2 nights accommodation', '6 hours of lessons', 'Equipment rental'],
      price: 455,
      savings: '15% savings'
    },
    {
      key: 'week',
      title: 'Week Adventure',
      emoji: '🏄',
      includes: ['5 nights accommodation', '10 hours of lessons', 'Equipment rental'],
      price: 850,
      savings: '20% savings'
    },
    {
      key: 'immersion',
      title: 'Full Immersion',
      emoji: '⭐',
      includes: ['7 nights accommodation', '12 hours of lessons', 'Equipment rental', 'Video analysis'],
      price: 1100,
      savings: '25% savings'
    }
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Hero Section */}
      <div className="text-center mb-12">
        <Title level={1} className="!mb-4">
          🛏️ Book Accommodation
        </Title>
        <div className="flex items-center justify-center gap-2 mb-4">
          <EnvironmentOutlined className="text-sky-500" />
          <Text className="text-lg">Urla, Gülbahçe - İzmir, Turkey</Text>
        </div>
        <Paragraph className="text-lg text-gray-600 max-w-3xl mx-auto">
          Complete your kitesurfing experience with comfortable accommodation. 
          Choose between our partner hotel or unique home stays, both just minutes 
          from Urla Kite Center.
        </Paragraph>
        <Space className="mt-4">
          <Button
            type="primary"
            size="large"
            icon={<CalendarOutlined />}
            onClick={handleBookAccommodation}
          >
            Book Now
          </Button>
          <Button
            size="large"
            icon={<PhoneOutlined />}
            href="tel:+905071389196"
          >
            Call for Reservations
          </Button>
        </Space>
      </div>

      <Divider />

      {/* Accommodation Types */}
      <Title level={2} className="text-center mb-8">Choose Your Stay</Title>
      <Row gutter={[24, 24]} className="mb-12">
        {accommodationTypes.map((type) => (
          <Col xs={24} md={12} key={type.key}>
            <Card 
              className="h-full hover:shadow-xl transition-all cursor-pointer border-2 hover:border-sky-400"
              onClick={() => navigate(type.path)}
            >
              <div className="text-center mb-6">
                <span className="text-6xl">{type.emoji}</span>
              </div>
              <Title level={2} className="text-center !mb-1">{type.title}</Title>
              <Text type="secondary" className="block text-center text-lg mb-4">
                {type.subtitle}
              </Text>
              <Paragraph className="text-center text-gray-600 mb-6">
                {type.description}
              </Paragraph>
              <div className="mb-6">
                <List
                  size="small"
                  dataSource={type.highlights}
                  renderItem={(item) => (
                    <List.Item className="!py-2 !px-0 border-0 justify-center">
                      <CheckCircleOutlined className="text-green-500 mr-2" />
                      <Text>{item}</Text>
                    </List.Item>
                  )}
                />
              </div>
              <Divider />
              <div className="flex justify-between items-center">
                <div>
                  <Text type="secondary">From</Text>
                  <div>
                    <Text strong className="text-2xl" style={{ color: type.color === 'blue' ? '#3b82f6' : '#22c55e' }}>
                      {formatPrice(type.priceFrom)}
                    </Text>
                    <Text type="secondary"> / night</Text>
                  </div>
                </div>
                <Button type="primary" icon={<RightOutlined />}>
                  View Options
                </Button>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      {/* Combined Packages */}
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl p-8 mb-12">
        <div className="text-center mb-8">
          <Title level={2} className="!mb-2">
            <StarOutlined className="text-amber-500 mr-2" />
            Stay + Learn Packages
          </Title>
          <Paragraph className="text-gray-600">
            Save money with our combined accommodation and lesson packages!
          </Paragraph>
        </div>
        <Row gutter={[24, 24]}>
          {combinedPackages.map((pkg) => (
            <Col xs={24} md={8} key={pkg.key}>
              <Card className="h-full hover:shadow-lg transition-shadow text-center">
                <span className="text-4xl block mb-4">{pkg.emoji}</span>
                <Title level={4}>{pkg.title}</Title>
                <List
                  size="small"
                  className="mb-4"
                  dataSource={pkg.includes}
                  renderItem={(item) => (
                    <List.Item className="!py-1 !px-0 border-0 justify-center">
                      <CheckCircleOutlined className="text-green-500 mr-2" />
                      <Text className="text-sm">{item}</Text>
                    </List.Item>
                  )}
                />
                <Tag color="red" className="mb-4">{pkg.savings}</Tag>
                <div className="mb-4">
                  <Text type="secondary" className="text-sm">Starting from</Text>
                  <div>
                    <Text strong className="text-2xl text-amber-600">
                      {formatPrice(pkg.price)}
                    </Text>
                  </div>
                </div>
                <Button type="primary" block onClick={handleBookAccommodation}>
                  Book Package
                </Button>
              </Card>
            </Col>
          ))}
        </Row>
      </div>

      {/* Why Stay With Us */}
      <Title level={2} className="text-center mb-8">Why Book With UKC?</Title>
      <Row gutter={[24, 24]} className="mb-12">
        <Col xs={24} sm={12} md={6}>
          <Card className="text-center h-full hover:shadow-md transition-shadow">
            <div className="text-4xl mb-4">🎯</div>
            <Title level={4}>Convenience</Title>
            <Text type="secondary">All accommodations are close to the kite spot</Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="text-center h-full hover:shadow-md transition-shadow">
            <div className="text-4xl mb-4">💰</div>
            <Title level={4}>Best Prices</Title>
            <Text type="secondary">Direct booking means no middleman fees</Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="text-center h-full hover:shadow-md transition-shadow">
            <div className="text-4xl mb-4">🤝</div>
            <Title level={4}>Local Support</Title>
            <Text type="secondary">We're here to help with everything you need</Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="text-center h-full hover:shadow-md transition-shadow">
            <div className="text-4xl mb-4">🚐</div>
            <Title level={4}>Transport</Title>
            <Text type="secondary">Shuttle service to/from the kite center</Text>
          </Card>
        </Col>
      </Row>

      {/* Contact Info */}
      <Card className="text-center">
        <Title level={3}>Need Help Choosing?</Title>
        <Paragraph>
          Not sure which accommodation is right for you? Contact us and we'll help you find the perfect stay!
        </Paragraph>
        <Space size="large">
          <Button icon={<PhoneOutlined />} href="tel:+905071389196" size="large">
            +90 507 138 91 96
          </Button>
          <Button icon="📧" href="mailto:ukcturkey@gmail.com" size="large">
            ukcturkey@gmail.com
          </Button>
        </Space>
      </Card>

      {/* Booking Wizard Modal */}
      <StudentBookingWizard
        open={bookingOpen}
        onClose={handleBookingClose}
        initialData={bookingInitialData}
      />
    </div>
  );
};

export default StayBookingPage;
