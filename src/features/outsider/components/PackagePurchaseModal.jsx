/**
 * PackagePurchaseModal
 * 
 * Reusable modal for purchasing packages with payment options,
 * accommodation dates, and promo code support.
 */

import { useState } from 'react';
import { Modal, Card, Typography, Button, Tag, Divider, Space, Radio, Input, Form, DatePicker } from 'antd';
import {
  ShoppingOutlined,
  WalletOutlined,
  CheckCircleOutlined,
  CreditCardOutlined,
  CalendarOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import PromoCodeInput from '@/shared/components/PromoCodeInput';

const { Title, Text } = Typography;

// Payment processor options
const PROCESSOR_OPTIONS = [
  { value: 'stripe', label: 'Stripe (Credit Card)' },
  { value: 'paytr', label: 'PayTR' },
  { value: 'binance_pay', label: 'Binance Pay' },
  { value: 'revolut', label: 'Revolut' },
  { value: 'paypal', label: 'PayPal' }
];

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
  
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('wallet');
  const [accommodationDates, setAccommodationDates] = useState({ checkIn: null, checkOut: null });
  const [appliedVoucher, setAppliedVoucher] = useState(null);
  const [processorForm] = Form.useForm();

  const handleClose = () => {
    setSelectedPaymentMethod('wallet');
    setAccommodationDates({ checkIn: null, checkOut: null });
    setAppliedVoucher(null);
    processorForm.resetFields();
    onCancel();
  };

  const getPackageDisplayPrice = (pkg) => {
    const { price, currency } = getPackagePriceInCurrency(pkg, userCurrency, convertCurrency);
    let finalPrice = price;
    
    if (appliedVoucher) {
      if (appliedVoucher.discountType === 'percentage') {
        finalPrice = price * (1 - appliedVoucher.discountValue / 100);
      } else {
        finalPrice = Math.max(0, price - appliedVoucher.discountValue);
      }
    }
    
    return formatCurrency(finalPrice, currency);
  };

  const handlePurchaseClick = async () => {
    const packageType = selectedPackage?.packageType || selectedPackage?.package_type;
    const needsAccommodationDates = ['accommodation', 'accommodation_rental', 'accommodation_lesson', 'all_inclusive'].includes(packageType);
    
    if (needsAccommodationDates && (!accommodationDates.checkIn || !accommodationDates.checkOut)) {
      return { error: 'Please select check-in and check-out dates for accommodation.' };
    }

    let processor = null;
    let reference = null;
    let note = null;

    if (selectedPaymentMethod === 'external') {
      try {
        const values = await processorForm.validateFields();
        processor = values.processor;
        reference = values.reference;
        note = values.note;
      } catch {
        return { error: 'Please fill in payment details.' };
      }
    }

    onPurchase({
      packageId: selectedPackage.id,
      paymentMethod: selectedPaymentMethod,
      externalPaymentProcessor: processor,
      externalPaymentReference: reference,
      externalPaymentNote: note,
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
              onVoucherApplied={setAppliedVoucher}
              onVoucherRemoved={() => setAppliedVoucher(null)}
              packageId={selectedPackage.id}
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
              <Radio value="external">
                <div className="flex items-center gap-2">
                  <CreditCardOutlined />
                  <span>External Payment</span>
                </div>
              </Radio>
              <Radio value="pay_later">
                <div className="flex items-center gap-2">
                  <CalendarOutlined />
                  <span>Pay Later</span>
                </div>
              </Radio>
            </Space>
          </Radio.Group>

          {/* External Payment Form */}
          {selectedPaymentMethod === 'external' && (
            <Form form={processorForm} layout="vertical" className="mb-4">
              <Form.Item
                name="processor"
                label="Payment Processor"
                rules={[{ required: true, message: 'Please select a processor' }]}
              >
                <Radio.Group>
                  <Space wrap>
                    {PROCESSOR_OPTIONS.map((opt) => (
                      <Radio.Button key={opt.value} value={opt.value}>
                        {opt.label}
                      </Radio.Button>
                    ))}
                  </Space>
                </Radio.Group>
              </Form.Item>
              <Form.Item
                name="reference"
                label="Transaction Reference"
              >
                <Input placeholder="Transaction ID or reference number" />
              </Form.Item>
              <Form.Item
                name="note"
                label="Note"
              >
                <Input.TextArea placeholder="Additional notes (optional)" rows={2} />
              </Form.Item>
            </Form>
          )}

          <Button
            type="primary"
            size="large"
            block
            loading={isPurchasing}
            onClick={handlePurchaseClick}
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
