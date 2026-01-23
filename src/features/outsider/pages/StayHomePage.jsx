/**
 * StayHomePage
 * 
 * Informational page about Home accommodation options.
 * Features: Pool Studio Big, Pool Studio Small, Farm House, Staff accommodations.
 */

import { useState } from 'react';
import { Card, Typography, Button, Row, Col, Tag, Divider, Space, List, Badge } from 'antd';
import {
  EnvironmentOutlined,
  WifiOutlined,
  CheckCircleOutlined,
  CalendarOutlined,
  PhoneOutlined,
  TeamOutlined,
  HeartOutlined
} from '@ant-design/icons';
import { usePageSEO } from '@/shared/utils/seo';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import StudentBookingWizard from '@/features/students/components/StudentBookingWizard';

const { Title, Paragraph, Text } = Typography;

const StayHomePage = () => {
  const { formatCurrency, convertCurrency, userCurrency } = useCurrency();
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingInitialData, setBookingInitialData] = useState({});

  usePageSEO({
    title: 'Home Accommodation | Pool Studios & Farm House | UKC Stay',
    description: 'Stay at our cozy home accommodations. Pool studios, farm house options, and staff quarters for an authentic experience.'
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

  const accommodations = [
    {
      key: 'pool-studio-big',
      title: 'Pool Studio Big',
      subtitle: 'Spacious poolside living',
      emoji: '🏊‍♂️',
      description: 'Our largest pool studio offering generous space with direct pool access. Perfect for couples or solo travelers who want extra room to relax.',
      capacity: '2-3 guests',
      size: '45 m²',
      features: [
        'Direct pool access',
        'King-size bed',
        'Fully equipped kitchenette',
        'Large private terrace',
        'Air conditioning',
        'Smart TV',
        'Free Wi-Fi',
        'Garden view'
      ],
      pricePerNight: 95,
      color: 'blue',
      popular: true
    },
    {
      key: 'pool-studio-small',
      title: 'Pool Studio Small',
      subtitle: 'Cozy poolside retreat',
      emoji: '🌴',
      description: 'A charming compact studio with pool access. Ideal for solo travelers or couples who prefer a cozy atmosphere.',
      capacity: '1-2 guests',
      size: '30 m²',
      features: [
        'Pool access',
        'Queen-size bed',
        'Kitchenette',
        'Private terrace',
        'Air conditioning',
        'Free Wi-Fi',
        'Garden view'
      ],
      pricePerNight: 65,
      color: 'green',
      popular: false
    },
    {
      key: 'farm-house',
      title: 'Farm House',
      subtitle: 'Authentic countryside experience',
      emoji: '🏡',
      description: 'Experience authentic Turkish countryside living in our charming farm house. Surrounded by nature, perfect for those seeking peace and tranquility.',
      capacity: '4-6 guests',
      size: '80 m²',
      features: [
        '2 bedrooms',
        'Full kitchen',
        'Living room',
        'Private garden',
        'BBQ area',
        'Outdoor seating',
        'Parking',
        'Countryside views'
      ],
      pricePerNight: 120,
      color: 'orange',
      popular: false
    },
    {
      key: 'staff',
      title: 'Staff Accommodation',
      subtitle: 'Budget-friendly shared option',
      emoji: '🛏️',
      description: 'Simple, clean shared accommodation for instructors, long-term students, or budget travelers. Part of our community living experience.',
      capacity: '1 guest (shared)',
      size: 'Shared dormitory',
      features: [
        'Single bed',
        'Shared bathroom',
        'Shared kitchen',
        'Common area',
        'Free Wi-Fi',
        'Laundry facilities',
        'Community atmosphere'
      ],
      pricePerNight: 25,
      color: 'purple',
      popular: false,
      isShared: true
    }
  ];

  const homeAmenities = [
    { icon: '🏊', label: 'Pool Access', description: 'Shared swimming pool' },
    { icon: '🌳', label: 'Garden', description: 'Beautiful green spaces' },
    { icon: <WifiOutlined />, label: 'Free Wi-Fi', description: 'High-speed internet' },
    { icon: '🚗', label: 'Parking', description: 'Free parking available' },
    { icon: '🍳', label: 'Kitchen', description: 'Cooking facilities' },
    { icon: '👕', label: 'Laundry', description: 'Washing machine access' }
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Hero Section */}
      <div className="text-center mb-12">
        <Title level={1} className="!mb-4">
          🏠 Home Accommodations
        </Title>
        <div className="flex items-center justify-center gap-2 mb-4">
          <EnvironmentOutlined className="text-green-500" />
          <Text className="text-lg">Urla, Gülbahçe - Private Properties</Text>
        </div>
        <Paragraph className="text-lg text-gray-600 max-w-3xl mx-auto">
          Experience authentic living with our home accommodation options. From poolside 
          studios to a charming farm house, we offer unique stays that make you feel 
          like a local while enjoying your kitesurfing adventure.
        </Paragraph>
        <Space className="mt-4">
          <Button
            type="primary"
            size="large"
            icon={<CalendarOutlined />}
            onClick={handleBookAccommodation}
          >
            Book Accommodation
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

      {/* Why Choose Home */}
      <div className="mb-12">
        <Title level={2} className="text-center mb-8">Why Choose Home Stays?</Title>
        <Row gutter={[24, 24]}>
          <Col xs={24} sm={12} md={6}>
            <Card className="text-center h-full hover:shadow-md transition-shadow">
              <div className="text-4xl mb-4">🏡</div>
              <Title level={4}>Like a Local</Title>
              <Text type="secondary">Experience authentic Turkish living in a home setting</Text>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card className="text-center h-full hover:shadow-md transition-shadow">
              <div className="text-4xl mb-4">👨‍👩‍👧‍👦</div>
              <Title level={4}>Family Friendly</Title>
              <Text type="secondary">Spacious options for families and groups</Text>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card className="text-center h-full hover:shadow-md transition-shadow">
              <div className="text-4xl mb-4">🍳</div>
              <Title level={4}>Self-Catering</Title>
              <Text type="secondary">Kitchens available to cook your own meals</Text>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card className="text-center h-full hover:shadow-md transition-shadow">
              <div className="text-4xl mb-4">🌿</div>
              <Title level={4}>Nature & Peace</Title>
              <Text type="secondary">Quiet surroundings away from busy areas</Text>
            </Card>
          </Col>
        </Row>
      </div>

      {/* Shared Amenities */}
      <div className="mb-12 bg-gradient-to-r from-green-50 to-teal-50 rounded-2xl p-8">
        <Title level={2} className="text-center mb-8">Shared Amenities</Title>
        <Row gutter={[24, 24]} justify="center">
          {homeAmenities.map((amenity) => (
            <Col xs={12} sm={8} md={4} key={amenity.label}>
              <Card className="text-center h-full">
                <div className="text-3xl mb-2">{amenity.icon}</div>
                <Text strong className="block">{amenity.label}</Text>
                <Text type="secondary" className="text-xs">{amenity.description}</Text>
              </Card>
            </Col>
          ))}
        </Row>
      </div>

      {/* Accommodation Options */}
      <Title level={2} className="text-center mb-8">Our Home Options</Title>
      <Row gutter={[24, 24]}>
        {accommodations.map((acc) => (
          <Col xs={24} md={12} lg={6} key={acc.key}>
            <Badge.Ribbon 
              text={acc.popular ? "Most Popular" : null} 
              color="gold"
              style={{ display: acc.popular ? 'block' : 'none' }}
            >
              <Card 
                className={`h-full hover:shadow-lg transition-shadow ${acc.popular ? 'border-2 border-amber-400' : ''}`}
              >
                <div className="text-center mb-4">
                  <span className="text-5xl">{acc.emoji}</span>
                </div>
                <Title level={4} className="text-center !mb-1">{acc.title}</Title>
                <Text type="secondary" className="block text-center text-sm mb-3">
                  {acc.subtitle}
                </Text>
                <Paragraph className="text-sm text-gray-600 mb-3">
                  {acc.description}
                </Paragraph>
                <div className="flex justify-center gap-2 mb-3">
                  <Tag color={acc.color}>{acc.capacity}</Tag>
                  <Tag>{acc.size}</Tag>
                </div>
                <Divider className="my-3" />
                <List
                  size="small"
                  className="mb-4"
                  dataSource={acc.features.slice(0, 5)}
                  renderItem={(item) => (
                    <List.Item className="!py-1 !px-0 border-0">
                      <CheckCircleOutlined className="text-green-500 mr-2 text-xs" />
                      <Text className="text-xs">{item}</Text>
                    </List.Item>
                  )}
                />
                {acc.features.length > 5 && (
                  <Text type="secondary" className="text-xs block text-center mb-3">
                    +{acc.features.length - 5} more amenities
                  </Text>
                )}
                <Divider className="my-3" />
                <div className="text-center">
                  <Text type="secondary" className="text-xs">
                    {acc.isShared ? 'Per person' : 'From'}
                  </Text>
                  <div>
                    <Text strong className="text-xl text-green-600">
                      {formatPrice(acc.pricePerNight)}
                    </Text>
                    <Text type="secondary"> / night</Text>
                  </div>
                </div>
                <Button 
                  type="primary" 
                  block 
                  className="mt-4"
                  onClick={handleBookAccommodation}
                >
                  Book Now
                </Button>
              </Card>
            </Badge.Ribbon>
          </Col>
        ))}
      </Row>

      <Divider className="my-12" />

      {/* Long Stay Discounts */}
      <div className="mb-12">
        <Card className="bg-gradient-to-r from-sky-50 to-blue-50">
          <Row gutter={[24, 24]} align="middle">
            <Col xs={24} md={16}>
              <Title level={3} className="!mb-2">
                <HeartOutlined className="text-red-500 mr-2" />
                Long Stay Discounts
              </Title>
              <Paragraph className="text-gray-600 mb-0">
                Planning an extended kitesurfing vacation? We offer special rates for longer stays:
              </Paragraph>
              <div className="mt-4">
                <Tag color="green" className="text-sm py-1 px-3">7+ nights: 10% off</Tag>
                <Tag color="blue" className="text-sm py-1 px-3 ml-2">14+ nights: 15% off</Tag>
                <Tag color="purple" className="text-sm py-1 px-3 ml-2">30+ nights: 25% off</Tag>
              </div>
            </Col>
            <Col xs={24} md={8} className="text-center md:text-right">
              <Button 
                type="primary" 
                size="large" 
                icon={<PhoneOutlined />}
                href="tel:+905071389196"
              >
                Contact for Long Stay
              </Button>
            </Col>
          </Row>
        </Card>
      </div>

      {/* Community Vibe */}
      <Card className="mb-8">
        <Row gutter={[24, 24]} align="middle">
          <Col xs={24} md={12}>
            <Title level={3}>
              <TeamOutlined className="mr-2" />
              Join Our Community
            </Title>
            <Paragraph>
              Staying at our home accommodations means becoming part of the UKC family. 
              Share stories with fellow kitesurfers, join BBQ evenings, and make friends 
              from around the world who share your passion for wind and waves.
            </Paragraph>
          </Col>
          <Col xs={24} md={12}>
            <div className="flex gap-4 flex-wrap justify-center md:justify-end">
              <Tag className="text-base py-2 px-4">🌅 Sunset Sessions</Tag>
              <Tag className="text-base py-2 px-4">🍖 BBQ Nights</Tag>
              <Tag className="text-base py-2 px-4">🎸 Social Events</Tag>
              <Tag className="text-base py-2 px-4">📸 Photo Sharing</Tag>
            </div>
          </Col>
        </Row>
      </Card>

      {/* Contact Info */}
      <Card className="text-center">
        <Title level={3}>Questions About Accommodations?</Title>
        <Paragraph>
          Contact us directly for availability, custom packages, or special requests.
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

export default StayHomePage;
