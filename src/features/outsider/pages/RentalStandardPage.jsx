/**
 * RentalStandardPage
 * 
 * Informational page about standard rental equipment.
 * Shows full sets, boards, and hourly/daily pricing.
 * Opens booking wizard directly on this page without navigation.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Typography, Button, Row, Col, Tag, Divider, Space, List } from 'antd';
import {
  CheckCircleOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  SafetyOutlined
} from '@ant-design/icons';
import { usePageSEO } from '@/shared/utils/seo';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import StudentBookingWizard from '@/features/students/components/StudentBookingWizard';

const { Title, Paragraph, Text } = Typography;

const RentalStandardPage = () => {
  const navigate = useNavigate();
  const { formatCurrency, convertCurrency, userCurrency } = useCurrency();
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingInitialData, setBookingInitialData] = useState({});

  usePageSEO({
    title: 'Equipment Rental | UKC Academy',
    description: 'Rent quality kitesurfing equipment. Full sets, boards, and wetsuits available hourly, daily, or weekly.'
  });

  // Convert EUR prices to user currency
  const formatPrice = (eurPrice) => {
    const converted = convertCurrency(eurPrice, 'EUR', userCurrency);
    return formatCurrency(converted, userCurrency);
  };

  const handleBookRental = () => {
    // Open booking wizard on this page with rental category pre-selected
    setBookingInitialData({ serviceCategory: 'rental' });
    setBookingOpen(true);
  };

  const handleBookingClose = () => {
    setBookingOpen(false);
    setBookingInitialData({});
  };

  const packages = [
    {
      key: 'full-set',
      title: 'Full Set Rental',
      subtitle: 'Complete Kite Setup',
      icon: '🪁',
      description: 'Everything you need to get on the water. Our full sets are maintained daily and include the latest Duotone equipment.',
      options: [
        { duration: '1 hour', price: 35 },
        { duration: '4 hours (Half Day)', price: 55 },
        { duration: '8 hours (Full Day)', price: 75 },
        { duration: '1 Week', price: 380 }
      ],
      included: [
        'Duotone Kite (all sizes available)',
        'Kiteboard',
        'Harness & bar',
        'ION Wetsuit',
        'Safety leash & helmet'
      ],
      color: 'blue',
      popular: true
    },
    {
      key: 'kiteboard',
      title: 'Kiteboard Only',
      subtitle: 'Board Rental',
      icon: '🏄',
      description: 'Already have your own kite? Rent just a board. Great for travelers who want to pack light.',
      options: [
        { duration: '1 day', price: 20 },
        { duration: '1 week', price: 100 }
      ],
      included: [
        'Choice of board sizes',
        'Twin-tip or directional',
        'Straps/pads included',
        'Board bag available'
      ],
      color: 'green'
    },
    {
      key: 'wetsuit',
      title: 'Wetsuit Only',
      subtitle: 'ION Wetsuits',
      icon: '🩱',
      description: 'Premium ION wetsuits in all sizes. 3/2mm perfect for our warm Turkish waters.',
      options: [
        { duration: '1 day', price: 10 },
        { duration: '1 week', price: 50 }
      ],
      included: [
        'All sizes available',
        '3/2mm thickness',
        'Freshly washed',
        'Boots available (+5€)'
      ],
      color: 'cyan'
    },
    {
      key: 'harness',
      title: 'Harness & Bar',
      subtitle: 'Control System',
      icon: '🎯',
      description: 'Latest Duotone bars and comfortable harnesses. All sizes and styles available.',
      options: [
        { duration: '1 day', price: 15 },
        { duration: '1 week', price: 80 }
      ],
      included: [
        'Duotone Trust Bar',
        'Waist or seat harness',
        'Quick release system',
        'Safety briefing'
      ],
      color: 'orange'
    }
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Hero Section */}
      <div className="text-center mb-12">
        <Title level={1} className="!mb-4">
          🏄 Equipment Rental
        </Title>
        <Paragraph className="text-lg text-gray-600 max-w-3xl mx-auto">
          Get on the water with quality Duotone equipment. Our rental gear is 
          maintained daily to ensure you have the best possible experience. 
          From complete sets to individual items, we've got you covered!
        </Paragraph>
        <Button
          type="primary"
          size="large"
          icon={<CalendarOutlined />}
          onClick={handleBookRental}
          className="mt-4"
        >
          Book Equipment
        </Button>
      </div>

      <Divider />

      {/* Why Rent With Us */}
      <div className="mb-12">
        <Title level={2} className="text-center mb-8">Why Rent With Us?</Title>
        <Row gutter={[24, 24]}>
          <Col xs={24} sm={12} md={6}>
            <Card className="text-center h-full">
              <div className="text-4xl mb-4">✨</div>
              <Title level={4}>Quality Gear</Title>
              <Text type="secondary">Latest Duotone equipment, regularly updated</Text>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card className="text-center h-full">
              <div className="text-4xl mb-4">🔧</div>
              <Title level={4}>Daily Maintenance</Title>
              <Text type="secondary">All equipment checked every day</Text>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card className="text-center h-full">
              <div className="text-4xl mb-4">📏</div>
              <Title level={4}>All Sizes</Title>
              <Text type="secondary">Kites from 5m to 15m, boards for all levels</Text>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card className="text-center h-full">
              <div className="text-4xl mb-4">🛟</div>
              <Title level={4}>Rescue Support</Title>
              <Text type="secondary">Our boat is always ready if you need help</Text>
            </Card>
          </Col>
        </Row>
      </div>

      {/* Rental Packages */}
      <Title level={2} className="text-center mb-8">Rental Options</Title>
      <Row gutter={[24, 24]}>
        {packages.map((pkg) => (
          <Col xs={24} md={12} lg={6} key={pkg.key}>
            <Card 
              className={`h-full hover:shadow-lg transition-shadow ${pkg.popular ? 'border-2 border-blue-400' : ''}`}
              title={
                <div className="flex items-center gap-3">
                  <div className="text-3xl">{pkg.icon}</div>
                  <div>
                    <div className="text-lg font-semibold">
                      {pkg.title}
                      {pkg.popular && <Tag color="blue" className="ml-2">Popular</Tag>}
                    </div>
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
                    <div key={`${pkg.key}-${opt.duration}`} className="flex justify-between items-center bg-gray-50 p-2 rounded-lg">
                      <div className="flex items-center gap-1">
                        <ClockCircleOutlined className="text-gray-400" />
                        <Text className="text-sm">{opt.duration}</Text>
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
                onClick={handleBookRental}
              >
                Book Now
              </Button>
            </Card>
          </Col>
        ))}
      </Row>

      {/* Safety Notice */}
      <div className="mt-8 p-4 bg-blue-50 rounded-xl">
        <div className="flex items-start gap-3">
          <SafetyOutlined className="text-2xl text-blue-500 mt-1" />
          <div>
            <Title level={5} className="!mb-1">Safety First</Title>
            <Paragraph className="text-sm text-gray-600 mb-0">
              All rentals include a safety briefing. For independent riding, you must demonstrate 
              that you can safely self-rescue. If you're not yet at this level, consider booking 
              a supervision session with your rental.
            </Paragraph>
          </div>
        </div>
      </div>

      {/* Bottom CTA */}
      <div className="text-center mt-12 p-8 bg-gradient-to-r from-blue-50 to-cyan-50 rounded-xl">
        <Title level={3}>Ready to Ride?</Title>
        <Paragraph className="text-gray-600 mb-4">
          Book your equipment now and hit the water! Need premium gear? Check out our SLS & D/LAB options.
        </Paragraph>
        <Space>
          <Button
            type="primary"
            size="large"
            onClick={handleBookRental}
          >
            Book Full Set
          </Button>
          <Button
            size="large"
            onClick={() => navigate('/rental/premium')}
          >
            View Premium Equipment
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

export default RentalStandardPage;
