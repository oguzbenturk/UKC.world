/**
 * WingLessonsPage
 * 
 * Informational page about wing foiling/wing surfing lessons.
 * Shows lesson packages, pricing, and what's included.
 * Opens booking wizard directly on this page without navigation.
 */

import { useState } from 'react';
import { Card, Typography, Button, Row, Col, Tag, Divider, Space, List } from 'antd';
import {
  ThunderboltOutlined,
  TeamOutlined,
  CheckCircleOutlined,
  CalendarOutlined,
  RocketOutlined,
  StarOutlined
} from '@ant-design/icons';
import { usePageSEO } from '@/shared/utils/seo';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import StudentBookingWizard from '@/features/students/components/StudentBookingWizard';

const { Title, Paragraph, Text } = Typography;

const WingLessonsPage = () => {
  const { formatCurrency, convertCurrency, userCurrency } = useCurrency();
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingInitialData, setBookingInitialData] = useState({});

  usePageSEO({
    title: 'Wing Lessons | UKC Academy',
    description: 'Learn wing foiling - the hottest new water sport! Combine the thrill of foiling with the simplicity of a handheld wing.'
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
      key: 'wing-beginner',
      title: 'Wing Beginner',
      subtitle: 'Introduction to Wing Foiling',
      icon: <RocketOutlined className="text-4xl text-teal-500" />,
      description: 'Start your wing foiling journey! Learn wing handling on land, then progress to the water. Perfect for complete beginners or those wanting to add wing to their skill set.',
      options: [
        { hours: 3, price: 180, sessions: '3 x 1hr sessions' },
        { hours: 6, price: 340, sessions: '6 x 1hr sessions' }
      ],
      included: [
        'All wing & foil equipment',
        'Land-based wing handling',
        'Body dragging with wing',
        'SUP foil board practice',
        'First flight attempts',
        'Safety & self-rescue'
      ],
      color: 'teal'
    },
    {
      key: 'wing-intermediate',
      title: 'Wing Intermediate',
      subtitle: 'Get Up and Riding',
      icon: <ThunderboltOutlined className="text-4xl text-blue-500" />,
      description: 'Already comfortable with the wing? Focus on getting up on the foil and staying up! Work on water starts, flight control, and upwind riding.',
      options: [
        { hours: 1, price: 70, sessions: '1hr session' },
        { hours: 4, price: 260, sessions: '4 x 1hr sessions' }
      ],
      included: [
        'Foil water starts',
        'Flight height control',
        'Speed management',
        'Upwind technique',
        'Tacking introduction',
        'Equipment tuning tips'
      ],
      color: 'blue'
    },
    {
      key: 'wing-advanced',
      title: 'Wing Advanced',
      subtitle: 'Tricks & Transitions',
      icon: <StarOutlined className="text-4xl text-purple-500" />,
      description: 'Take your wing foiling to the next level! Master transitions, learn to tack and jibe on the foil, and start working on your first tricks.',
      options: [
        { hours: 1, price: 90, sessions: '1hr coaching' },
        { hours: 4, price: 320, sessions: '4 x 1hr sessions' }
      ],
      included: [
        'Tacking on foil',
        'Jibing technique',
        'Duck jibes',
        'Downwind runs',
        'Wave riding intro',
        'Video analysis'
      ],
      color: 'purple'
    },
    {
      key: 'wing-package',
      title: 'Complete Wing Course',
      subtitle: 'Zero to Hero Package',
      icon: <TeamOutlined className="text-4xl text-green-500" />,
      description: 'The full wing foiling package! From never touching a wing to confidently riding and transitioning. Perfect for dedicated learners.',
      options: [
        { hours: 10, price: 580, sessions: 'Full course package' }
      ],
      included: [
        'Land training session',
        '4 x beginner sessions',
        '4 x intermediate sessions',
        '2 x coaching sessions',
        'All equipment included',
        'Progress certification',
        'Video highlights'
      ],
      color: 'green'
    }
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Hero Section */}
      <div className="text-center mb-12">
        <Title level={1} className="!mb-4">
          🦅 Wing Lessons
        </Title>
        <Paragraph className="text-lg text-gray-600 max-w-3xl mx-auto">
          Wing foiling is the hottest new water sport! Combine the freedom of foiling 
          with the simplicity of a handheld wing. No lines, no harness—just you, 
          the wing, and the water. It's easier to learn than kitesurfing and 
          incredibly addictive!
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

      {/* Why Wing Foiling */}
      <div className="mb-12">
        <Title level={2} className="text-center mb-8">Why Learn Wing Foiling?</Title>
        <Row gutter={[24, 24]}>
          <Col xs={24} sm={12} md={6}>
            <Card className="text-center h-full">
              <div className="text-4xl mb-4">🎯</div>
              <Title level={4}>Easy to Learn</Title>
              <Text type="secondary">Faster learning curve than kitesurfing</Text>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card className="text-center h-full">
              <div className="text-4xl mb-4">🎒</div>
              <Title level={4}>Ultra Portable</Title>
              <Text type="secondary">Compact gear fits in a small bag</Text>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card className="text-center h-full">
              <div className="text-4xl mb-4">🛡️</div>
              <Title level={4}>Super Safe</Title>
              <Text type="secondary">No lines means fewer hazards</Text>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card className="text-center h-full">
              <div className="text-4xl mb-4">🌊</div>
              <Title level={4}>Versatile</Title>
              <Text type="secondary">Works in waves, flat water, and light wind</Text>
            </Card>
          </Col>
        </Row>
      </div>

      {/* Lesson Packages */}
      <Title level={2} className="text-center mb-8">Our Wing Packages</Title>
      <Row gutter={[24, 24]}>
        {packages.map((pkg) => (
          <Col xs={24} md={12} lg={6} key={pkg.key}>
            <Card 
              className="h-full hover:shadow-lg transition-shadow"
              title={
                <div className="flex items-center gap-3">
                  {pkg.icon}
                  <div>
                    <div className="text-lg font-semibold">{pkg.title}</div>
                    <div className="text-xs text-gray-500 font-normal">{pkg.subtitle}</div>
                  </div>
                </div>
              }
            >
              <Paragraph className="text-sm">{pkg.description}</Paragraph>
              
              <div className="mb-4">
                <Text strong className="block mb-2">Pricing:</Text>
                <Space direction="vertical" className="w-full">
                  {pkg.options.map((opt) => (
                    <div key={`${pkg.key}-${opt.hours}`} className="flex justify-between items-center bg-gray-50 p-2 rounded-lg">
                      <div>
                        <Text strong className="text-sm">{opt.hours}hr{opt.hours > 1 ? 's' : ''}</Text>
                        <Text type="secondary" className="ml-1 text-xs">({opt.sessions})</Text>
                      </div>
                      <Tag color={pkg.color} className="px-2 py-0">
                        {formatPrice(opt.price)}
                      </Tag>
                    </div>
                  ))}
                </Space>
              </div>

              <div className="mb-4">
                <Text strong className="block mb-2">Included:</Text>
                <List
                  size="small"
                  dataSource={pkg.included}
                  renderItem={(item) => (
                    <List.Item className="!py-0.5 !px-0 border-none text-sm">
                      <CheckCircleOutlined className="text-green-500 mr-1" />
                      {item}
                    </List.Item>
                  )}
                />
              </div>

              <Button
                type="primary"
                block
                size="small"
                icon={<CalendarOutlined />}
                onClick={handleBookService}
              >
                Book Now
              </Button>
            </Card>
          </Col>
        ))}
      </Row>

      {/* Comparison Section */}
      <div className="mt-12 p-6 bg-gradient-to-r from-teal-50 to-blue-50 rounded-xl">
        <Title level={3} className="text-center mb-6">Wing vs Kite: What's Right for You?</Title>
        <Row gutter={[24, 24]}>
          <Col xs={24} md={12}>
            <Card title="🦅 Choose Wing If...">
              <List
                size="small"
                dataSource={[
                  'You want a faster learning curve',
                  'You prefer simpler, more portable gear',
                  "Safety is a top priority",
                  'You want to foil in lighter winds',
                  "You're already a foiler wanting variety"
                ]}
                renderItem={(item) => (
                  <List.Item className="!py-1 border-none">
                    <CheckCircleOutlined className="text-teal-500 mr-2" />
                    {item}
                  </List.Item>
                )}
              />
            </Card>
          </Col>
          <Col xs={24} md={12}>
            <Card title="🪁 Choose Kite If...">
              <List
                size="small"
                dataSource={[
                  'You want to jump and do big air tricks',
                  'You prefer higher speeds and power',
                  'You want to ride on a twin-tip board',
                  'You love the feeling of being powered by the kite',
                  'You want more style options (waves, freestyle, racing)'
                ]}
                renderItem={(item) => (
                  <List.Item className="!py-1 border-none">
                    <CheckCircleOutlined className="text-green-500 mr-2" />
                    {item}
                  </List.Item>
                )}
              />
            </Card>
          </Col>
        </Row>
      </div>

      {/* Bottom CTA */}
      <div className="text-center mt-12 p-8 bg-gradient-to-r from-purple-50 to-teal-50 rounded-xl">
        <Title level={3}>Ready to Spread Your Wings?</Title>
        <Paragraph className="text-gray-600 mb-4">
          Start your wing foiling adventure today. No experience necessary—we'll take you from zero to flying!
        </Paragraph>
        <Space>
          <Button
            type="primary"
            size="large"
            icon={<RocketOutlined />}
            onClick={handleBookService}
          >
            Start with Beginner Course
          </Button>
          <Button
            size="large"
            onClick={handleBookService}
          >
            Get Complete Package
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

export default WingLessonsPage;
