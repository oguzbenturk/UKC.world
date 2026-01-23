/**
 * ExperienceDownwindersPage
 * 
 * Downwinders experience page with info about downwind sessions.
 * Shows adventure sessions, group trips, and skill requirements.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Typography, Button, Row, Col, Tag, Divider, Space, List, Alert, Timeline } from 'antd';
import {
  CalendarOutlined,
  PhoneOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  EnvironmentOutlined,
  TeamOutlined,
  ClockCircleOutlined,
  ThunderboltOutlined,
  ShoppingOutlined
} from '@ant-design/icons';
import { usePageSEO } from '@/shared/utils/seo';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import StudentBookingWizard from '@/features/students/components/StudentBookingWizard';

const { Title, Paragraph, Text } = Typography;

const ExperienceDownwindersPage = () => {
  const navigate = useNavigate();
  const { formatCurrency, convertCurrency, userCurrency } = useCurrency();
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingInitialData, setBookingInitialData] = useState({});

  usePageSEO({
    title: 'Downwinders | Experience | UKC',
    description: 'Join our epic downwind sessions along the Turkish coast. Group trips, adventure rides, and coastal exploration.'
  });

  // Convert EUR prices to user currency
  const formatPrice = (eurPrice) => {
    const converted = convertCurrency(eurPrice, 'EUR', userCurrency);
    return formatCurrency(converted, userCurrency);
  };

  const handleBookService = () => {
    setBookingInitialData({ serviceCategory: 'lesson' });
    setBookingOpen(true);
  };

  const handleBuyPackage = () => {
    navigate('/experience/book-package');
  };

  const handleBookingClose = () => {
    setBookingOpen(false);
    setBookingInitialData({});
  };

  const downwindRoutes = [
    {
      key: 'short',
      title: 'Short Adventure',
      emoji: '🌊',
      distance: '5-8 km',
      duration: '1-2 hours',
      level: 'Intermediate',
      description: 'Perfect introduction to downwinders. Scenic route along the coastline with rest stops.',
      price: 60,
      includes: ['Safety boat escort', 'Equipment transport', 'Pick-up service', 'Refreshments'],
      color: 'green'
    },
    {
      key: 'medium',
      title: 'Coastal Explorer',
      emoji: '🏄',
      distance: '10-15 km',
      duration: '2-3 hours',
      level: 'Intermediate+',
      description: 'Classic downwind experience. Explore hidden coves and beautiful coastlines.',
      price: 90,
      includes: ['Safety boat escort', 'Equipment transport', 'Lunch stop', 'Photo/Video', 'Pick-up service'],
      color: 'blue',
      popular: true
    },
    {
      key: 'long',
      title: 'Epic Journey',
      emoji: '🚀',
      distance: '20-30 km',
      duration: '4-5 hours',
      level: 'Advanced',
      description: 'The ultimate downwind adventure. Full day of riding through stunning scenery.',
      price: 140,
      includes: ['Safety boat escort', 'Full equipment', 'Lunch & snacks', 'Pro photography', 'Return transport', 'After-ride drinks'],
      color: 'purple',
      premium: true
    }
  ];

  const requirements = [
    { level: 'Intermediate', skill: 'Can ride upwind consistently for 100+ meters' },
    { level: 'Intermediate', skill: 'Comfortable with water re-launch' },
    { level: 'Intermediate', skill: 'Can self-rescue if needed' },
    { level: 'Advanced', skill: 'All intermediate skills mastered' },
    { level: 'Advanced', skill: 'Experience in different wind conditions' },
    { level: 'Advanced', skill: 'Comfortable riding 10+ km without breaks' }
  ];

  const typicalDay = [
    { time: '09:00', activity: 'Meet at Urla Kite Center', icon: '☕' },
    { time: '09:30', activity: 'Safety briefing & equipment check', icon: '✅' },
    { time: '10:00', activity: 'Shuttle to start point', icon: '🚐' },
    { time: '10:30', activity: 'Launch & begin downwind ride', icon: '🪁' },
    { time: '12:30', activity: 'Beach break & lunch', icon: '🍔' },
    { time: '14:00', activity: 'Continue to finish point', icon: '🌊' },
    { time: '15:30', activity: 'Arrive at destination', icon: '🏁' },
    { time: '16:00', activity: 'Shuttle back to center', icon: '🚐' },
    { time: '16:30', activity: 'Drinks & photo sharing', icon: '🍺' }
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Hero Section */}
      <div className="text-center mb-12">
        <Title level={1} className="!mb-4">
          🌬️ Downwinders
        </Title>
        <div className="flex items-center justify-center gap-2 mb-4">
          <EnvironmentOutlined className="text-sky-500" />
          <Text className="text-lg">Urla Coast, İzmir - Turkey</Text>
        </div>
        <Paragraph className="text-lg text-gray-600 max-w-3xl mx-auto">
          Experience the thrill of downwind kitesurfing along Turkey's stunning Aegean coast. 
          Join our guided group trips and explore beautiful coastlines, hidden bays, and 
          crystal-clear waters with the wind at your back!
        </Paragraph>
        <Space className="mt-4">
          <Button
            type="primary"
            size="large"
            icon={<CalendarOutlined />}
            onClick={handleBookService}
          >
            Book a Session
          </Button>
          <Button
            size="large"
            icon={<PhoneOutlined />}
            href="tel:+905071389196"
          >
            Call for Info
          </Button>
        </Space>
      </div>

      <Divider />

      {/* What is Downwinding */}
      <div className="mb-12">
        <Title level={2} className="text-center mb-8">What is Downwinding?</Title>
        <Row gutter={[24, 24]}>
          <Col xs={24} md={12}>
            <Card className="h-full">
              <Title level={4}>The Adventure</Title>
              <Paragraph>
                Downwinding is the ultimate kitesurfing adventure! Instead of riding back and 
                forth at a single spot, you travel with the wind from one point to another, 
                covering long distances along the coastline.
              </Paragraph>
              <Paragraph>
                It's like a road trip on water - exploring new places, discovering hidden 
                beaches, and experiencing the freedom of riding for kilometers with the wind 
                pushing you forward.
              </Paragraph>
            </Card>
          </Col>
          <Col xs={24} md={12}>
            <Card className="h-full">
              <Title level={4}>Why It's Special</Title>
              <List
                size="small"
                dataSource={[
                  'Explore coastlines inaccessible by land',
                  'Ride with the wind - less effort, more fun',
                  'Group experience with fellow kiters',
                  'Safety boat support throughout',
                  'Discover hidden beaches and coves',
                  'Epic photos and memories'
                ]}
                renderItem={(item) => (
                  <List.Item className="!py-2 !px-0 border-0">
                    <CheckCircleOutlined className="text-green-500 mr-2" />
                    {item}
                  </List.Item>
                )}
              />
            </Card>
          </Col>
        </Row>
      </div>

      {/* Downwind Routes */}
      <Title level={2} className="text-center mb-8">Our Routes</Title>
      <Row gutter={[24, 24]} className="mb-12">
        {downwindRoutes.map((route) => (
          <Col xs={24} md={8} key={route.key}>
            <Card 
              className={`h-full hover:shadow-lg transition-shadow ${
                route.premium ? 'border-2 border-purple-300 bg-gradient-to-b from-purple-50 to-white' : ''
              }`}
            >
              {route.popular && (
                <Tag color="gold" className="absolute -top-3 left-4">Most Popular</Tag>
              )}
              <div className="text-center mb-4">
                <span className="text-5xl">{route.emoji}</span>
              </div>
              <Title level={3} className="text-center !mb-2">{route.title}</Title>
              <div className="flex justify-center gap-2 flex-wrap mb-4">
                <Tag color={route.color}>{route.distance}</Tag>
                <Tag icon={<ClockCircleOutlined />}>{route.duration}</Tag>
                <Tag>{route.level}</Tag>
              </div>
              <Paragraph className="text-center text-gray-600 mb-4">
                {route.description}
              </Paragraph>
              <List
                size="small"
                className="mb-4"
                dataSource={route.includes}
                renderItem={(item) => (
                  <List.Item className="!py-1 !px-0 border-0">
                    <CheckCircleOutlined className="text-green-500 mr-2 text-xs" />
                    <Text className="text-sm">{item}</Text>
                  </List.Item>
                )}
              />
              <Divider className="my-4" />
              <div className="text-center mb-4">
                <Text type="secondary" className="text-sm">Per Person</Text>
                <div>
                  <Text strong className={`text-2xl ${route.premium ? 'text-purple-600' : 'text-sky-600'}`}>
                    {formatPrice(route.price)}
                  </Text>
                </div>
              </div>
              <Button type="primary" block onClick={handleBookService}>
                Book This Route
              </Button>
            </Card>
          </Col>
        ))}
      </Row>

      {/* Typical Day */}
      <div className="mb-12 bg-gradient-to-r from-sky-50 to-blue-50 rounded-2xl p-8">
        <Title level={2} className="text-center mb-8">A Typical Downwind Day</Title>
        <Row gutter={[24, 24]}>
          <Col xs={24} md={16}>
            <Timeline
              items={typicalDay.map((item) => ({
                color: 'blue',
                children: (
                  <div className="flex items-center gap-3">
                    <Text strong>{item.time}</Text>
                    <span>{item.icon}</span>
                    <Text>{item.activity}</Text>
                  </div>
                )
              }))}
            />
          </Col>
          <Col xs={24} md={8}>
            <Card>
              <Title level={4}>
                <TeamOutlined className="mr-2" />
                Group Info
              </Title>
              <List
                size="small"
                dataSource={[
                  'Minimum 4 participants',
                  'Maximum 10 per group',
                  'Mixed skill levels welcome',
                  'Run on suitable wind days',
                  'Advance booking required'
                ]}
                renderItem={(item) => (
                  <List.Item className="!py-2 !px-0 border-0">
                    <CheckCircleOutlined className="text-sky-500 mr-2" />
                    {item}
                  </List.Item>
                )}
              />
            </Card>
          </Col>
        </Row>
      </div>

      {/* Requirements */}
      <Alert
        className="mb-8"
        type="info"
        showIcon
        icon={<ExclamationCircleOutlined />}
        message="Skill Requirements"
        description={
          <div className="mt-2">
            <Paragraph className="mb-2">
              Downwinding requires intermediate to advanced kiting skills. You should be able to:
            </Paragraph>
            <Row gutter={[16, 8]}>
              {requirements.map((req, index) => (
                <Col xs={24} md={12} key={index}>
                  <div className="flex items-start gap-2">
                    <Tag color={req.level === 'Advanced' ? 'purple' : 'blue'} className="mt-1">
                      {req.level}
                    </Tag>
                    <Text className="text-sm">{req.skill}</Text>
                  </div>
                </Col>
              ))}
            </Row>
            <Paragraph className="mt-3 mb-0">
              <Text strong>Not sure if you're ready?</Text> Book a skill assessment lesson and we'll help you prepare!
            </Paragraph>
          </div>
        }
      />

      {/* Private Downwinders */}
      <Card className="mb-8 bg-gradient-to-r from-amber-50 to-orange-50">
        <Row gutter={[24, 24]} align="middle">
          <Col xs={24} md={16}>
            <Title level={3} className="!mb-2">
              <ThunderboltOutlined className="text-amber-500 mr-2" />
              Private Downwinders Available
            </Title>
            <Paragraph className="text-gray-600 mb-0">
              Want a custom route or private group experience? We can organize exclusive 
              downwind trips for your group with personalized routes and timing.
            </Paragraph>
          </Col>
          <Col xs={24} md={8} className="text-center md:text-right">
            <Button type="primary" size="large" icon={<PhoneOutlined />} href="tel:+905071389196">
              Inquire About Private Trip
            </Button>
          </Col>
        </Row>
      </Card>

      {/* Contact */}
      <Card className="text-center">
        <Title level={3}>Ready for the Adventure?</Title>
        <Paragraph>
          Join our next downwind trip and experience the thrill of coastal exploration!
        </Paragraph>
        <Space size="large">
          <Button icon={<PhoneOutlined />} href="tel:+905071389196">
            +90 507 138 91 96
          </Button>
          <Button icon="📧" href="mailto:ukcturkey@gmail.com">
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

export default ExperienceDownwindersPage;
