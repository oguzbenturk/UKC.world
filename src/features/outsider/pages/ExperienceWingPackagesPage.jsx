/**
 * ExperienceWingPackagesPage
 * 
 * Wing foiling experience packages page with combined packages.
 * Shows rental+accommodation, lessons+accommodation, and all-inclusive options for wing foiling.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Typography, Button, Row, Col, Tag, Divider, Space, List, Badge } from 'antd';
import {
  CalendarOutlined,
  PhoneOutlined,
  CheckCircleOutlined,
  StarOutlined,
  RocketOutlined,
  ShoppingOutlined
} from '@ant-design/icons';
import { usePageSEO } from '@/shared/utils/seo';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import StudentBookingWizard from '@/features/students/components/StudentBookingWizard';

const { Title, Paragraph, Text } = Typography;

const ExperienceWingPackagesPage = () => {
  const navigate = useNavigate();
  const { formatCurrency, convertCurrency, userCurrency } = useCurrency();
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingInitialData, setBookingInitialData] = useState({});

  usePageSEO({
    title: 'Wing Packages | Experience | UKC',
    description: 'Complete wing foiling experience packages. Combine lessons, accommodation, and equipment rental for the best value.'
  });

  // Convert EUR prices to user currency
  const formatPrice = (eurPrice) => {
    const converted = convertCurrency(eurPrice, 'EUR', userCurrency);
    return formatCurrency(converted, userCurrency);
  };

  const handleBookPackage = () => {
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

  const experiencePackages = [
    {
      key: 'lessons-only',
      title: 'Wing Lessons Package',
      emoji: '🦅',
      category: 'lesson',
      description: 'Learn the exciting sport of wing foiling with our expert instructors. All equipment included.',
      options: [
        { name: '4 Hour Intro', price: 320, hours: 4, features: ['2x2hr sessions', 'All equipment', 'Beach start training'] },
        { name: '6 Hour Foundation', price: 450, hours: 6, features: ['3x2hr sessions', 'All equipment', 'Foiling basics'] },
        { name: '10 Hour Progress', price: 700, hours: 10, features: ['5x2hr sessions', 'All equipment', 'Water starts & riding'] }
      ],
      color: 'cyan'
    },
    {
      key: 'lessons-rental',
      title: 'Wing Lessons + Rental',
      emoji: '🎯',
      category: 'lesson_rental',
      description: 'Learn and practice! Get lesson hours plus additional rental time to develop your skills.',
      options: [
        { name: 'Starter Wing', price: 500, hours: 4, rentalDays: 2, features: ['4hr lessons', '2 days rental', 'Safety briefing'] },
        { name: 'Progress Wing', price: 700, hours: 6, rentalDays: 3, features: ['6hr lessons', '3 days rental', 'Supervised practice'] },
        { name: 'Advanced Wing', price: 950, hours: 10, rentalDays: 5, features: ['10hr lessons', '5 days rental', 'Free practice time'] }
      ],
      color: 'blue',
      popular: true
    },
    {
      key: 'lessons-accommodation',
      title: 'Wing Lessons + Stay',
      emoji: '🏨',
      category: 'accommodation_lesson',
      description: 'The complete wing foiling vacation. Accommodation and lessons for an immersive experience.',
      options: [
        { name: 'Wing Weekend', price: 450, nights: 2, hours: 4, features: ['2 nights hotel', '4hr lessons', 'Breakfast included'] },
        { name: 'Wing Week', price: 900, nights: 5, hours: 8, features: ['5 nights hotel', '8hr lessons', 'Breakfast included'] },
        { name: 'Wing Immersion', price: 1200, nights: 7, hours: 12, features: ['7 nights hotel', '12hr lessons', 'All meals'] }
      ],
      color: 'orange'
    },
    {
      key: 'all-inclusive',
      title: 'Wing All Inclusive',
      emoji: '⭐',
      category: 'all_inclusive',
      description: 'Everything for the ultimate wing foiling experience. Stay, learn, ride, and master the wing!',
      options: [
        { name: 'Wing Ultimate', price: 1350, nights: 7, hours: 12, rentalDays: 7, features: ['7 nights stay', '12hr lessons', '7 days rental', 'All meals', 'Airport transfer'] },
        { name: 'Wing Premium', price: 1650, nights: 7, hours: 15, rentalDays: 7, features: ['7 nights deluxe', '15hr lessons', 'Premium gear rental', 'All meals', 'VIP service'] }
      ],
      color: 'purple',
      premium: true
    }
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Hero Section */}
      <div className="text-center mb-12">
        <Title level={1} className="!mb-4">
          🦅 Wing Experience Packages
        </Title>
        <Paragraph className="text-lg text-gray-600 max-w-3xl mx-auto">
          Discover the freedom of wing foiling with our comprehensive packages. 
          Learn the fastest growing water sport with expert instruction and top-quality 
          Duotone equipment.
        </Paragraph>
        <Space className="mt-4">
          <Button
            type="primary"
            size="large"
            icon={<ShoppingOutlined />}
            onClick={handleBuyPackage}
          >
            Buy a Package
          </Button>
          <Button
            size="large"
            icon={<CalendarOutlined />}
            onClick={handleBookPackage}
          >
            Book Service
          </Button>
        </Space>
      </div>

      <Divider />

      {/* About Wing Foiling */}
      <div className="mb-12 bg-gradient-to-r from-cyan-50 to-blue-50 rounded-2xl p-8">
        <Title level={2} className="text-center mb-8">Why Wing Foiling?</Title>
        <Row gutter={[24, 24]}>
          <Col xs={24} sm={12} md={6}>
            <Card className="text-center h-full hover:shadow-md transition-shadow">
              <div className="text-4xl mb-4">🌬️</div>
              <Title level={4}>Light Wind Fun</Title>
              <Text type="secondary">Works in lighter winds than kitesurfing</Text>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card className="text-center h-full hover:shadow-md transition-shadow">
              <div className="text-4xl mb-4">🚀</div>
              <Title level={4}>Quick Progression</Title>
              <Text type="secondary">Learn to foil faster than other sports</Text>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card className="text-center h-full hover:shadow-md transition-shadow">
              <div className="text-4xl mb-4">🎒</div>
              <Title level={4}>Portable</Title>
              <Text type="secondary">Compact gear that's easy to transport</Text>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card className="text-center h-full hover:shadow-md transition-shadow">
              <div className="text-4xl mb-4">🤫</div>
              <Title level={4}>Silent Glide</Title>
              <Text type="secondary">Experience the magic of silent flight</Text>
            </Card>
          </Col>
        </Row>
      </div>

      {/* Package Categories */}
      {experiencePackages.map((category) => (
        <div key={category.key} className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <span className="text-4xl">{category.emoji}</span>
            <div>
              <Title level={2} className="!mb-0">{category.title}</Title>
              <Text type="secondary">{category.description}</Text>
            </div>
            {category.popular && <Tag color="gold">Most Popular</Tag>}
            {category.premium && <Tag color="purple">Premium</Tag>}
          </div>
          
          <Row gutter={[24, 24]}>
            {category.options.map((option, index) => (
              <Col xs={24} md={8} key={index}>
                <Badge.Ribbon 
                  text={category.popular && index === 1 ? "Best Value" : null}
                  color="gold"
                  style={{ display: category.popular && index === 1 ? 'block' : 'none' }}
                >
                  <Card 
                    className={`h-full hover:shadow-lg transition-shadow ${
                      category.premium ? 'border-2 border-purple-300 bg-gradient-to-b from-purple-50 to-white' : ''
                    }`}
                  >
                    <div className="text-center">
                      <Title level={4} className="!mb-2">{option.name}</Title>
                      <div className="flex justify-center gap-2 flex-wrap mb-4">
                        {option.hours && <Tag color={category.color}>{option.hours}hr lessons</Tag>}
                        {option.nights && <Tag color="blue">{option.nights} nights</Tag>}
                        {option.rentalDays && <Tag color="orange">{option.rentalDays} days rental</Tag>}
                      </div>
                      <List
                        size="small"
                        className="mb-4"
                        dataSource={option.features}
                        renderItem={(item) => (
                          <List.Item className="!py-1 !px-0 border-0 justify-center">
                            <CheckCircleOutlined className="text-green-500 mr-2" />
                            <Text className="text-sm">{item}</Text>
                          </List.Item>
                        )}
                      />
                      <Divider className="my-4" />
                      <div className="mb-4">
                        <Text type="secondary" className="text-sm">Package Price</Text>
                        <div>
                          <Text strong className={`text-2xl ${category.premium ? 'text-purple-600' : 'text-cyan-600'}`}>
                            {formatPrice(option.price)}
                          </Text>
                        </div>
                      </div>
                      <Button 
                        type="primary" 
                        block 
                        onClick={handleBuyPackage}
                        className={category.premium ? 'bg-purple-500 hover:bg-purple-600' : ''}
                      >
                        Buy Package
                      </Button>
                    </div>
                  </Card>
                </Badge.Ribbon>
              </Col>
            ))}
          </Row>
        </div>
      ))}

      {/* Cross-Sell */}
      <Card className="mb-8 bg-gradient-to-r from-green-50 to-teal-50">
        <Row gutter={[24, 24]} align="middle">
          <Col xs={24} md={16}>
            <Title level={3} className="!mb-2">
              <RocketOutlined className="text-green-500 mr-2" />
              Combine With Kitesurfing!
            </Title>
            <Paragraph className="text-gray-600 mb-0">
              Already a kiter? Add wing foiling to your skills. Already wing? Try kite! 
              We offer multi-sport packages for the ultimate water sports experience.
            </Paragraph>
          </Col>
          <Col xs={24} md={8} className="text-center md:text-right">
            <Button 
              type="primary" 
              size="large"
              onClick={() => navigate('/experience/kite-packages')}
            >
              View Kite Packages
            </Button>
          </Col>
        </Row>
      </Card>

      {/* Contact */}
      <Card className="text-center">
        <Title level={3}>Custom Wing Packages Available</Title>
        <Paragraph>
          Need something different? We can create a custom package just for you!
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

export default ExperienceWingPackagesPage;
