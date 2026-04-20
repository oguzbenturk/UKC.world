/**
 * RentalPremiumPage
 *
 * Informational page about premium rental equipment (SLS / D/LAB).
 */

import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, Typography, Button, Row, Col, Tag, Divider, Space, List, Alert } from 'antd';
import {
  StarOutlined,
  CheckCircleOutlined,
  CalendarOutlined,
  ThunderboltOutlined,
  RocketOutlined,
} from '@ant-design/icons';
import { usePageSEO } from '@/shared/utils/seo';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import StudentBookingWizard from '@/features/students/components/StudentBookingWizard';

const { Title, Paragraph, Text } = Typography;

// Card config (non-translatable icon/color) — text comes from i18n
const WHY_CARDS = [
  { key: 'light', emoji: '🪶' },
  { key: 'responsive', emoji: '⚡' },
  { key: 'serviced', emoji: '🔧' },
  { key: 'latest', emoji: '🆕' },
];

const PACKAGE_CONFIG = [
  {
    i18nKey: 'sls',
    key: 'sls-hourly',
    icon: <StarOutlined className="text-4xl text-amber-500" />,
    prices: [40, 65, 85, 510],
    color: 'gold',
  },
  {
    i18nKey: 'dlab',
    key: 'dlab-hourly',
    icon: <RocketOutlined className="text-4xl text-purple-500" />,
    prices: [48, 75, 95],
    color: 'purple',
  },
  {
    i18nKey: 'foilBoard',
    key: 'foil-board',
    icon: <ThunderboltOutlined className="text-4xl text-cyan-500" />,
    prices: [27, 135],
    color: 'cyan',
  },
];

const RentalPremiumPage = () => {
  const { t } = useTranslation(['outsider']);
  const navigate = useNavigate();
  const { formatCurrency, convertCurrency, userCurrency } = useCurrency();
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingInitialData, setBookingInitialData] = useState({});

  usePageSEO({
    title: 'Premium Rental Equipment | UKC Academy',
    description: 'Rent the latest Duotone SLS and D/LAB premium equipment. Experience the best gear in the industry.',
  });

  const formatPrice = (eurPrice) => {
    const eurFormatted = formatCurrency(eurPrice, 'EUR');
    if (!userCurrency || userCurrency === 'EUR') return eurFormatted;
    const converted = convertCurrency(eurPrice, 'EUR', userCurrency);
    return `${eurFormatted} (~${formatCurrency(converted, userCurrency)})`;
  };

  const handleBookRental = () => {
    setBookingInitialData({ serviceCategory: 'rental' });
    setBookingOpen(true);
  };

  const handleBookingClose = () => {
    setBookingOpen(false);
    setBookingInitialData({});
  };

  const packages = useMemo(() => PACKAGE_CONFIG.map((cfg) => {
    const base = `outsider:rentalPremium.packages.${cfg.i18nKey}`;
    const durations = t(`${base}.durations`, { returnObjects: true });
    const included = t(`${base}.included`, { returnObjects: true });
    return {
      key: cfg.key,
      title: t(`${base}.title`),
      subtitle: t(`${base}.subtitle`),
      icon: cfg.icon,
      description: t(`${base}.description`),
      options: (Array.isArray(durations) ? durations : []).map((label, i) => ({
        duration: label,
        price: cfg.prices[i] ?? 0,
      })),
      included: Array.isArray(included) ? included : [],
      color: cfg.color,
    };
  }), [t]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="text-center mb-12">
        <Title level={1} className="!mb-4">
          ⭐ {t('outsider:rentalPremium.hero.title')}
        </Title>
        <Paragraph className="text-lg text-gray-600 max-w-3xl mx-auto">
          {t('outsider:rentalPremium.hero.description')}
        </Paragraph>
        <Button
          type="primary"
          size="large"
          icon={<CalendarOutlined />}
          onClick={handleBookRental}
          className="mt-4"
        >
          {t('outsider:rentalPremium.hero.cta')}
        </Button>
      </div>

      <Divider />

      <Alert
        type="warning"
        showIcon
        icon={<StarOutlined />}
        message={t('outsider:rentalPremium.testCenter.title')}
        description={t('outsider:rentalPremium.testCenter.description')}
        className="mb-8"
      />

      <div className="mb-12">
        <Title level={2} className="text-center mb-8">{t('outsider:rentalPremium.whyPremium.title')}</Title>
        <Row gutter={[24, 24]}>
          {WHY_CARDS.map((c) => (
            <Col xs={24} sm={12} md={6} key={c.key}>
              <Card className="text-center h-full">
                <div className="text-4xl mb-4">{c.emoji}</div>
                <Title level={4}>{t(`outsider:rentalPremium.whyPremium.cards.${c.key}.title`)}</Title>
                <Text type="secondary">{t(`outsider:rentalPremium.whyPremium.cards.${c.key}.description`)}</Text>
              </Card>
            </Col>
          ))}
        </Row>
      </div>

      <Title level={2} className="text-center mb-8">{t('outsider:rentalPremium.options.title')}</Title>
      <Row gutter={[24, 24]}>
        {packages.map((pkg) => (
          <Col xs={24} md={8} key={pkg.key}>
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
                <Text strong className="block mb-2">{t('outsider:rentalPremium.options.pricing')}</Text>
                <Space direction="vertical" className="w-full">
                  {pkg.options.map((opt) => (
                    <div key={`${pkg.key}-${opt.duration}`} className="flex justify-between items-center bg-gray-50 p-3 rounded-lg">
                      <Text strong>{opt.duration}</Text>
                      <Tag color={pkg.color} className="text-base px-3 py-1">
                        {formatPrice(opt.price)}
                      </Tag>
                    </div>
                  ))}
                </Space>
              </div>

              <div className="mb-4">
                <Text strong className="block mb-2">{t('outsider:rentalPremium.options.included')}</Text>
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
                icon={<CalendarOutlined />}
                onClick={handleBookRental}
              >
                {t('outsider:rentalPremium.options.bookLabel', { name: pkg.title })}
              </Button>
            </Card>
          </Col>
        ))}
      </Row>

      <div className="text-center mt-12 p-8 bg-gradient-to-r from-amber-50 to-purple-50 rounded-xl">
        <Title level={3}>{t('outsider:rentalPremium.bottomCta.title')}</Title>
        <Paragraph className="text-gray-600 mb-4">
          {t('outsider:rentalPremium.bottomCta.description')}
        </Paragraph>
        <Space>
          <Button
            type="primary"
            size="large"
            icon={<StarOutlined />}
            onClick={handleBookRental}
          >
            {t('outsider:rentalPremium.bottomCta.bookBtn')}
          </Button>
          <Button
            size="large"
            onClick={() => navigate('/rental/standard')}
          >
            {t('outsider:rentalPremium.bottomCta.viewStandardBtn')}
          </Button>
        </Space>
      </div>

      <StudentBookingWizard
        open={bookingOpen}
        onClose={handleBookingClose}
        initialData={bookingInitialData}
      />
    </div>
  );
};

export default RentalPremiumPage;
