/**
 * KiteLessonsPage
 * 
 * Informational page about kitesurfing lessons.
 * Shows lesson packages, pricing, and what's included.
 * Opens booking wizard directly on this page without navigation.
 */

import { useState } from 'react';
import { Card, Typography, Button, Row, Col, Tag, Divider, Space, List } from 'antd';
import {
  RocketOutlined,
  TeamOutlined,
  SafetyOutlined,
  ThunderboltOutlined,
  CheckCircleOutlined,
  CalendarOutlined
} from '@ant-design/icons';
import { usePageSEO } from '@/shared/utils/seo';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import StudentBookingWizard from '@/features/students/components/StudentBookingWizard';

const { Title, Paragraph, Text } = Typography;

const KiteLessonsPage = () => {
  const { formatCurrency, convertCurrency, userCurrency } = useCurrency();
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingInitialData, setBookingInitialData] = useState({});

  usePageSEO({
    title: 'Kite Lessons | UKC Academy',
    description: 'Learn kitesurfing with our experienced instructors. From beginner to advanced, we have packages for everyone.'
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
      key: 'beginner',
      title: 'Beginner Package',
      subtitle: 'Private Lessons',
      icon: <RocketOutlined className="text-4xl text-green-500" />,
      description: 'Perfect for first-timers! Our experienced instructors will guide you through the basics of kitesurfing, from kite control to your first water start.',
      options: [
        { hours: 6, price: 420, sessions: '3 x 2hr sessions' },
        { hours: 10, price: 650, sessions: '5 x 2hr sessions' },
        { hours: 12, price: 720, sessions: '6 x 2hr sessions' }
      ],
      included: [
        'All equipment provided',
        'Safety briefing',
        'Kite control fundamentals',
        'Body dragging techniques',
        'Water start introduction',
        'Radio helmet communication'
      ],
      color: 'green'
    },
    {
      key: 'group',
      title: 'Group Package',
      subtitle: 'Semi-Private Lessons (2 students)',
      icon: <TeamOutlined className="text-4xl text-blue-500" />,
      description: 'Learn with a friend! Share the experience and cost with semi-private lessons. Great for couples or friends who want to progress together.',
      options: [
        { hours: 6, price: 280, sessions: '3 x 2hr sessions', perPerson: true },
        { hours: 9, price: 420, sessions: '3 x 3hr sessions', perPerson: true }
      ],
      included: [
        'All equipment provided',
        'Maximum 2 students per instructor',
        'Shared kite time',
        'Safety briefing',
        'Progress tracking'
      ],
      color: 'blue'
    },
    {
      key: 'supervision',
      title: 'Supervision',
      subtitle: 'For Independent Practice',
      icon: <SafetyOutlined className="text-4xl text-orange-500" />,
      description: 'Already know the basics? Get supervised practice time with an instructor watching over you for safety and occasional tips.',
      options: [
        { hours: 1, price: 60, sessions: '1hr session' },
        { hours: 4, price: 200, sessions: '4 x 1hr sessions' }
      ],
      included: [
        'Safety supervision',
        'Rescue support if needed',
        'Occasional tips and corrections',
        'Use of school zone'
      ],
      color: 'orange'
    },
    {
      key: 'advanced',
      title: 'Advanced Coaching',
      subtitle: 'Take Your Skills Further',
      icon: <ThunderboltOutlined className="text-4xl text-purple-500" />,
      description: 'Ready to progress? Work on transitions, jumps, wave riding, and more advanced techniques with personalized coaching.',
      options: [
        { hours: 1, price: 80, sessions: '1hr session' },
        { hours: 4, price: 280, sessions: '4 x 1hr sessions' }
      ],
      included: [
        'Video analysis available',
        'Trick progression',
        'Wave riding techniques',
        'Jump training',
        'Personalized feedback'
      ],
      color: 'purple'
    }
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Hero Section */}
      <div className="text-center mb-12">
        <Title level={1} className="!mb-4">
          🪁 Kite Lessons
        </Title>
        <Paragraph className="text-lg text-gray-600 max-w-3xl mx-auto">
          Learn to kitesurf in one of Turkey's best spots! Our IKO-certified instructors 
          will take you from your first kite flight to riding the waves. With consistent 
          thermal winds and shallow waters, Urla is the perfect place to learn.
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

      {/* Why Learn With Us */}
      <div className="mb-12">
        <Title level={2} className="text-center mb-8">Why Learn With Us?</Title>
        <Row gutter={[24, 24]}>
          <Col xs={24} sm={12} md={6}>
            <Card className="text-center h-full">
              <div className="text-4xl mb-4">🏆</div>
              <Title level={4}>IKO Certified</Title>
              <Text type="secondary">All instructors are IKO certified with years of experience</Text>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card className="text-center h-full">
              <div className="text-4xl mb-4">🌊</div>
              <Title level={4}>Perfect Conditions</Title>
              <Text type="secondary">Consistent thermal winds and flat, shallow waters</Text>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card className="text-center h-full">
              <div className="text-4xl mb-4">🎒</div>
              <Title level={4}>All Gear Included</Title>
              <Text type="secondary">Latest Duotone and Core equipment provided</Text>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card className="text-center h-full">
              <div className="text-4xl mb-4">📻</div>
              <Title level={4}>Radio Helmets</Title>
              <Text type="secondary">Clear communication with instructors while in the water</Text>
            </Card>
          </Col>
        </Row>
      </div>

      {/* Lesson Packages */}
      <Title level={2} className="text-center mb-8">Our Packages</Title>
      <Row gutter={[24, 24]}>
        {packages.map((pkg) => (
          <Col xs={24} lg={12} key={pkg.key}>
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
                <Text strong className="block mb-2">Pricing Options:</Text>
                <Space direction="vertical" className="w-full">
                  {pkg.options.map((opt) => (
                    <div key={`${pkg.key}-${opt.hours}`} className="flex justify-between items-center bg-gray-50 p-3 rounded-lg">
                      <div>
                        <Text strong>{opt.hours} hours</Text>
                        <Text type="secondary" className="ml-2">({opt.sessions})</Text>
                      </div>
                      <Tag color={pkg.color} className="text-base px-3 py-1">
                        {formatPrice(opt.price)}
                        {opt.perPerson && <span className="text-xs ml-1">/person</span>}
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
                onClick={handleBookService}
              >
                Book {pkg.title}
              </Button>
            </Card>
          </Col>
        ))}
      </Row>

      {/* Bottom CTA */}
      <div className="text-center mt-12 p-8 bg-gradient-to-r from-green-50 to-blue-50 rounded-xl">
        <Title level={3}>Ready to Start Your Kite Journey?</Title>
        <Paragraph className="text-gray-600 mb-4">
          Contact us to discuss which package is right for you, or book directly online.
        </Paragraph>
        <Button
          type="primary"
          size="large"
          icon={<RocketOutlined />}
          onClick={handleBookService}
        >
          Book Your First Lesson
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

export default KiteLessonsPage;
