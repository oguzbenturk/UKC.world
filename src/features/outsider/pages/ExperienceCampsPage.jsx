/**
 * ExperienceCampsPage
 * 
 * Camps experience page with info about kitesurfing camps and all-inclusive options.
 * Shows multi-day camps, bootcamps, and immersive learning experiences.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Typography, Button, Row, Col, Tag, Divider, Space, List, Badge, Timeline } from 'antd';
import {
  CalendarOutlined,
  PhoneOutlined,
  CheckCircleOutlined,
  StarOutlined,
  TeamOutlined,
  EnvironmentOutlined,
  FireOutlined,
  TrophyOutlined,
  CrownOutlined,
  ShoppingOutlined
} from '@ant-design/icons';
import { usePageSEO } from '@/shared/utils/seo';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import StudentBookingWizard from '@/features/students/components/StudentBookingWizard';

const { Title, Paragraph, Text } = Typography;

const ExperienceCampsPage = () => {
  const navigate = useNavigate();
  const { formatCurrency, convertCurrency, userCurrency } = useCurrency();
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingInitialData, setBookingInitialData] = useState({});

  usePageSEO({
    title: 'Kite Camps | Experience | UKC',
    description: 'Join our kitesurfing camps for an immersive learning experience. Week-long camps, bootcamps, and all-inclusive packages.'
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

  const camps = [
    {
      key: 'beginner-week',
      title: 'Beginner Week Camp',
      emoji: '🌱',
      duration: '7 days',
      level: 'Beginner',
      description: 'Perfect for complete beginners. Go from zero to riding in one week with daily lessons and practice.',
      price: 1200,
      includes: [
        '7 nights accommodation',
        '15 hours of lessons',
        'All equipment included',
        'Daily breakfast',
        'Airport transfer',
        'Safety briefings',
        'Video analysis sessions',
        'Certificate of completion'
      ],
      schedule: [
        { day: 'Day 1', activity: 'Arrival, welcome dinner, equipment intro' },
        { day: 'Day 2-3', activity: 'Kite control, body dragging' },
        { day: 'Day 4-5', activity: 'Water starts, first rides' },
        { day: 'Day 6', activity: 'Practice & consolidation' },
        { day: 'Day 7', activity: 'Final session, departure' }
      ],
      color: 'green',
      spots: 8
    },
    {
      key: 'progression',
      title: 'Progression Camp',
      emoji: '🚀',
      duration: '5 days',
      level: 'Intermediate',
      description: 'Take your skills to the next level. Focus on transitions, jumps, and riding upwind consistently.',
      price: 950,
      includes: [
        '5 nights accommodation',
        '12 hours of coaching',
        'All equipment included',
        'Daily breakfast',
        'Video coaching',
        'Theory sessions',
        'Group activities',
        'Camp t-shirt'
      ],
      schedule: [
        { day: 'Day 1', activity: 'Skill assessment, goal setting' },
        { day: 'Day 2-3', activity: 'Technique refinement, transitions' },
        { day: 'Day 4', activity: 'Advanced maneuvers intro' },
        { day: 'Day 5', activity: 'Final challenge, graduation' }
      ],
      color: 'blue',
      spots: 6,
      popular: true
    },
    {
      key: 'advanced-bootcamp',
      title: 'Advanced Bootcamp',
      emoji: '💪',
      duration: '4 days',
      level: 'Advanced',
      description: 'Intensive training for experienced riders. Master tricks, wave riding, or foiling.',
      price: 800,
      includes: [
        '4 nights accommodation',
        '10 hours intensive coaching',
        'Premium equipment access',
        'Daily breakfast & lunch',
        'Pro video analysis',
        'One-on-one feedback',
        'Trick progression plan'
      ],
      schedule: [
        { day: 'Day 1', activity: 'Assessment, personalized plan' },
        { day: 'Day 2-3', activity: 'Intensive trick training' },
        { day: 'Day 4', activity: 'Competition simulation, wrap-up' }
      ],
      color: 'orange',
      spots: 4
    },
    {
      key: 'ultimate',
      title: 'Ultimate Experience',
      emoji: '👑',
      duration: '10 days',
      level: 'All Levels',
      description: 'The complete kitesurfing vacation. Lessons, accommodation, activities, and unforgettable memories.',
      price: 2200,
      includes: [
        '10 nights premium accommodation',
        '20 hours of lessons/coaching',
        'All equipment included',
        'All meals included',
        'Airport transfers',
        'Downwind trip',
        'Boat rescue service',
        'Social events & BBQs',
        'Pro photo/video package',
        'Massage session',
        'City tour',
        'VIP treatment'
      ],
      schedule: [
        { day: 'Day 1', activity: 'VIP arrival, welcome party' },
        { day: 'Day 2-4', activity: 'Intensive training sessions' },
        { day: 'Day 5', activity: 'Rest day, spa & sightseeing' },
        { day: 'Day 6-8', activity: 'Advanced training, downwind trip' },
        { day: 'Day 9', activity: 'Free riding, social event' },
        { day: 'Day 10', activity: 'Farewell session, departure' }
      ],
      color: 'purple',
      spots: 6,
      premium: true
    }
  ];

  const upcomingDates = [
    { month: 'May 2024', camps: ['Beginner Week', 'Progression Camp'] },
    { month: 'June 2024', camps: ['Beginner Week', 'Ultimate Experience'] },
    { month: 'July 2024', camps: ['Progression Camp', 'Advanced Bootcamp'] },
    { month: 'August 2024', camps: ['Beginner Week', 'Ultimate Experience', 'Advanced Bootcamp'] },
    { month: 'September 2024', camps: ['Progression Camp', 'Ultimate Experience'] }
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Hero Section */}
      <div className="text-center mb-12">
        <Title level={1} className="!mb-4">
          ⛺ Kitesurfing Camps
        </Title>
        <div className="flex items-center justify-center gap-2 mb-4">
          <EnvironmentOutlined className="text-sky-500" />
          <Text className="text-lg">Urla Kite Center, İzmir - Turkey</Text>
        </div>
        <Paragraph className="text-lg text-gray-600 max-w-3xl mx-auto">
          Immerse yourself in the kitesurfing lifestyle with our multi-day camps. 
          Whether you're a complete beginner or looking to master advanced tricks, 
          our camps offer the perfect environment for rapid progression with like-minded 
          enthusiasts from around the world.
        </Paragraph>
        <Space className="mt-4">
          <Button
            type="primary"
            size="large"
            icon={<ShoppingOutlined />}
            onClick={handleBuyPackage}
          >
            Book a Camp
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

      {/* Why Join a Camp */}
      <div className="mb-12">
        <Title level={2} className="text-center mb-8">Why Join a Camp?</Title>
        <Row gutter={[24, 24]}>
          <Col xs={24} sm={12} md={6}>
            <Card className="text-center h-full hover:shadow-md transition-shadow">
              <div className="text-4xl mb-4">🎯</div>
              <Title level={4}>Focused Learning</Title>
              <Text type="secondary">Daily lessons with structured progression</Text>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card className="text-center h-full hover:shadow-md transition-shadow">
              <div className="text-4xl mb-4">👥</div>
              <Title level={4}>Community</Title>
              <Text type="secondary">Meet fellow kiters from around the world</Text>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card className="text-center h-full hover:shadow-md transition-shadow">
              <div className="text-4xl mb-4">📈</div>
              <Title level={4}>Fast Progress</Title>
              <Text type="secondary">Improve faster with intensive training</Text>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card className="text-center h-full hover:shadow-md transition-shadow">
              <div className="text-4xl mb-4">🎉</div>
              <Title level={4}>All-Inclusive</Title>
              <Text type="secondary">Everything organized - just show up!</Text>
            </Card>
          </Col>
        </Row>
      </div>

      {/* Camp Options */}
      <Title level={2} className="text-center mb-8">Our Camps</Title>
      <Row gutter={[24, 24]} className="mb-12">
        {camps.map((camp) => (
          <Col xs={24} lg={12} key={camp.key}>
            <Badge.Ribbon 
              text={camp.premium ? "Premium" : camp.popular ? "Most Popular" : null}
              color={camp.premium ? "purple" : "gold"}
              style={{ display: camp.premium || camp.popular ? 'block' : 'none' }}
            >
              <Card 
                className={`h-full hover:shadow-lg transition-shadow ${
                  camp.premium ? 'border-2 border-purple-300 bg-gradient-to-b from-purple-50 to-white' : ''
                }`}
              >
                <div className="flex items-start gap-4 mb-4">
                  <span className="text-5xl">{camp.emoji}</span>
                  <div className="flex-1">
                    <Title level={3} className="!mb-1">{camp.title}</Title>
                    <div className="flex gap-2 flex-wrap">
                      <Tag color={camp.color}>{camp.duration}</Tag>
                      <Tag>{camp.level}</Tag>
                      <Tag icon={<TeamOutlined />}>{camp.spots} spots max</Tag>
                    </div>
                  </div>
                </div>
                
                <Paragraph className="text-gray-600 mb-4">
                  {camp.description}
                </Paragraph>

                <Row gutter={[16, 16]}>
                  <Col xs={24} md={14}>
                    <Title level={5} className="!mb-2">What's Included:</Title>
                    <List
                      size="small"
                      dataSource={camp.includes.slice(0, 6)}
                      renderItem={(item) => (
                        <List.Item className="!py-1 !px-0 border-0">
                          <CheckCircleOutlined className="text-green-500 mr-2 text-xs" />
                          <Text className="text-sm">{item}</Text>
                        </List.Item>
                      )}
                    />
                    {camp.includes.length > 6 && (
                      <Text type="secondary" className="text-xs">
                        +{camp.includes.length - 6} more included
                      </Text>
                    )}
                  </Col>
                  <Col xs={24} md={10}>
                    <Title level={5} className="!mb-2">Schedule:</Title>
                    <Timeline
                      items={camp.schedule.map((item) => ({
                        color: camp.color,
                        children: (
                          <div>
                            <Text strong className="text-xs">{item.day}</Text>
                            <br />
                            <Text className="text-xs">{item.activity}</Text>
                          </div>
                        )
                      }))}
                    />
                  </Col>
                </Row>

                <Divider className="my-4" />
                
                <Row align="middle">
                  <Col xs={12}>
                    <Text type="secondary" className="text-sm">Starting from</Text>
                    <div>
                      <Text strong className={`text-2xl ${camp.premium ? 'text-purple-600' : 'text-sky-600'}`}>
                        {formatPrice(camp.price)}
                      </Text>
                    </div>
                  </Col>
                  <Col xs={12} className="text-right">
                    <Button type="primary" size="large" onClick={handleBuyPackage}>
                      Book This Camp
                    </Button>
                  </Col>
                </Row>
              </Card>
            </Badge.Ribbon>
          </Col>
        ))}
      </Row>

      {/* Upcoming Dates */}
      <div className="mb-12 bg-gradient-to-r from-sky-50 to-blue-50 rounded-2xl p-8">
        <Title level={2} className="text-center mb-8">
          <CalendarOutlined className="mr-2" />
          Upcoming Camp Dates
        </Title>
        <Row gutter={[16, 16]}>
          {upcomingDates.map((date, index) => (
            <Col xs={24} sm={12} md={8} lg={4} key={index}>
              <Card className="text-center h-full">
                <Title level={5} className="!mb-2">{date.month}</Title>
                {date.camps.map((camp, i) => (
                  <Tag key={i} className="mb-1">{camp}</Tag>
                ))}
              </Card>
            </Col>
          ))}
        </Row>
        <div className="text-center mt-6">
          <Text type="secondary">
            Specific dates announced monthly. Contact us to reserve your spot!
          </Text>
        </div>
      </div>

      {/* Private Camps */}
      <Card className="mb-8 bg-gradient-to-r from-amber-50 to-orange-50">
        <Row gutter={[24, 24]} align="middle">
          <Col xs={24} md={16}>
            <Title level={3} className="!mb-2">
              <CrownOutlined className="text-amber-500 mr-2" />
              Private Group Camps
            </Title>
            <Paragraph className="text-gray-600 mb-0">
              Coming with a group? We can organize a private camp just for you! 
              Custom dates, personalized schedule, and exclusive attention for your team, 
              company, or friends.
            </Paragraph>
          </Col>
          <Col xs={24} md={8} className="text-center md:text-right">
            <Button type="primary" size="large" icon={<PhoneOutlined />} href="tel:+905071389196">
              Inquire About Private Camp
            </Button>
          </Col>
        </Row>
      </Card>

      {/* Testimonial */}
      <Card className="mb-8 text-center">
        <div className="text-4xl mb-4">⭐⭐⭐⭐⭐</div>
        <Paragraph className="text-lg italic text-gray-600 max-w-2xl mx-auto">
          "The best week of my life! I came as a complete beginner and left riding 
          confidently. The instructors, the group, the accommodation - everything was 
          perfect. I'm already planning my return!"
        </Paragraph>
        <Text strong>— Maria S., Germany</Text>
        <Text type="secondary" className="block">Beginner Week Camp, August 2023</Text>
      </Card>

      {/* Contact */}
      <Card className="text-center">
        <Title level={3}>Ready to Join the Camp?</Title>
        <Paragraph>
          Reserve your spot now! Camps fill up quickly during peak season.
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

export default ExperienceCampsPage;
