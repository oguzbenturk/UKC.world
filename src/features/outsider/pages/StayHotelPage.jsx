/**
 * StayHotelPage
 * 
 * Informational page about Hotel accommodation options.
 * Features Burlahan Otel in Urla with description, amenities, and booking.
 */

import { useState } from 'react';
import { Card, Typography, Button, Row, Col, Tag, Divider, Space, List, Rate } from 'antd';
import {
  EnvironmentOutlined,
  WifiOutlined,
  CoffeeOutlined,
  CarOutlined,
  CheckCircleOutlined,
  CalendarOutlined,
  PhoneOutlined,
  StarOutlined
} from '@ant-design/icons';
import { usePageSEO } from '@/shared/utils/seo';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import StudentBookingWizard from '@/features/students/components/StudentBookingWizard';

const { Title, Paragraph, Text } = Typography;

const StayHotelPage = () => {
  const { formatCurrency, convertCurrency, userCurrency } = useCurrency();
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingInitialData, setBookingInitialData] = useState({});

  usePageSEO({
    title: 'Hotel Accommodation | Burlahan Otel | UKC Stay',
    description: 'Stay at the peaceful Burlahan Otel in Urla while learning to kitesurf. Quality accommodation with beachfront access.'
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

  const hotelAmenities = [
    { icon: <WifiOutlined />, label: 'Free Wi-Fi' },
    { icon: <CoffeeOutlined />, label: 'Breakfast Included' },
    { icon: <CarOutlined />, label: 'Free Parking' },
    { icon: '🏊', label: 'Swimming Pool' },
    { icon: '🌅', label: 'Sea View Rooms' },
    { icon: '❄️', label: 'Air Conditioning' },
    { icon: '🚿', label: 'Private Bathroom' },
    { icon: '📺', label: 'Flat-screen TV' }
  ];

  const roomTypes = [
    {
      key: 'standard',
      title: 'Standard Room',
      description: 'Comfortable room with all essential amenities for a relaxing stay.',
      capacity: '2 guests',
      features: ['Queen bed', 'Private bathroom', 'Air conditioning', 'Free Wi-Fi'],
      pricePerNight: 60,
      image: '🏨'
    },
    {
      key: 'superior',
      title: 'Superior Room',
      description: 'Spacious room with garden or partial sea view. Perfect for couples.',
      capacity: '2 guests',
      features: ['King bed', 'Balcony', 'Mini fridge', 'Garden/Sea view'],
      pricePerNight: 80,
      image: '🌿'
    },
    {
      key: 'deluxe',
      title: 'Deluxe Sea View',
      description: 'Premium room with stunning sea views and extra space.',
      capacity: '2-3 guests',
      features: ['King bed + sofa', 'Large balcony', 'Full sea view', 'Sitting area'],
      pricePerNight: 110,
      image: '🌊'
    },
    {
      key: 'family',
      title: 'Family Suite',
      description: 'Perfect for families or groups. Two connected rooms with shared facilities.',
      capacity: '4-5 guests',
      features: ['2 bedrooms', 'Living area', 'Kitchenette', 'Private terrace'],
      pricePerNight: 150,
      image: '👨‍👩‍👧‍👦'
    }
  ];

  const packages = [
    {
      key: 'weekend',
      title: '2 Nights + 6 Hours Lessons',
      description: 'Perfect weekend getaway to learn kitesurfing',
      nights: 2,
      lessonHours: 6,
      price: 455,
      savings: '15% off',
      popular: true
    },
    {
      key: 'week',
      title: '5 Nights + 10 Hours Lessons',
      description: 'Full week of learning and relaxation',
      nights: 5,
      lessonHours: 10,
      price: 850,
      savings: '20% off',
      popular: false
    },
    {
      key: 'fullweek',
      title: '7 Nights + 12 Hours Lessons',
      description: 'Complete immersion for serious learners',
      nights: 7,
      lessonHours: 12,
      price: 1100,
      savings: '25% off',
      popular: false
    }
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Hero Section */}
      <div className="text-center mb-12">
        <Title level={1} className="!mb-4">
          🏨 Burlahan Otel
        </Title>
        <div className="flex items-center justify-center gap-2 mb-4">
          <EnvironmentOutlined className="text-sky-500" />
          <Text className="text-lg">Urla, Gülbahçe - İzmir, Turkey</Text>
        </div>
        <div className="flex items-center justify-center gap-2 mb-4">
          <Rate disabled defaultValue={4.5} allowHalf />
          <Text type="secondary">(4.5/5 - 120+ reviews)</Text>
        </div>
        <Paragraph className="text-lg text-gray-600 max-w-3xl mx-auto">
          Complete your kitesurfing journey with comfortable accommodation at Burlahan Otel. 
          Located just minutes from Urla Kite Center, our partner hotel offers peaceful, 
          quality rooms where you can rest after an exciting day on the water.
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
            Call for Reservations
          </Button>
        </Space>
      </div>

      <Divider />

      {/* About the Hotel */}
      <div className="mb-12">
        <Title level={2} className="text-center mb-8">About Burlahan Otel</Title>
        <Row gutter={[24, 24]}>
          <Col xs={24} md={12}>
            <Card className="h-full">
              <Title level={4}>Why Stay Here?</Title>
              <Paragraph>
                Burlahan Otel is our preferred accommodation partner, offering a perfect 
                blend of comfort and convenience for kitesurfers. The hotel is located 
                in the peaceful Gülbahçe area, just a short drive from Urla Kite Center.
              </Paragraph>
              <Paragraph>
                With its serene atmosphere, beautiful gardens, and friendly staff, 
                you'll feel right at home during your kitesurfing vacation. Wake up 
                refreshed and ready for another day of wind and waves!
              </Paragraph>
            </Card>
          </Col>
          <Col xs={24} md={12}>
            <Card className="h-full">
              <Title level={4}>Location Advantages</Title>
              <List
                size="small"
                dataSource={[
                  '5 minutes drive to Urla Kite Center',
                  'Shuttle service available',
                  'Close to local restaurants',
                  'Quiet residential area',
                  'Easy access to Urla town center',
                  'Near Gülbahçe harbor'
                ]}
                renderItem={(item) => (
                  <List.Item>
                    <CheckCircleOutlined className="text-green-500 mr-2" />
                    {item}
                  </List.Item>
                )}
              />
            </Card>
          </Col>
        </Row>
      </div>

      {/* Amenities */}
      <div className="mb-12">
        <Title level={2} className="text-center mb-8">Hotel Amenities</Title>
        <Row gutter={[16, 16]} justify="center">
          {hotelAmenities.map((amenity) => (
            <Col xs={12} sm={8} md={6} lg={3} key={amenity.label}>
              <Card className="text-center h-full hover:shadow-md transition-shadow">
                <div className="text-2xl mb-2">{amenity.icon}</div>
                <Text className="text-sm">{amenity.label}</Text>
              </Card>
            </Col>
          ))}
        </Row>
      </div>

      {/* Room Types */}
      <div className="mb-12">
        <Title level={2} className="text-center mb-8">Room Options</Title>
        <Row gutter={[24, 24]}>
          {roomTypes.map((room) => (
            <Col xs={24} sm={12} lg={6} key={room.key}>
              <Card 
                className="h-full hover:shadow-lg transition-shadow"
                title={
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{room.image}</span>
                    <span>{room.title}</span>
                  </div>
                }
              >
                <Paragraph type="secondary" className="text-sm mb-3">
                  {room.description}
                </Paragraph>
                <Tag color="blue" className="mb-3">{room.capacity}</Tag>
                <List
                  size="small"
                  dataSource={room.features}
                  renderItem={(item) => (
                    <List.Item className="!py-1 !px-0 border-0">
                      <CheckCircleOutlined className="text-green-500 mr-2 text-xs" />
                      <Text className="text-sm">{item}</Text>
                    </List.Item>
                  )}
                />
                <Divider className="my-3" />
                <div className="text-center">
                  <Text type="secondary" className="text-xs">From</Text>
                  <div>
                    <Text strong className="text-xl text-sky-600">
                      {formatPrice(room.pricePerNight)}
                    </Text>
                    <Text type="secondary"> / night</Text>
                  </div>
                </div>
              </Card>
            </Col>
          ))}
        </Row>
      </div>

      {/* Combined Packages */}
      <div className="mb-12 bg-gradient-to-r from-sky-50 to-blue-50 rounded-2xl p-8">
        <Title level={2} className="text-center mb-2">Stay + Lessons Packages</Title>
        <Paragraph className="text-center text-gray-600 mb-8">
          Save money with our combined accommodation and lesson packages!
        </Paragraph>
        <Row gutter={[24, 24]}>
          {packages.map((pkg) => (
            <Col xs={24} md={8} key={pkg.key}>
              <Card 
                className={`h-full hover:shadow-lg transition-shadow ${pkg.popular ? 'border-2 border-sky-400' : ''}`}
              >
                {pkg.popular && (
                  <Tag color="gold" className="absolute -top-3 left-4">
                    <StarOutlined /> Most Popular
                  </Tag>
                )}
                <div className="text-center">
                  <Title level={4} className="!mb-2">{pkg.title}</Title>
                  <Paragraph type="secondary" className="text-sm">
                    {pkg.description}
                  </Paragraph>
                  <div className="my-4">
                    <Tag color="blue">{pkg.nights} Nights</Tag>
                    <Tag color="green">{pkg.lessonHours} Hours Lessons</Tag>
                  </div>
                  <Tag color="red" className="mb-4">{pkg.savings}</Tag>
                  <div className="mb-4">
                    <Text type="secondary" className="text-sm">Starting from</Text>
                    <div>
                      <Text strong className="text-2xl text-sky-600">
                        {formatPrice(pkg.price)}
                      </Text>
                    </div>
                  </div>
                  <Button 
                    type="primary" 
                    block 
                    onClick={handleBookAccommodation}
                  >
                    Book This Package
                  </Button>
                </div>
              </Card>
            </Col>
          ))}
        </Row>
      </div>

      {/* Contact Info */}
      <Card className="text-center">
        <Title level={3}>Need Help Booking?</Title>
        <Paragraph>
          Contact us directly for custom packages or special requests.
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

export default StayHotelPage;
