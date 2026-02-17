/**
 * StudentBookEquipmentPage
 * 
 * Informational page about equipment rentals.
 * Shows rental options, pricing, and what's included.
 * Opens booking wizard directly on this page without navigation.
 */

import { useState, useEffect } from 'react';
import { Card, Typography, Button, Row, Col, Tag, Spin, Empty, Divider, List } from 'antd';
import {
  ShoppingCartOutlined,
  ClockCircleOutlined,
  SafetyOutlined,
  ThunderboltOutlined,
  CheckCircleOutlined,
  ToolOutlined,
  StarOutlined,
  SyncOutlined
} from '@ant-design/icons';
import { usePageSEO } from '@/shared/utils/seo';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import StudentBookingWizard from '@/features/students/components/StudentBookingWizard';
import apiClient from '@/shared/services/apiClient';

const { Title, Paragraph, Text } = Typography;

// Helper function to construct image URLs correctly
const getImageUrl = (imageUrl) => {
  if (!imageUrl) return null;
  if (imageUrl.startsWith('http')) return imageUrl;
  return imageUrl;
};

// Static rental packages for display
const rentalPackages = [
  {
    key: 'kite-complete',
    title: 'Complete Kite Set',
    subtitle: 'Everything you need to ride',
    icon: <ThunderboltOutlined className="text-4xl text-orange-500" />,
    description: 'Full kite setup including kite, bar, lines, harness, and wetsuit. Perfect for certified kiters who want to ride with premium equipment.',
    options: [
      { duration: '1 hour', price: 40 },
      { duration: '3 hours', price: 100 },
      { duration: 'Full day', price: 150 }
    ],
    included: [
      'Latest Duotone or Core kite',
      'Bar & lines',
      'Waist or seat harness',
      'Wetsuit (seasonal)',
      'Impact vest',
      'Helmet on request'
    ],
    color: 'orange'
  },
  {
    key: 'kite-only',
    title: 'Kite & Bar Only',
    subtitle: 'For riders with their own gear',
    icon: <StarOutlined className="text-4xl text-blue-500" />,
    description: 'Just the kite and bar for experienced riders who have their own harness and wetsuit. Choose from our range of sizes (7m-12m).',
    options: [
      { duration: '1 hour', price: 30 },
      { duration: '3 hours', price: 75 },
      { duration: 'Full day', price: 120 }
    ],
    included: [
      'Premium kite (7-12m available)',
      'Bar & lines',
      'Pump',
      'Different sizes available'
    ],
    color: 'blue'
  },
  {
    key: 'board',
    title: 'Board Rental',
    subtitle: 'Twin-tip or surfboard',
    icon: <ToolOutlined className="text-4xl text-green-500" />,
    description: 'High-quality boards for all conditions. Choose from twin-tips for beginners to strapless surfboards for waves.',
    options: [
      { duration: '1 hour', price: 15 },
      { duration: '3 hours', price: 35 },
      { duration: 'Full day', price: 50 }
    ],
    included: [
      'Twin-tip or surfboard',
      'Pads & straps adjusted',
      'Fins included',
      'Board bag'
    ],
    color: 'green'
  },
  {
    key: 'wetsuit',
    title: 'Wetsuit & Accessories',
    subtitle: 'Protection for the water',
    icon: <SafetyOutlined className="text-4xl text-purple-500" />,
    description: 'Stay comfortable in any condition with our range of wetsuits, impact vests, and helmets.',
    options: [
      { duration: 'Wetsuit (day)', price: 15 },
      { duration: 'Impact vest (day)', price: 10 },
      { duration: 'Helmet (day)', price: 5 }
    ],
    included: [
      'Various sizes available',
      'Shorties and full suits',
      'Cleaned after each use',
      'Impact protection'
    ],
    color: 'purple'
  }
];

function StudentBookEquipmentPage() {
  const { formatCurrency, convertCurrency, userCurrency } = useCurrency();
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingInitialData, setBookingInitialData] = useState({});
  const [rentalServices, setRentalServices] = useState([]);
  const [loading, setLoading] = useState(true);

  usePageSEO({
    title: 'Book Equipment | UKC Academy',
    description: 'Rent quality Duotone and Core equipment for your kitesurfing session. All gear maintained daily with safety equipment included.'
  });

  // Load rental services
  useEffect(() => {
    const loadRentalServices = async () => {
      try {
        setLoading(true);
        const response = await apiClient.get('/services', {
          params: { serviceType: 'rental', status: 'active' }
        });
        setRentalServices(response.data || []);
      } catch {
        // Error loading rental services
      } finally {
        setLoading(false);
      }
    };
    loadRentalServices();
  }, []);

  const formatPrice = (eurPrice) => {
    const converted = convertCurrency(eurPrice, 'EUR', userCurrency);
    return formatCurrency(converted, userCurrency);
  };

  const handleBookEquipment = (service = null) => {
    const initialData = { serviceCategory: 'rental' };
    if (service) {
      initialData.serviceId = service.id;
    }
    setBookingInitialData(initialData);
    setBookingOpen(true);
  };

  const handleBookingClose = () => {
    setBookingOpen(false);
    setBookingInitialData({});
  };

  const renderServiceCard = (service) => {
    const imageUrl = getImageUrl(service.image_url);

    return (
      <Col xs={24} sm={12} lg={8} key={service.id}>
        <Card
          className="h-full hover:shadow-lg transition-all duration-300 rounded-xl"
          cover={
            imageUrl ? (
              <div className="h-40 overflow-hidden rounded-t-xl">
                <img 
                  src={imageUrl}
                  alt={service.name}
                  className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                />
              </div>
            ) : (
              <div className="h-40 bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center rounded-t-xl">
                <ThunderboltOutlined className="text-5xl text-white opacity-80" />
              </div>
            )
          }
        >
          <div className="flex justify-between items-start mb-2">
            <h3 className="text-lg font-semibold text-gray-800">{service.name}</h3>
            {service.name?.toLowerCase().includes('premium') && (
              <Tag color="gold" className="rounded-full">Premium</Tag>
            )}
          </div>
          
          {service.description && (
            <p className="text-gray-500 text-sm line-clamp-2 mb-3">
              {service.description}
            </p>
          )}
          
          <div className="flex items-center gap-2 text-gray-600 text-sm mb-3">
            <ClockCircleOutlined />
            <span>{service.duration || 60} min</span>
          </div>

          <div className="flex items-baseline justify-between mb-4">
            <span className="text-xl font-bold text-orange-600">
              {formatPrice(service.price)}
            </span>
          </div>

          <Button 
            type="primary" 
            icon={<ShoppingCartOutlined />}
            onClick={() => handleBookEquipment(service)}
            className="w-full bg-orange-500 hover:bg-orange-600 border-none"
          >
            Book Now
          </Button>
        </Card>
      </Col>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Hero Section */}
      <div className="text-center mb-12">
        <Title level={1} className="!mb-4">
          🏄 Equipment Rental
        </Title>
        <Paragraph className="text-lg text-gray-600 max-w-3xl mx-auto">
          Rent premium Duotone and Core equipment for your session! All gear is maintained daily 
          and includes safety equipment. From complete kite sets to individual items, 
          we have everything you need for a perfect day on the water.
        </Paragraph>
        <Button
          type="primary"
          size="large"
          icon={<ShoppingCartOutlined />}
          onClick={() => handleBookEquipment()}
          className="mt-4 h-12 px-8 bg-orange-500 hover:bg-orange-600 border-none"
        >
          Book Equipment Now
        </Button>
      </div>

      <Divider />

      {/* Why Rent From Us */}
      <div className="mb-12">
        <Title level={2} className="text-center mb-8">Why Rent From Us?</Title>
        <Row gutter={[24, 24]}>
          <Col xs={24} sm={12} md={6}>
            <Card className="text-center h-full hover:shadow-lg transition-shadow">
              <div className="text-4xl mb-4">🏆</div>
              <Title level={4}>Premium Brands</Title>
              <Text type="secondary">Latest Duotone and Core equipment, updated each season</Text>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card className="text-center h-full hover:shadow-lg transition-shadow">
              <div className="text-4xl mb-4">🔧</div>
              <Title level={4}>Daily Maintenance</Title>
              <Text type="secondary">All gear inspected and maintained every single day</Text>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card className="text-center h-full hover:shadow-lg transition-shadow">
              <div className="text-4xl mb-4">🎯</div>
              <Title level={4}>All Sizes</Title>
              <Text type="secondary">Kites from 7m to 12m, boards and wetsuits for everyone</Text>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card className="text-center h-full hover:shadow-lg transition-shadow">
              <div className="text-4xl mb-4">⛑️</div>
              <Title level={4}>Safety First</Title>
              <Text type="secondary">Impact vests, helmets, and rescue support available</Text>
            </Card>
          </Col>
        </Row>
      </div>

      {/* Rental Packages */}
      <Title level={2} className="text-center mb-8">Our Rental Options</Title>
      <Row gutter={[24, 24]} className="mb-12">
        {rentalPackages.map((pkg) => (
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
                <Text strong className="block mb-2">Pricing:</Text>
                <div className="space-y-2">
                  {pkg.options.map((opt) => (
                    <div key={`${pkg.key}-${opt.duration}`} className="flex justify-between items-center bg-gray-50 p-3 rounded-lg">
                      <div>
                        <Text strong>{opt.duration}</Text>
                      </div>
                      <Tag color={pkg.color} className="text-base px-3 py-1">
                        {formatPrice(opt.price)}
                      </Tag>
                    </div>
                  ))}
                </div>
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
                icon={<ShoppingCartOutlined />}
                onClick={() => handleBookEquipment()}
                className="bg-orange-500 hover:bg-orange-600 border-none"
              >
                Book {pkg.title}
              </Button>
            </Card>
          </Col>
        ))}
      </Row>

      {/* Available Equipment from Services - if loaded */}
      {rentalServices.length > 0 && (
        <>
          <Divider />
          <Title level={2} className="text-center mb-4">Available Right Now</Title>
          <Paragraph className="text-center text-gray-600 mb-8">
            Current equipment available for booking
          </Paragraph>
          <Row gutter={[16, 16]}>
            {rentalServices.slice(0, 6).map(renderServiceCard)}
          </Row>
        </>
      )}

      {/* Bottom CTA */}
      <div className="text-center mt-12 p-8 bg-gradient-to-r from-orange-50 to-yellow-50 rounded-xl">
        <Title level={3}>Ready to Hit the Water?</Title>
        <Paragraph className="text-gray-600 mb-4">
          Book your equipment now and enjoy premium gear for your session.
        </Paragraph>
        <div className="flex justify-center gap-4 flex-wrap">
          <Button
            type="primary"
            size="large"
            icon={<ShoppingCartOutlined />}
            onClick={() => handleBookEquipment()}
            className="bg-orange-500 hover:bg-orange-600 border-none"
          >
            Book Equipment
          </Button>
          <Button
            size="large"
            icon={<SyncOutlined />}
            onClick={() => window.location.href = '/rental/my-rentals'}
          >
            View My Rentals
          </Button>
        </div>
      </div>

      {/* Info Notice */}
      {rentalServices.length === 0 && !loading && (
        <Card className="mt-8 rounded-xl shadow-sm border-blue-200 bg-blue-50">
          <Empty 
            description={
              <span className="text-gray-600">
                No specific rental services configured yet. Contact us to book equipment directly!
              </span>
            }
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          >
            <Button type="primary" onClick={() => handleBookEquipment()}>
              Contact for Rentals
            </Button>
          </Empty>
        </Card>
      )}

      {/* Booking Wizard */}
      <StudentBookingWizard
        open={bookingOpen}
        onClose={handleBookingClose}
        initialData={bookingInitialData}
      />
    </div>
  );
}

export default StudentBookEquipmentPage;
