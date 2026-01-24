/**
 * PremiumLessonsPage
 * 
 * Informational page about premium/VIP lessons.
 * Shows exclusive premium packages, pricing, and what's included.
 * Opens booking wizard directly on this page without navigation.
 */

import { useState } from 'react';
import { Card, Typography, Button, Row, Col, Tag, Divider, Space, List } from 'antd';
import {
  CrownOutlined,
  StarOutlined,
  TrophyOutlined,
  VideoCameraOutlined,
  CheckCircleOutlined,
  CalendarOutlined
} from '@ant-design/icons';
import { usePageSEO } from '@/shared/utils/seo';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import StudentBookingWizard from '@/features/students/components/StudentBookingWizard';

const { Title, Paragraph, Text } = Typography;

const PremiumLessonsPage = () => {
  const { formatCurrency, convertCurrency, userCurrency } = useCurrency();
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingInitialData, setBookingInitialData] = useState({});

  usePageSEO({
    title: 'Premium Lessons | UKC Academy',
    description: 'Experience the ultimate learning with our premium VIP lessons. Personalized coaching, video analysis, and exclusive benefits.'
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
      key: 'vip-private',
      title: 'VIP Private Coaching',
      subtitle: 'One-on-One Premium Experience',
      icon: <CrownOutlined className="text-4xl text-amber-500" />,
      description: 'Get exclusive one-on-one attention from our top instructors. Perfect for rapid progression with personalized training plans and video analysis.',
      options: [
        { hours: 4, price: 480, sessions: '4 x 1hr sessions' },
        { hours: 8, price: 880, sessions: '8 x 1hr sessions' },
        { hours: 12, price: 1200, sessions: '12 x 1hr sessions' }
      ],
      included: [
        'Top-tier instructor selection',
        'Professional video analysis',
        'Personalized training plan',
        'Premium equipment priority',
        'Flexible scheduling',
        'Progress report & certificate',
        'Radio helmet communication',
        'Complimentary refreshments'
      ],
      color: 'gold'
    },
    {
      key: 'intensive-bootcamp',
      title: 'Intensive Bootcamp',
      subtitle: '3-Day Accelerated Program',
      icon: <TrophyOutlined className="text-4xl text-red-500" />,
      description: 'Transform your riding in just 3 days! This intensive program is designed for dedicated learners who want to make significant progress quickly.',
      options: [
        { hours: 15, price: 1350, sessions: '3 days x 5hrs' },
        { hours: 21, price: 1800, sessions: '3 days x 7hrs' }
      ],
      included: [
        'Dedicated instructor for 3 days',
        'Morning & afternoon sessions',
        'Daily video review sessions',
        'Custom progression tracking',
        'All premium equipment',
        'Lunch included daily',
        'Theory sessions',
        'Completion certificate'
      ],
      color: 'red'
    },
    {
      key: 'masterclass',
      title: 'Masterclass Series',
      subtitle: 'Advanced Technique Workshops',
      icon: <StarOutlined className="text-4xl text-purple-500" />,
      description: 'Focus on specific advanced techniques with specialized workshops. From freestyle tricks to wave riding mastery.',
      options: [
        { hours: 6, price: 600, sessions: '6 x 1hr specialized sessions' },
        { hours: 10, price: 950, sessions: '10 x 1hr specialized sessions' }
      ],
      included: [
        'Specialized trick coaching',
        'Video analysis after each session',
        'Wave riding techniques',
        'Jump progression training',
        'Freestyle fundamentals',
        'Competition preparation',
        'Access to exclusive zones',
        'Performance tracking'
      ],
      color: 'purple'
    },
    {
      key: 'pro-video',
      title: 'Pro Video Package',
      subtitle: 'Document Your Journey',
      icon: <VideoCameraOutlined className="text-4xl text-cyan-500" />,
      description: 'Combine premium lessons with professional video production. Get epic footage of your sessions edited and ready to share.',
      options: [
        { hours: 4, price: 650, sessions: '4hrs coaching + video' },
        { hours: 8, price: 1200, sessions: '8hrs coaching + full edit' }
      ],
      included: [
        'Premium one-on-one coaching',
        'Professional videographer',
        'Drone footage included',
        'Edited highlight reel',
        'Raw footage provided',
        'Social media clips',
        'GoPro footage angles',
        'Music & effects editing'
      ],
      color: 'cyan'
    }
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Hero Section */}
      <div className="text-center mb-12">
        <Title level={1} className="!mb-4">
          👑 Premium Lessons
        </Title>
        <Paragraph className="text-lg text-gray-600 max-w-3xl mx-auto">
          Experience the ultimate in personalized coaching with our premium lesson packages. 
          Get exclusive access to our top instructors, advanced video analysis, and VIP treatment 
          designed to accelerate your progression and make every session unforgettable.
        </Paragraph>
        <Button
          type="primary"
          size="large"
          icon={<CalendarOutlined />}
          onClick={handleBookService}
          className="mt-4 bg-gradient-to-r from-amber-500 to-orange-500 border-0"
        >
          Book Premium Lesson
        </Button>
      </div>

      <Divider />

      {/* Why Choose Premium */}
      <div className="mb-12">
        <Title level={2} className="text-center mb-8">Why Choose Premium?</Title>
        <Row gutter={[24, 24]}>
          <Col xs={24} sm={12} md={6}>
            <Card className="text-center h-full">
              <div className="text-4xl mb-4">🎯</div>
              <Title level={4}>Personalized Approach</Title>
              <Text type="secondary">Custom training plans tailored to your goals and skill level</Text>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card className="text-center h-full">
              <div className="text-4xl mb-4">🎥</div>
              <Title level={4}>Video Analysis</Title>
              <Text type="secondary">Professional video review to perfect your technique</Text>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card className="text-center h-full">
              <div className="text-4xl mb-4">⚡</div>
              <Title level={4}>Top Instructors</Title>
              <Text type="secondary">Learn from our most experienced and certified coaches</Text>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card className="text-center h-full">
              <div className="text-4xl mb-4">🏅</div>
              <Title level={4}>Faster Progress</Title>
              <Text type="secondary">Accelerated learning with focused, intensive training</Text>
            </Card>
          </Col>
        </Row>
      </div>

      {/* Premium Packages */}
      <Title level={2} className="text-center mb-8">Premium Packages</Title>
      <Row gutter={[24, 24]}>
        {packages.map((pkg) => (
          <Col xs={24} lg={12} key={pkg.key}>
            <Card 
              className="h-full hover:shadow-xl transition-shadow border-2 border-amber-200"
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
                    <div key={`${pkg.key}-${opt.hours}`} className="flex justify-between items-center bg-gradient-to-r from-amber-50 to-orange-50 p-3 rounded-lg border border-amber-200">
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
                      <CheckCircleOutlined className="text-amber-500 mr-2" />
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
                className="bg-gradient-to-r from-amber-500 to-orange-500 border-0"
              >
                Book {pkg.title}
              </Button>
            </Card>
          </Col>
        ))}
      </Row>

      {/* Bottom CTA */}
      <div className="text-center mt-12 p-8 bg-gradient-to-r from-amber-50 via-orange-50 to-yellow-50 rounded-xl border-2 border-amber-200">
        <Title level={3}>Ready for the Premium Experience?</Title>
        <Paragraph className="text-gray-600 mb-4">
          Elevate your training with personalized coaching and exclusive benefits. 
          Contact us to discuss your goals or book directly online.
        </Paragraph>
        <Button
          type="primary"
          size="large"
          icon={<CrownOutlined />}
          onClick={handleBookService}
          className="bg-gradient-to-r from-amber-500 to-orange-500 border-0"
        >
          Book Premium Lesson Now
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

export default PremiumLessonsPage;
