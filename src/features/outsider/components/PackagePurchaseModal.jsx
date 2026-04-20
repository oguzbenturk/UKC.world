/**
 * PackagePurchaseModal
 * 
 * Reusable modal for purchasing packages with payment options,
 * accommodation dates, and promo code support.
 */

import { useState } from 'react';
import { Modal, Card, Typography, Button, Tag, Divider, Space, Radio, DatePicker } from 'antd';
import {
  ShoppingOutlined,
  WalletOutlined,
  CheckCircleOutlined,
  CreditCardOutlined,
  CalendarOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { useAuth } from '@/shared/hooks/useAuth';
import { PAY_AT_CENTER_ALLOWED_ROLES } from '@/shared/utils/roleUtils';
import PromoCodeInput from '@/shared/components/PromoCodeInput';

const { Title, Text } = Typography;

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

const PackagePurchaseModal = ({
  open,
  onCancel,
  selectedPackage,
  walletBalance = 0,
  onPurchase,
  isPurchasing = false
}) => {
  const { userCurrency, formatCurrency, convertCurrency } = useCurrency();
  const { user } = useAuth();
  
  const isTrustedCustomer = user?.role && PAY_AT_CENTER_ALLOWED_ROLES.includes(user.role);

  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('wallet');
  const [accommodationDates, setAccommodationDates] = useState({ checkIn: null, checkOut: null });
  const [appliedVoucher, setAppliedVoucher] = useState(null);

  const handleClose = () => {
    setSelectedPaymentMethod('wallet');
    setAccommodationDates({ checkIn: null, checkOut: null });
    setAppliedVoucher(null);
    onCancel();
  };

  const getPackageDisplayPrice = (pkg) => {
    const { price, currency } = getPackagePriceInCurrency(pkg, userCurrency, convertCurrency);
    let finalPrice = price;

    const disc = appliedVoucher?.discount;
    if (disc && disc.originalAmount > 0) {
      finalPrice = Math.max(0, price * (disc.finalAmount / disc.originalAmount));
    }

    return formatCurrency(finalPrice, currency);
  };

  const handlePurchaseClick = async () => {
    const packageType = selectedPackage?.packageType || selectedPackage?.package_type;
    const needsAccommodationDates = ['accommodation', 'accommodation_rental', 'accommodation_lesson', 'all_inclusive'].includes(packageType);
    
    if (needsAccommodationDates && (!accommodationDates.checkIn || !accommodationDates.checkOut)) {
      return { error: 'Please select check-in and check-out dates for accommodation.' };
    }

    onPurchase({
      packageId: selectedPackage.id,
      paymentMethod: selectedPaymentMethod,
      checkInDate: accommodationDates.checkIn?.format('YYYY-MM-DD'),
      checkOutDate: accommodationDates.checkOut?.format('YYYY-MM-DD'),
      voucherId: appliedVoucher?.id
    });
  };

  const packageType = selectedPackage?.packageType || selectedPackage?.package_type;
  const needsAccommodationDates = ['accommodation', 'accommodation_rental', 'accommodation_lesson', 'all_inclusive'].includes(packageType);

  return (
    <Modal
      title={
        <div className="flex items-center gap-3">
          <ShoppingOutlined />
          <span>Purchase Package</span>
        </div>
      }
      open={open}
      onCancel={handleClose}
      footer={null}
      width={500}
      destroyOnHidden
    >
      {selectedPackage && (
        <div>
          <Card className="mb-4 bg-sky-50">
            <Title level={4} className="!mb-2">{selectedPackage.name}</Title>
            {selectedPackage.description && (
              <Text type="secondary">{selectedPackage.description}</Text>
            )}
            <div className="mt-3">
              <Text strong className="text-xl text-sky-600">
                {getPackageDisplayPrice(selectedPackage)}
              </Text>
              {appliedVoucher && (
                <Tag color="green" className="ml-2">Discount Applied!</Tag>
              )}
            </div>
          </Card>

          {/* Accommodation Dates */}
          {needsAccommodationDates && (
            <div className="mb-4">
              <Title level={5}>
                <CalendarOutlined className="mr-2" />
                Accommodation Dates
              </Title>
              <Space direction="vertical" className="w-full">
                <DatePicker
                  placeholder="Check-in Date"
                  className="w-full"
                  value={accommodationDates.checkIn}
                  onChange={(date) => setAccommodationDates(prev => ({ ...prev, checkIn: date }))}
                  disabledDate={(current) => current && current < dayjs().startOf('day')}
                />
                <DatePicker
                  placeholder="Check-out Date"
                  className="w-full"
                  value={accommodationDates.checkOut}
                  onChange={(date) => setAccommodationDates(prev => ({ ...prev, checkOut: date }))}
                  disabledDate={(current) => 
                    current && (current < dayjs().startOf('day') || 
                    (accommodationDates.checkIn && current <= accommodationDates.checkIn))
                  }
                />
              </Space>
            </div>
          )}

          {/* Promo Code */}
          <div className="mb-4">
            <Title level={5}>Promo Code</Title>
            <PromoCodeInput
              context="packages"
              amount={selectedPackage.price || 0}
              currency={userCurrency || 'EUR'}
              serviceId={selectedPackage.id}
              onValidCode={(voucher) => setAppliedVoucher(voucher)}
              onClear={() => setAppliedVoucher(null)}
              disabled={isPurchasing}
            />
          </div>

          <Divider />

          {/* Payment Method */}
          <Title level={5}>Payment Method</Title>
          <Radio.Group
            value={selectedPaymentMethod}
            onChange={(e) => setSelectedPaymentMethod(e.target.value)}
            className="w-full mb-4"
          >
            <Space direction="vertical" className="w-full">
              <Radio value="wallet" className="w-full">
                <div className="flex items-center gap-2">
                  <WalletOutlined />
                  <span>Pay from Wallet</span>
                  <Tag color="blue">
                    {formatCurrency(walletBalance, userCurrency)}
                  </Tag>
                </div>
              </Radio>
              {isTrustedCustomer && (
                <Radio value="pay_later">
                  <div className="flex items-center gap-2">
                    <CalendarOutlined />
                    <span>Pay Later</span>
                    <Tag color="orange" className="!text-xs">Trusted Customer</Tag>
                  </div>
                </Radio>
              )}
            </Space>
          </Radio.Group>

          <Button
            type="primary"
            size="large"
            block
            loading={isPurchasing}
            onClick={() => {
              Modal.confirm({
                title: 'Confirm Purchase',
                icon: <ShoppingOutlined style={{ color: '#1890ff' }} />,
                content: (
                  <div style={{ marginTop: 8 }}>
                    <p><strong>{selectedPackage?.name}</strong></p>
                    <p style={{ fontSize: 18, fontWeight: 700, margin: '8px 0' }}>{getPackageDisplayPrice(selectedPackage)}</p>
                    <p style={{ color: '#888' }}>Payment: {selectedPaymentMethod === 'wallet' ? 'Wallet' : selectedPaymentMethod === 'credit_card' ? 'Card' : 'Pay Later'}</p>
                  </div>
                ),
                okText: 'Confirm & Pay',
                cancelText: 'Go Back',
                centered: true,
                onOk: handlePurchaseClick,
              });
            }}
            icon={<CheckCircleOutlined />}
          >
            Complete Purchase
          </Button>
        </div>
      )}
    </Modal>
  );
};

export default PackagePurchaseModal;
