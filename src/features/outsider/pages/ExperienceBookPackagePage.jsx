/**
 * ExperienceBookPackagePage
 * 
 * Main Book Package page that shows all package categories.
 * Uses the same package purchase flow as OutsiderBookingPage.
 */

import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { App, Card, Typography, Button, Row, Col, Tag, Divider, Spin, Empty } from 'antd';
import {
  ShoppingOutlined,
  WalletOutlined,
  LeftOutlined,
  PhoneOutlined,
  CheckCircleOutlined
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/shared/hooks/useAuth';
import { usePageSEO } from '@/shared/utils/seo';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { useWalletSummary } from '@/shared/hooks/useWalletSummary';
import apiClient from '@/shared/services/apiClient';
import PackagePurchaseModal from '../components/PackagePurchaseModal';
import AllInclusiveBookingModal from '../components/AllInclusiveBookingModal';
import IyzicoPaymentModal from '@/shared/components/IyzicoPaymentModal';

const { Title, Paragraph, Text } = Typography;

// Package categories - static keys (labels translated inside component)
const PACKAGE_CATEGORY_KEYS = ['lesson', 'rental', 'accommodation', 'lesson_rental', 'accommodation_rental', 'accommodation_lesson', 'all_inclusive'];
const PACKAGE_CATEGORY_ICONS = { lesson: '🎓', rental: '🏄', accommodation: '🏨', lesson_rental: '🎯', accommodation_rental: '🏖️', accommodation_lesson: '🏄‍♂️', all_inclusive: '⭐' };

// Helper to get package price in specific currency
const getPackagePriceInCurrency = (pkg, targetCurrency, convertCurrencyFn) => {
  if (!pkg) return { price: 0, currency: 'EUR' };
  
  if (targetCurrency && pkg.prices && Array.isArray(pkg.prices)) {
    const currencyPrice = pkg.prices.find(
      p => p.currencyCode === targetCurrency || p.currency_code === targetCurrency
    );
    if (currencyPrice && currencyPrice.price > 0) {
      return { price: currencyPrice.price, currency: targetCurrency };
    }
  }
  
  const baseCurrency = pkg.currency || 'EUR';
  const basePrice = pkg.price || 0;
  
  if (convertCurrencyFn && targetCurrency && targetCurrency !== baseCurrency) {
    const convertedPrice = convertCurrencyFn(basePrice, baseCurrency, targetCurrency);
    return { price: convertedPrice, currency: targetCurrency };
  }
  
  return { price: basePrice, currency: baseCurrency };
};

const getTypeIcon = (packageType) => {
  const icons = {
    rental: '🏄',
    accommodation: '🏨',
    lesson_rental: '🎯',
    accommodation_rental: '🏖️',
    accommodation_lesson: '🏄‍♂️',
    all_inclusive: '⭐'
  };
  return icons[packageType] || '🎓';
};

const ExperienceBookPackagePage = () => {
  const navigate = useNavigate();
  const { t } = useTranslation(['outsider']);
  const { refreshToken, user } = useAuth();
  const { userCurrency, formatCurrency, convertCurrency, businessCurrency } = useCurrency();
  const { notification } = App.useApp();
  const queryClient = useQueryClient();
  
  // Build translated category list from JSON
  const translatedCategories = useMemo(() => {
    const items = t('outsider:experienceBookPackage.categories', { returnObjects: true });
    return PACKAGE_CATEGORY_KEYS.map((key) => {
      const found = Array.isArray(items) ? items.find(i => i.key === key) : null;
      return {
        key,
        label: found?.label || key,
        icon: PACKAGE_CATEGORY_ICONS[key] || '🎓',
        description: found?.description || ''
      };
    });
  }, [t]);

  // State
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [purchaseModalOpen, setPurchaseModalOpen] = useState(false);
  const [allInclusiveModalOpen, setAllInclusiveModalOpen] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState(null);
  const [iyzicoPaymentUrl, setIyzicoPaymentUrl] = useState(null);
  const [showIyzicoModal, setShowIyzicoModal] = useState(false);

  // ── Fetch user's owned customer packages ──────────────────────────────────
  const { data: ownedPackages = [] } = useQuery({
    queryKey: ['customer-packages', user?.id],
    queryFn: async () => {
      const res = await apiClient.get(`/services/customer-packages/${user.id}`);
      return Array.isArray(res.data) ? res.data : [];
    },
    enabled: !!user?.id,
    staleTime: 120_000,
  });

  const ownedByPackageId = useMemo(() => {
    const map = new Map();
    for (const cp of ownedPackages) {
      const isActive = (cp.status || '').toLowerCase() === 'active';
      if (!isActive) continue;
      const spId = String(cp.servicePackageId || cp.service_package_id);
      const remaining = parseFloat(cp.remainingHours ?? cp.remaining_hours) || 0;
      const existingRemaining = map.has(spId) ? (parseFloat(map.get(spId).remainingHours ?? map.get(spId).remaining_hours) || 0) : -1;
      if (remaining > existingRemaining) map.set(spId, cp);
    }
    return map;
  }, [ownedPackages]);

  usePageSEO({
    title: 'Book a Package | Experience | UKC',
    description: 'Browse and purchase kitesurfing packages. Lessons, rentals, accommodation, and all-inclusive options.'
  });

  // Storage currency is always EUR (base currency)
  const storageCurrency = businessCurrency || 'EUR';
  const { data: walletSummary, refetch: refetchWallet } = useWalletSummary({ currency: storageCurrency });

  // Fetch available packages
  const { data: availablePackages, isLoading: packagesLoading } = useQuery({
    queryKey: ['available-packages', selectedCategory],
    queryFn: async () => {
      const params = selectedCategory ? `?category=${selectedCategory}` : '';
      const response = await apiClient.get(`/services/packages/available${params}`);
      return response.data;
    },
    enabled: !!selectedCategory,
  });

  // Package purchase mutation
  const purchaseMutation = useMutation({
    mutationFn: async (purchaseData) => {
      const response = await apiClient.post('/services/packages/purchase', purchaseData);
      return response.data;
    },
    onSuccess: async (data) => {
      // For credit card payments, show IyzicoPaymentModal
      if (data.paymentPageUrl) {
        setIyzicoPaymentUrl(data.paymentPageUrl);
        setShowIyzicoModal(true);
        return;
      }

      const description = buildSuccessMessage(data, formatCurrency);
      const roleUpgraded = data.roleUpgrade?.upgraded;
      
      if (roleUpgraded) {
        await refreshToken();
      }

      notification.success({
        message: t('outsider:experienceBookPackage.notifications.purchaseSuccess'),
        description,
        duration: roleUpgraded ? 8 : 5,
      });
      
      refetchWallet();
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      queryClient.invalidateQueries({ queryKey: ['customer-packages'] });
      
      setPurchaseModalOpen(false);
      setAllInclusiveModalOpen(false);
      setSelectedPackage(null);
      
      if (roleUpgraded) {
        setTimeout(() => navigate('/student/dashboard'), 2000);
      }
    },
    onError: (error) => {
      notification.error({
        message: t('outsider:experienceBookPackage.notifications.purchaseError'),
        description: error.response?.data?.error || 'Failed to purchase package. Please try again.',
      });
    },
  });

  // Determine if a package needs the detailed multi-step modal
  const isMultiStepPackage = (pkg) => {
    const pType = (pkg?.packageType || pkg?.package_type || '').toLowerCase();
    return ['all_inclusive', 'accommodation_lesson', 'accommodation_rental'].includes(pType);
  };

  const handleCategorySelect = (categoryKey) => setSelectedCategory(categoryKey);
  const handleBackToCategories = () => setSelectedCategory(null);
  const handlePackageSelect = (pkg) => {
    setSelectedPackage(pkg);
    if (isMultiStepPackage(pkg)) {
      setAllInclusiveModalOpen(true);
    } else {
      setPurchaseModalOpen(true);
    }
  };
  const handleClosePurchaseModal = () => {
    setPurchaseModalOpen(false);
    setAllInclusiveModalOpen(false);
    setSelectedPackage(null);
  };
  const handlePurchase = (purchaseData) => purchaseMutation.mutate(purchaseData);

  const getPackageDisplayPrice = (pkg) => {
    const eurPrice = pkg?.price || 0;
    const eurFormatted = formatCurrency(eurPrice, 'EUR');
    if (!userCurrency || userCurrency === 'EUR') return eurFormatted;
    const { price, currency } = getPackagePriceInCurrency(pkg, userCurrency, convertCurrency);
    if (currency === 'EUR') return eurFormatted;
    return `${eurFormatted} (~${formatCurrency(price, currency)})`;
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Hero Section */}
      <div className="text-center mb-8">
        <Title level={1} className="!mb-4">
          <ShoppingOutlined className="mr-3" />
          {t('outsider:experienceBookPackage.title')}
        </Title>
        <Paragraph className="text-lg text-gray-600 max-w-3xl mx-auto">
          {t('outsider:experienceBookPackage.description')}
        </Paragraph>

        {/* Wallet Balance */}
        <div className="flex items-center justify-center gap-3 mt-4">
          <div className="flex items-center gap-2 px-4 py-2 bg-sky-50 rounded-full">
            <WalletOutlined className="text-sky-600" />
            <Text strong className="text-sky-600">
              {t('outsider:experienceBookPackage.wallet')} {formatCurrency(typeof walletSummary?.available === 'number' ? walletSummary.available : 0, userCurrency)}
            </Text>
          </div>
        </div>
      </div>

      <Divider />

      {/* Category Selection or Package List */}
      {!selectedCategory ? (
        <CategorySelection
          categories={translatedCategories}
          onSelect={handleCategorySelect}
        />
      ) : (
        <PackageList
          selectedCategory={selectedCategory}
          categories={translatedCategories}
          packages={availablePackages}
          isLoading={packagesLoading}
          onBack={handleBackToCategories}
          onSelect={handlePackageSelect}
          getDisplayPrice={getPackageDisplayPrice}
          ownedByPackageId={ownedByPackageId}
        />
      )}

      {/* Purchase Modal */}
      <PackagePurchaseModal
        open={purchaseModalOpen}
        onCancel={handleClosePurchaseModal}
        selectedPackage={selectedPackage}
        walletBalance={walletSummary?.available || 0}
        onPurchase={handlePurchase}
        isPurchasing={purchaseMutation.isPending}
      />

      <AllInclusiveBookingModal
        open={allInclusiveModalOpen}
        onCancel={handleClosePurchaseModal}
        selectedPackage={selectedPackage}
        walletBalance={walletSummary?.available || 0}
        onPurchase={handlePurchase}
        isPurchasing={purchaseMutation.isPending}
      />

      {/* Iyzico Credit Card Payment Modal */}
      <IyzicoPaymentModal
        visible={showIyzicoModal}
        paymentPageUrl={iyzicoPaymentUrl}
        socketEventName="package:payment_confirmed"
        onSuccess={() => {
          setShowIyzicoModal(false);
          setIyzicoPaymentUrl(null);
          refetchWallet();
          queryClient.invalidateQueries({ queryKey: ['wallet'] });
          queryClient.invalidateQueries({ queryKey: ['customer-packages'] });
          notification.success({ message: 'Payment confirmed!', description: 'Your package has been purchased.' });
          setPurchaseModalOpen(false);
          setAllInclusiveModalOpen(false);
          setSelectedPackage(null);
        }}
        onClose={() => {
          setShowIyzicoModal(false);
          setIyzicoPaymentUrl(null);
        }}
        onError={(msg) => {
          setShowIyzicoModal(false);
          setIyzicoPaymentUrl(null);
          notification.error({ message: 'Payment Failed', description: msg || 'Payment could not be completed.' });
        }}
      />

      {/* Contact Info */}
      <Card className="text-center mt-12">
        <Title level={3}>{t('outsider:experienceBookPackage.help.heading')}</Title>
        <Paragraph>
          {t('outsider:experienceBookPackage.help.description')}
        </Paragraph>
        <div className="flex justify-center gap-4 flex-wrap">
          <Button icon={<PhoneOutlined />} href="tel:+905071389196">
            +90 507 138 91 96
          </Button>
          <Button href="mailto:ukcturkey@gmail.com">
            📧 ukcturkey@gmail.com
          </Button>
        </div>
      </Card>
    </div>
  );
};

// Sub-component: Category Selection Grid
const CategorySelection = ({ categories, onSelect }) => {
  const { t } = useTranslation(['outsider']);
  return (
    <>
      <Title level={2} className="text-center mb-8">{t('outsider:experienceBookPackage.selectCategory')}</Title>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl mx-auto">
        {categories.map((cat) => (
          <Card
            key={cat.key}
            onClick={() => onSelect(cat.key)}
            className="cursor-pointer transition-all duration-200 hover:shadow-lg hover:border-sky-400 border-2 border-gray-200"
            hoverable
          >
            <div className="flex items-center gap-4">
              <div className="text-4xl">{cat.icon}</div>
              <div className="flex-1">
                <Title level={4} className="!mb-0">{cat.label}</Title>
                <Text type="secondary" className="text-sm">{cat.description}</Text>
              </div>
              <Button type="primary" ghost>
                {t('outsider:experienceBookPackage.viewPackages')}
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
};

// Sub-component: Package List
const PackageList = ({ selectedCategory, categories, packages, isLoading, onBack, onSelect, getDisplayPrice, ownedByPackageId }) => {
  const { t } = useTranslation(['outsider']);
  const currentCategory = categories.find(c => c.key === selectedCategory);

  return (
    <>
      {/* Back Button and Category Title */}
      <div className="mb-6 flex items-center gap-4">
        <Button icon={<LeftOutlined />} onClick={onBack}>
          {t('outsider:experienceBookPackage.back')}
        </Button>
        <div>
          <Title level={3} className="!mb-0">
            {currentCategory?.icon} {currentCategory?.label}
          </Title>
          <Text type="secondary">{t('outsider:experienceBookPackage.availablePackages')}</Text>
        </div>
      </div>

      {/* Package List */}
      {isLoading ? (
        <div className="text-center py-12">
          <Spin size="large" />
          <Text className="block mt-4">{t('outsider:experienceBookPackage.loading')}</Text>
        </div>
      ) : !packages || packages.length === 0 ? (
        <Empty description={t('outsider:experienceBookPackage.empty')} image={Empty.PRESENTED_IMAGE_SIMPLE}>
          <Button type="primary" onClick={onBack}>{t('outsider:experienceBookPackage.backToCategories')}</Button>
        </Empty>
      ) : (
        <Row gutter={[24, 24]}>
          {packages.map((pkg) => {
            const ownedPkg = ownedByPackageId?.get(String(pkg.id));
            const ownedRemaining = ownedPkg ? (parseFloat(ownedPkg.remainingHours ?? ownedPkg.remaining_hours) || 0) : 0;
            return (
            <Col xs={24} md={12} lg={8} key={pkg.id}>
              <Card
                className={`h-full hover:shadow-lg transition-shadow ${
                  ownedPkg ? '!border-emerald-500/60' : ''
                }`}
              >
                {/* Owned badge */}
                {ownedPkg && (
                  <div className="flex items-center justify-center gap-1.5 mb-3 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1 mx-auto w-fit">
                    <CheckCircleOutlined className="text-emerald-600 text-xs" />
                    <span className="text-xs font-bold text-emerald-600 uppercase tracking-wide">
                      {t('outsider:experienceBookPackage.packageCard.owned')}
                    </span>
                    {ownedRemaining > 0 && (
                      <span className="text-xs text-emerald-500 ml-1">
                        · {t('outsider:experienceBookPackage.packageCard.hoursLeft', { hours: ownedRemaining })}
                      </span>
                    )}
                  </div>
                )}

                <div className="text-center mb-4">
                  <span className="text-4xl">{getTypeIcon(pkg.packageType)}</span>
                </div>
                <Title level={4} className="text-center !mb-2">{pkg.name}</Title>
                {pkg.description && (
                  <Paragraph className="text-center text-gray-600 text-sm mb-4">
                    {pkg.description}
                  </Paragraph>
                )}
                <div className="flex justify-center gap-2 flex-wrap mb-4">
                  {pkg.hours && <Tag color="green">{pkg.hours}hr</Tag>}
                  {pkg.days && <Tag color="blue">{pkg.days} days</Tag>}
                  {pkg.nights && <Tag color="purple">{pkg.nights} nights</Tag>}
                </div>
                <Divider className="my-4" />
                <div className="text-center mb-4">
                  {ownedPkg ? (
                    <>
                      <Text className="text-sm text-emerald-600 font-semibold">
                        {t('outsider:experienceBookPackage.packageCard.youOwnThis')}
                      </Text>
                      <div>
                        <Text type="secondary" className="text-xs">
                          {t('outsider:experienceBookPackage.packageCard.buyAgainPrompt')}
                        </Text>
                      </div>
                    </>
                  ) : (
                    <>
                      <Text type="secondary" className="text-sm">
                        {t('outsider:experienceBookPackage.packageCard.price')}
                      </Text>
                      <div>
                        <Text strong className="text-2xl text-sky-600">
                          {getDisplayPrice(pkg)}
                        </Text>
                      </div>
                    </>
                  )}
                </div>
                <Button
                  type="primary"
                  block
                  onClick={() => onSelect(pkg)}
                  className={ownedPkg ? '!bg-emerald-500 !border-emerald-500 hover:!bg-emerald-400' : ''}
                >
                  {ownedPkg
                    ? t('outsider:experienceBookPackage.packageCard.buyAgain')
                    : t('outsider:experienceBookPackage.packageCard.purchase')}
                </Button>
              </Card>
            </Col>
          );
          })}
        </Row>
      )}
    </>
  );
};

// Helper function to build success message
const buildSuccessMessage = (data, formatCurrency) => {
  let description = `You have successfully purchased "${data.customerPackage.packageName}".`;
  
  if (data.voucher) {
    description += ` Promo code "${data.voucher.code}" saved you ${data.voucher.discountApplied.toFixed(2)}!`;
    if (data.voucher.walletCreditApplied) {
      description += ` Plus ${data.voucher.walletCreditApplied.toFixed(2)} ${data.voucher.walletCurrency} added to your wallet!`;
    }
  }
  
  if (data.accommodationBooking) {
    description += ` Accommodation confirmed at ${data.accommodationBooking.unitName} for ${data.accommodationBooking.nights} night(s).`;
  }
  
  if (data.wallet) {
    description += ` Your new wallet balance is ${formatCurrency(data.wallet.newBalance, data.wallet.currency)}.`;
  } else if (data.paymentMethod === 'pay_later') {
    description += ' Payment is pending.';
  }
  
  if (data.roleUpgrade?.upgraded) {
    description += ' 🎉 Your account has been upgraded to Student! You now have access to the Student Dashboard.';
  }
  
  return description;
};

export default ExperienceBookPackagePage;
