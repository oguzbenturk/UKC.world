/**
 * StayBookingPage
 *
 * Main Stay booking page with overview of accommodation options.
 * Links to Hotel and Home pages with ability to book accommodation packages.
 */

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, Typography, Button, Row, Col, Tag, Divider, Space, List } from 'antd';
import {
  EnvironmentOutlined,
  CalendarOutlined,
  PhoneOutlined,
  RightOutlined,
  CheckCircleOutlined,
  StarOutlined
} from '@ant-design/icons';
import { usePageSEO } from '@/shared/utils/seo';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import StudentBookingWizard from '@/features/students/components/StudentBookingWizard';

const { Title, Paragraph, Text } = Typography;

const StayBookingPage = () => {
  const navigate = useNavigate();
  const { t } = useTranslation(['outsider']);
  const { formatCurrency, convertCurrency, userCurrency } = useCurrency();
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingInitialData, setBookingInitialData] = useState({});

  usePageSEO({
    title: 'Book Accommodation | Stay | UKC',
    description: 'Find the perfect accommodation for your kitesurfing vacation. Hotels, pool studios, and home options in Urla.'
  });

  // Show EUR price with user's local currency equivalent
  const formatPrice = (eurPrice) => {
    const eurFormatted = formatCurrency(eurPrice, 'EUR');
    if (!userCurrency || userCurrency === 'EUR') return eurFormatted;
    const converted = convertCurrency(eurPrice, 'EUR', userCurrency);
    return `${eurFormatted} (~${formatCurrency(converted, userCurrency)})`;
  };

  const handleBookAccommodation = () => {
    setBookingInitialData({ serviceCategory: 'accommodation' });
    setBookingOpen(true);
  };

  const handleBookingClose = () => {
    setBookingOpen(false);
    setBookingInitialData({});
  };

  const { accommodationTypes, combinedPackages, whyBookCards } = useMemo(() => {
    const hotelType = t('outsider:stayBooking.accommodationTypes.hotel', { returnObjects: true });
    const homeType = t('outsider:stayBooking.accommodationTypes.home', { returnObjects: true });
    const packageItems = t('outsider:stayBooking.packages.items', { returnObjects: true });
    return {
      accommodationTypes: [
        {
          key: 'hotel',
          title: hotelType.title,
          subtitle: hotelType.subtitle,
          emoji: '🏨',
          description: hotelType.description,
          highlights: hotelType.highlights,
          priceFrom: 60,
          path: '/stay/hotel',
          color: 'blue',
        },
        {
          key: 'home',
          title: homeType.title,
          subtitle: homeType.subtitle,
          emoji: '🏠',
          description: homeType.description,
          highlights: homeType.highlights,
          priceFrom: 25,
          path: '/stay/home',
          color: 'green',
        },
      ],
      combinedPackages: [
        {
          key: 'weekend',
          title: packageItems[0]?.name || 'Weekend Getaway',
          emoji: '🌊',
          includes: packageItems[0]?.includes || [],
          price: 455,
          savings: packageItems[0]?.savings || '',
        },
        {
          key: 'week',
          title: packageItems[1]?.name || 'Week Adventure',
          emoji: '🏄',
          includes: packageItems[1]?.includes || [],
          price: 850,
          savings: packageItems[1]?.savings || '',
        },
        {
          key: 'immersion',
          title: packageItems[2]?.name || 'Full Immersion',
          emoji: '⭐',
          includes: packageItems[2]?.includes || [],
          price: 1100,
          savings: packageItems[2]?.savings || '',
        },
      ],
      whyBookCards: t('outsider:stayBooking.whyBook.cards', { returnObjects: true }),
    };
  }, [t]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Hero Section */}
      <div className="text-center mb-12">
        <Title level={1} className="!mb-4">
          🛏️ {t('outsider:stayBooking.hero.title')}
        </Title>
        <div className="flex items-center justify-center gap-2 mb-4">
          <EnvironmentOutlined className="text-sky-500" />
          <Text className="text-lg">{t('outsider:stayBooking.hero.location')}</Text>
        </div>
        <Paragraph className="text-lg text-gray-600 max-w-3xl mx-auto">
          {t('outsider:stayBooking.hero.description')}
        </Paragraph>
        <Space className="mt-4">
          <Button
            type="primary"
            size="large"
            icon={<CalendarOutlined />}
            onClick={handleBookAccommodation}
          >
            {t('outsider:stayBooking.hero.bookNow')}
          </Button>
          <Button
            size="large"
            icon={<PhoneOutlined />}
            href="tel:+905071389196"
          >
            {t('outsider:stayBooking.hero.callReservations')}
          </Button>
        </Space>
      </div>

      <Divider />

      {/* Accommodation Types */}
      <Title level={2} className="text-center mb-8">{t('outsider:stayBooking.chooseStay')}</Title>
      <Row gutter={[24, 24]} className="mb-12">
        {accommodationTypes.map((type) => (
          <Col xs={24} md={12} key={type.key}>
            <Card
              className="h-full hover:shadow-xl transition-all cursor-pointer border-2 hover:border-sky-400"
              onClick={() => navigate(type.path)}
            >
              <div className="text-center mb-6">
                <span className="text-6xl">{type.emoji}</span>
              </div>
              <Title level={2} className="text-center !mb-1">{type.title}</Title>
              <Text type="secondary" className="block text-center text-lg mb-4">
                {type.subtitle}
              </Text>
              <Paragraph className="text-center text-gray-600 mb-6">
                {type.description}
              </Paragraph>
              <div className="mb-6">
                <List
                  size="small"
                  dataSource={type.highlights}
                  renderItem={(item) => (
                    <List.Item className="!py-2 !px-0 border-0 justify-center">
                      <CheckCircleOutlined className="text-green-500 mr-2" />
                      <Text>{item}</Text>
                    </List.Item>
                  )}
                />
              </div>
              <Divider />
              <div className="flex justify-between items-center">
                <div>
                  <Text type="secondary">{t('outsider:stayBooking.from')}</Text>
                  <div>
                    <Text strong className="text-2xl" style={{ color: type.color === 'blue' ? '#3b82f6' : '#22c55e' }}>
                      {formatPrice(type.priceFrom)}
                    </Text>
                    <Text type="secondary"> {t('outsider:stayBooking.perNight')}</Text>
                  </div>
                </div>
                <Button type="primary" icon={<RightOutlined />}>
                  {t('outsider:stayBooking.viewOptions')}
                </Button>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      {/* Combined Packages */}
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl p-8 mb-12">
        <div className="text-center mb-8">
          <Title level={2} className="!mb-2">
            <StarOutlined className="text-amber-500 mr-2" />
            {t('outsider:stayBooking.packages.heading')}
          </Title>
          <Paragraph className="text-gray-600">
            {t('outsider:stayBooking.packages.description')}
          </Paragraph>
        </div>
        <Row gutter={[24, 24]}>
          {combinedPackages.map((pkg) => (
            <Col xs={24} md={8} key={pkg.key}>
              <Card className="h-full hover:shadow-lg transition-shadow text-center">
                <span className="text-4xl block mb-4">{pkg.emoji}</span>
                <Title level={4}>{pkg.title}</Title>
                <List
                  size="small"
                  className="mb-4"
                  dataSource={pkg.includes}
                  renderItem={(item) => (
                    <List.Item className="!py-1 !px-0 border-0 justify-center">
                      <CheckCircleOutlined className="text-green-500 mr-2" />
                      <Text className="text-sm">{item}</Text>
                    </List.Item>
                  )}
                />
                <Tag color="red" className="mb-4">{pkg.savings}</Tag>
                <div className="mb-4">
                  <Text type="secondary" className="text-sm">{t('outsider:stayBooking.packages.startingFrom')}</Text>
                  <div>
                    <Text strong className="text-2xl text-amber-600">
                      {formatPrice(pkg.price)}
                    </Text>
                  </div>
                </div>
                <Button type="primary" block onClick={handleBookAccommodation}>
                  {t('outsider:stayBooking.packages.bookButton')}
                </Button>
              </Card>
            </Col>
          ))}
        </Row>
      </div>

      {/* Why Stay With Us */}
      <Title level={2} className="text-center mb-8">{t('outsider:stayBooking.whyBook.heading')}</Title>
      <Row gutter={[24, 24]} className="mb-12">
        {whyBookCards.map((card, i) => (
          <Col xs={24} sm={12} md={6} key={i}>
            <Card className="text-center h-full hover:shadow-md transition-shadow">
              <div className="text-4xl mb-4">{['🎯', '💰', '🤝', '🚐'][i]}</div>
              <Title level={4}>{card.title}</Title>
              <Text type="secondary">{card.body}</Text>
            </Card>
          </Col>
        ))}
      </Row>

      {/* Contact Info */}
      <Card className="text-center">
        <Title level={3}>{t('outsider:stayBooking.contact.heading')}</Title>
        <Paragraph>
          {t('outsider:stayBooking.contact.description')}
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

export default StayBookingPage;
