/**
 * ExperienceKitePackagesPage
 * 
 * Kite experience packages page with combined packages.
 * Shows rental+accommodation, lessons+accommodation, and all-inclusive options for kitesurfing.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Typography, Button, Row, Col, Tag, Divider, Space, List, Badge } from 'antd';
import {
  CalendarOutlined,
  PhoneOutlined,
  CheckCircleOutlined,
  StarOutlined,
  ThunderboltOutlined,
  RocketOutlined,
  HomeOutlined,
  ShoppingOutlined
} from '@ant-design/icons';
import { usePageSEO } from '@/shared/utils/seo';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import StudentBookingWizard from '@/features/students/components/StudentBookingWizard';

const { Title, Paragraph, Text } = Typography;

const ExperienceKitePackagesPage = () => {
  const navigate = useNavigate();
  const { formatCurrency, convertCurrency, userCurrency } = useCurrency();
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingInitialData, setBookingInitialData] = useState({});

  usePageSEO({
    title: 'Kite Packages | Experience | UKC',
    description: 'Complete kitesurfing experience packages. Combine lessons, accommodation, and equipment rental for the best value.'
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
      title: 'Lessons Package',
      emoji: '🎓',
      category: 'lesson',
      description: 'Focus on learning with our comprehensive lesson packages. All equipment included during lessons.',
      options: [
        { name: '6 Hour Starter', price: 420, hours: 6, features: ['3x2hr sessions', 'All equipment', 'Radio helmet'] },
        { name: '10 Hour Progress', price: 650, hours: 10, features: ['5x2hr sessions', 'All equipment', 'Video review'] },
        { name: '12 Hour Mastery', price: 720, hours: 12, features: ['6x2hr sessions', 'All equipment', 'Certification'] }
      ],
      color: 'green'
    },
    {
      key: 'lessons-rental',
      title: 'Lessons + Rental',
      emoji: '🎯',
      category: 'lesson_rental',
      description: 'Learn and practice! Get lesson hours plus additional rental time to practice on your own.',
      options: [
        { name: 'Starter Combo', price: 550, hours: 6, rentalDays: 2, features: ['6hr lessons', '2 days rental', 'Safety supervision'] },
        { name: 'Progress Combo', price: 800, hours: 10, rentalDays: 3, features: ['10hr lessons', '3 days rental', 'Practice sessions'] },
        { name: 'Mastery Combo', price: 950, hours: 12, rentalDays: 5, features: ['12hr lessons', '5 days rental', 'Free practice'] }
      ],
      color: 'blue',
      popular: true
    },
    {
      key: 'lessons-accommodation',
      title: 'Lessons + Stay',
      emoji: '🏨',
      category: 'accommodation_lesson',
      description: 'The complete vacation package. Accommodation and lessons combined for the best experience.',
      options: [
        { name: 'Weekend Escape', price: 455, nights: 2, hours: 6, features: ['2 nights hotel', '6hr lessons', 'Breakfast included'] },
        { name: 'Week Adventure', price: 850, nights: 5, hours: 10, features: ['5 nights hotel', '10hr lessons', 'Breakfast included'] },
        { name: 'Full Week', price: 1100, nights: 7, hours: 12, features: ['7 nights hotel', '12hr lessons', 'All meals'] }
      ],
      color: 'orange'
    },
    {
      key: 'all-inclusive',
      title: 'All Inclusive',
      emoji: '⭐',
      category: 'all_inclusive',
      description: 'Everything you need for the ultimate kitesurfing vacation. Stay, learn, and ride!',
      options: [
        { name: 'Ultimate Week', price: 1250, nights: 7, hours: 12, rentalDays: 7, features: ['7 nights stay', '12hr lessons', '7 days rental', 'All meals', 'Airport transfer'] },
        { name: 'Premium Week', price: 1500, nights: 7, hours: 15, rentalDays: 7, features: ['7 nights deluxe', '15hr lessons', '7 days premium rental', 'All meals', 'VIP service'] }
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
          🪁 Kite Experience Packages
        </Title>
        <Paragraph className="text-lg text-gray-600 max-w-3xl mx-auto">
          Discover our comprehensive kitesurfing packages. Whether you want just lessons, 
          lessons with rental, or a complete vacation package including accommodation - 
          we have options to match your needs and budget.
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

      {/* Why Packages */}
      <div className="mb-12">
        <Title level={2} className="text-center mb-8">Why Buy a Package?</Title>
        <Row gutter={[24, 24]}>
          <Col xs={24} sm={12} md={6}>
            <Card className="text-center h-full hover:shadow-md transition-shadow">
              <div className="text-4xl mb-4">💰</div>
              <Title level={4}>Save Money</Title>
              <Text type="secondary">Up to 25% savings compared to individual bookings</Text>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card className="text-center h-full hover:shadow-md transition-shadow">
              <div className="text-4xl mb-4">📅</div>
              <Title level={4}>Flexible Dates</Title>
              <Text type="secondary">Use your package hours whenever works for you</Text>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card className="text-center h-full hover:shadow-md transition-shadow">
              <div className="text-4xl mb-4">🎁</div>
              <Title level={4}>Extra Benefits</Title>
              <Text type="secondary">Packages include bonuses like video reviews and gear discounts</Text>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card className="text-center h-full hover:shadow-md transition-shadow">
              <div className="text-4xl mb-4">✨</div>
              <Title level={4}>Priority Booking</Title>
              <Text type="secondary">Package holders get priority for lesson scheduling</Text>
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
                          <Text strong className={`text-2xl ${category.premium ? 'text-purple-600' : 'text-sky-600'}`}>
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

      {/* Quick Links */}
      <Card className="mb-8 bg-gradient-to-r from-sky-50 to-blue-50">
        <Row gutter={[24, 24]} align="middle">
          <Col xs={24} md={16}>
            <Title level={3} className="!mb-2">
              <RocketOutlined className="text-sky-500 mr-2" />
              Ready to Start Your Kite Journey?
            </Title>
            <Paragraph className="text-gray-600 mb-0">
              Browse all our packages or contact us for a custom experience tailored to your needs.
            </Paragraph>
          </Col>
          <Col xs={24} md={8} className="text-center md:text-right">
            <Space>
              <Button type="primary" size="large" onClick={handleBuyPackage}>
                View All Packages
              </Button>
              <Button size="large" icon={<PhoneOutlined />} href="tel:+905071389196">
                Call Us
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* Contact */}
      <Card className="text-center">
        <Title level={3}>Custom Packages Available</Title>
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

export default ExperienceKitePackagesPage;
