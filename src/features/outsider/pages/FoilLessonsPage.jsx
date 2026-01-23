/**
 * FoilLessonsPage
 * 
 * Informational page about hydrofoil/foil lessons.
 * Shows lesson packages, pricing, and what's included.
 * Opens booking wizard directly on this page without navigation.
 */

import { useState } from 'react';
import { Card, Typography, Button, Row, Col, Tag, Divider, Space, List, Alert } from 'antd';
import {
  ThunderboltOutlined,
  SafetyOutlined,
  CheckCircleOutlined,
  CalendarOutlined,
  RiseOutlined,
  ExperimentOutlined
} from '@ant-design/icons';
import { usePageSEO } from '@/shared/utils/seo';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import StudentBookingWizard from '@/features/students/components/StudentBookingWizard';

const { Title, Paragraph, Text } = Typography;

const FoilLessonsPage = () => {
  const { formatCurrency, convertCurrency, userCurrency } = useCurrency();
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingInitialData, setBookingInitialData] = useState({});

  usePageSEO({
    title: 'Foil Lessons | UKC Academy',
    description: 'Learn hydrofoiling with expert instruction. Experience the magic of flying above the water.'
  });

  // Convert EUR prices to user currency
  const formatPrice = (eurPrice) => {
    const converted = convertCurrency(eurPrice, 'EUR', userCurrency);
    return formatCurrency(converted, userCurrency);
  };

  const handleBookService = () => {
    // Open booking wizard on this page with lesson category pre-selected
    setBookingInitialData({ serviceCategory: 'lesson' });
    setBookingOpen(true);
  };

  const handleBookingClose = () => {
    setBookingOpen(false);
    setBookingInitialData({});
  };

  const packages = [
    {
      key: 'hydrofoil-intro',
      title: 'Hydrofoil Introduction',
      subtitle: 'Kite Hydrofoiling',
      icon: <RiseOutlined className="text-4xl text-cyan-500" />,
      description: 'Already a competent kiter? Take your skills to the next level by learning to fly above the water on a hydrofoil. Experience the smoothest, most efficient way to ride!',
      options: [
        { hours: 1, price: 70, sessions: '1hr session' },
        { hours: 4, price: 260, sessions: '4 x 1hr sessions' }
      ],
      included: [
        'Foil equipment provided',
        'Safety briefing for foiling',
        'Beach start practice',
        'Body position coaching',
        'Touch-and-go technique',
        'Height control training'
      ],
      requirements: [
        'Must be able to ride upwind consistently',
        'Basic transitions (heel-to-toe)',
        'Good board control'
      ],
      color: 'cyan'
    },
    {
      key: 'hydrofoil-boat',
      title: 'Hydrofoil with Boat',
      subtitle: 'Boat-Assisted Sessions',
      icon: <ExperimentOutlined className="text-4xl text-blue-500" />,
      description: 'Learn faster with boat assistance! The boat helps you get up on the foil more easily and provides quick retrieval when you fall. Perfect for accelerated learning.',
      options: [
        { hours: 1, price: 100, sessions: '1hr session with boat' }
      ],
      included: [
        'Dedicated boat support',
        'Faster learning curve',
        'More attempts per session',
        'Quick rescue retrieval',
        'Video review option',
        'All foil equipment'
      ],
      requirements: [
        'Must be able to ride upwind consistently',
        'Recommended after 2+ shore-based foil sessions'
      ],
      color: 'blue'
    },
    {
      key: 'foil-progression',
      title: 'Foil Progression Package',
      subtitle: 'Complete Foil Course',
      icon: <ThunderboltOutlined className="text-4xl text-purple-500" />,
      description: 'The complete package for serious foilers. Start with basics and progress to carving turns, jibes, and advanced maneuvers. Includes a mix of shore and boat sessions.',
      options: [
        { hours: 6, price: 450, sessions: 'Mixed shore & boat sessions' }
      ],
      included: [
        '4 x 1hr shore-based sessions',
        '2 x 1hr boat-assisted sessions',
        'Video analysis',
        'Foil theory session',
        'Carving & turning techniques',
        'Tacking introduction'
      ],
      requirements: [
        'Intermediate kiting level',
        'Comfortable in light wind'
      ],
      color: 'purple'
    }
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Hero Section */}
      <div className="text-center mb-12">
        <Title level={1} className="!mb-4">
          🛸 Foil Lessons
        </Title>
        <Paragraph className="text-lg text-gray-600 max-w-3xl mx-auto">
          Experience the magic of flying above the water! Hydrofoiling is the future of 
          water sports—silent, smooth, and incredibly efficient. Once you try it, you'll 
          be hooked!
        </Paragraph>
        <Button
          type="primary"
          size="large"
          icon={<CalendarOutlined />}
          onClick={handleBookService}
          className="mt-4"
        >
          Book a Service
        </Button>
      </div>

      <Divider />

      {/* Prerequisites Notice */}
      <Alert
        type="info"
        showIcon
        icon={<SafetyOutlined />}
        message="Prerequisites for Foil Lessons"
        description="Hydrofoil lessons are designed for kiters who can already ride upwind consistently and have good board control. If you're new to kitesurfing, we recommend starting with our Kite Lessons first."
        className="mb-8"
      />

      {/* Why Learn Foiling */}
      <div className="mb-12">
        <Title level={2} className="text-center mb-8">Why Learn Hydrofoiling?</Title>
        <Row gutter={[24, 24]}>
          <Col xs={24} sm={12} md={6}>
            <Card className="text-center h-full">
              <div className="text-4xl mb-4">🌬️</div>
              <Title level={4}>Light Wind Riding</Title>
              <Text type="secondary">Ride in as little as 8-10 knots of wind</Text>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card className="text-center h-full">
              <div className="text-4xl mb-4">🔇</div>
              <Title level={4}>Silent & Smooth</Title>
              <Text type="secondary">Glide above the chop in total silence</Text>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card className="text-center h-full">
              <div className="text-4xl mb-4">⚡</div>
              <Title level={4}>Super Efficient</Title>
              <Text type="secondary">Less power needed, more sessions per year</Text>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card className="text-center h-full">
              <div className="text-4xl mb-4">🎢</div>
              <Title level={4}>Addictive Feeling</Title>
              <Text type="secondary">The sensation of flying is unlike anything else</Text>
            </Card>
          </Col>
        </Row>
      </div>

      {/* Lesson Packages */}
      <Title level={2} className="text-center mb-8">Our Foil Packages</Title>
      <Row gutter={[24, 24]}>
        {packages.map((pkg) => (
          <Col xs={24} lg={8} key={pkg.key}>
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
                    <div key={`${pkg.key}-${opt.hours}`} className="flex justify-between items-center bg-gray-50 p-3 rounded-lg">
                      <div>
                        <Text strong>{opt.hours} hour{opt.hours > 1 ? 's' : ''}</Text>
                        <Text type="secondary" className="ml-2">({opt.sessions})</Text>
                      </div>
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

              {pkg.requirements && (
                <div className="mb-4 p-3 bg-amber-50 rounded-lg">
                  <Text strong className="block mb-2 text-amber-700">Requirements:</Text>
                  <List
                    size="small"
                    dataSource={pkg.requirements}
                    renderItem={(item) => (
                      <List.Item className="!py-1 !px-0 border-none text-amber-600">
                        • {item}
                      </List.Item>
                    )}
                  />
                </div>
              )}

              <Button
                type="primary"
                block
                icon={<CalendarOutlined />}
                onClick={handleBookService}
              >
                Book {pkg.title}
              </Button>
            </Card>
          </Col>
        ))}
      </Row>

      {/* Bottom CTA */}
      <div className="text-center mt-12 p-8 bg-gradient-to-r from-cyan-50 to-blue-50 rounded-xl">
        <Title level={3}>Ready to Fly Above the Water?</Title>
        <Paragraph className="text-gray-600 mb-4">
          Book your first foil session and discover why riders all over the world are falling in love with hydrofoiling.
        </Paragraph>
        <Button
          type="primary"
          size="large"
          icon={<RiseOutlined />}
          onClick={handleBookService}
        >
          Book Your Foil Session
        </Button>
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

export default FoilLessonsPage;
