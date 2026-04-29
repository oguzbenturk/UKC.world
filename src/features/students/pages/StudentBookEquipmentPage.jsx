/**
 * StudentBookEquipmentPage
 * 
 * Informational page about equipment rentals.
 * Shows rental options, pricing, and what's included.
 * Opens booking wizard directly on this page without navigation.
 */

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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
import RentalBookingModal from '@/features/outsider/components/RentalBookingModal';
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
  const { t } = useTranslation(['student']);
  const { formatCurrency, formatDualCurrency, convertCurrency, userCurrency } = useCurrency();
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingInitialData, setBookingInitialData] = useState({});
  const [rentalServices, setRentalServices] = useState([]);
  const [loading, setLoading] = useState(true);
  // Rental booking modal (for specific service selections)
  const [rentalModalOpen, setRentalModalOpen] = useState(false);
  const [rentalModalData, setRentalModalData] = useState(null);

  usePageSEO({
    title: t('student:bookEquipment.seoTitle'),
    description: t('student:bookEquipment.seoDescription')
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

  const formatPrice = (eurPrice) => formatDualCurrency(eurPrice, 'EUR');

  const handleBookEquipment = (service = null) => {
    if (service && service.id) {
      // Specific service selected — use the streamlined RentalBookingModal
      setRentalModalData({
        serviceId: service.id,
        serviceName: service.name || 'Equipment Rental',
        servicePrice: parseFloat(service.price) || 0,
        serviceCurrency: service.currency || 'EUR',
        durationHours: (parseFloat(service.duration) || 60) / 60, // service.duration is in minutes
        serviceDescription: service.description || '',
      });
      setRentalModalOpen(true);
      return;
    }
    // No specific service — use generic booking wizard to browse
    const initialData = { serviceCategory: 'rental' };
    setBookingInitialData(initialData);
    setBookingOpen(true);
  };

  const handleBookingClose = () => {
    setBookingOpen(false);
    setBookingInitialData({});
  };

  const handleRentalModalClose = () => {
    setRentalModalOpen(false);
    setRentalModalData(null);
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
            <h3 className="text-lg font-duotone-bold text-gray-800">{service.name}</h3>
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
            {t('student:bookEquipment.bookServiceButton')}
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
          🏄 {t('student:bookEquipment.heroTitle')}
        </Title>
        <Paragraph className="text-lg text-gray-600 max-w-3xl mx-auto">
          {t('student:bookEquipment.heroBody')}
        </Paragraph>
        <Button
          type="primary"
          size="large"
          icon={<ShoppingCartOutlined />}
          onClick={() => handleBookEquipment()}
          className="mt-4 h-12 px-8 bg-orange-500 hover:bg-orange-600 border-none"
        >
          {t('student:bookEquipment.bookNowButton')}
        </Button>
      </div>

      <Divider />

      {/* Why Rent From Us */}
      <div className="mb-12">
        <Title level={2} className="text-center mb-8">{t('student:bookEquipment.whyRentTitle')}</Title>
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
      <Title level={2} className="text-center mb-8">{t('student:bookEquipment.rentalOptionsTitle')}</Title>
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
                <Text strong className="block mb-2">{t('student:bookEquipment.pricing')}</Text>
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
                <Text strong className="block mb-2">{t('student:bookEquipment.whatsIncluded')}</Text>
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
                {t('student:bookEquipment.bookPackageButton', { title: pkg.title })}
              </Button>
            </Card>
          </Col>
        ))}
      </Row>

      {/* Available Equipment from Services - if loaded */}
      {rentalServices.length > 0 && (
        <>
          <Divider />
          <Title level={2} className="text-center mb-4">{t('student:bookEquipment.availableNowTitle')}</Title>
          <Paragraph className="text-center text-gray-600 mb-8">
            {t('student:bookEquipment.availableNowSubtitle')}
          </Paragraph>
          <Row gutter={[16, 16]}>
            {rentalServices.slice(0, 6).map(renderServiceCard)}
          </Row>
        </>
      )}

      {/* Bottom CTA */}
      <div className="text-center mt-12 p-8 bg-gradient-to-r from-orange-50 to-yellow-50 rounded-xl">
        <Title level={3}>{t('student:bookEquipment.readyTitle')}</Title>
        <Paragraph className="text-gray-600 mb-4">
          {t('student:bookEquipment.readyBody')}
        </Paragraph>
        <div className="flex justify-center gap-4 flex-wrap">
          <Button
            type="primary"
            size="large"
            icon={<ShoppingCartOutlined />}
            onClick={() => handleBookEquipment()}
            className="bg-orange-500 hover:bg-orange-600 border-none"
          >
            {t('student:bookEquipment.bookEquipmentButton')}
          </Button>
          <Button
            size="large"
            icon={<SyncOutlined />}
            onClick={() => window.location.href = '/rental/my-rentals'}
          >
            {t('student:bookEquipment.viewMyRentals')}
          </Button>
        </div>
      </div>

      {/* Info Notice */}
      {rentalServices.length === 0 && !loading && (
        <Card className="mt-8 rounded-xl shadow-sm border-blue-200 bg-blue-50">
          <Empty
            description={
              <span className="text-gray-600">
                {t('student:bookEquipment.noServicesDesc')}
              </span>
            }
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          >
            <Button type="primary" onClick={() => handleBookEquipment()}>
              {t('student:bookEquipment.contactForRentals')}
            </Button>
          </Empty>
        </Card>
      )}

      {/* Booking Wizard (fallback for generic browse) */}
      <StudentBookingWizard
        open={bookingOpen}
        onClose={handleBookingClose}
        initialData={bookingInitialData}
      />

      {/* Rental Booking Modal (for specific services) */}
      <RentalBookingModal
        open={rentalModalOpen}
        onClose={handleRentalModalClose}
        serviceId={rentalModalData?.serviceId}
        serviceName={rentalModalData?.serviceName}
        servicePrice={rentalModalData?.servicePrice}
        serviceCurrency={rentalModalData?.serviceCurrency}
        durationHours={rentalModalData?.durationHours}
        serviceDescription={rentalModalData?.serviceDescription}
      />
    </div>
  );
}

export default StudentBookEquipmentPage;
