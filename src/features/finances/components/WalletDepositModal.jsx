/**
 * WalletDepositModal Component
 * Cüzdana para yükleme modal'ı - Iyzico entegrasyonu
 */

import { useState, useCallback, useEffect } from 'react';
import { Modal, Form, InputNumber, Select, Button, Alert, Steps, Result } from 'antd';
import { WalletOutlined, CreditCardOutlined, CheckCircleOutlined, LoadingOutlined } from '@ant-design/icons';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { useAuth } from '@/shared/hooks/useAuth';
import apiClient from '@/shared/services/apiClient';
import IyzicoCheckout from './IyzicoCheckout';

const { Option } = Select;
const { Step } = Steps;

// Minimum ve maximum deposit tutarları
const DEPOSIT_LIMITS = {
  TRY: { min: 10, max: 50000 },
  EUR: { min: 1, max: 5000 },
  USD: { min: 1, max: 5000 },
  GBP: { min: 1, max: 5000 }
};

export function WalletDepositModal({ visible, onClose, onSuccess }) {
  const [form] = Form.useForm();
  const { formatCurrency, businessCurrency, userCurrency } = useCurrency();
  const { user } = useAuth();
  
  // Get user's preferred currency or fallback to userCurrency from context
  const defaultCurrency = user?.preferred_currency || userCurrency || businessCurrency || 'EUR';
  
  // State
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [iyzicoData, setIyzicoData] = useState(null);
  const [selectedCurrency, setSelectedCurrency] = useState(defaultCurrency);
  
  // Update selected currency when user changes
  useEffect(() => {
    if (visible && defaultCurrency) {
      setSelectedCurrency(defaultCurrency);
      form.setFieldsValue({ currency: defaultCurrency });
    }
  }, [visible, defaultCurrency, form]);

  // Reset state when modal closes
  const handleClose = useCallback(() => {
    setCurrentStep(0);
    setLoading(false);
    setError(null);
    setIyzicoData(null);
    form.resetFields();
    onClose?.();
  }, [form, onClose]);

  // Form submit - Iyzico payment initiation
  const handleSubmit = useCallback(async (values) => {
    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.post('/wallet/deposit', {
        amount: values.amount,
        currency: values.currency,
        gateway: 'iyzico'
      });

      // Response structure: { deposit, transaction, gatewaySession }
      const gatewaySession = response.data?.gatewaySession;
      
      if (gatewaySession?.checkoutFormContent || gatewaySession?.paymentPageUrl) {
        setIyzicoData(gatewaySession);
        setCurrentStep(1);
      } else if (response.data?.checkoutFormContent || response.data?.paymentPageUrl) {
        // Fallback for direct response
        setIyzicoData(response.data);
        setCurrentStep(1);
      } else {
        throw new Error('Payment form could not be retrieved');
      }
    } catch (err) {
      const message = err.response?.data?.error || err.message || 'Payment could not be initiated';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Ödeme başarılı
  const handlePaymentSuccess = useCallback(() => {
    setCurrentStep(2);
    onSuccess?.();
  }, [onSuccess]);

  // Ödeme hatası
  const handlePaymentError = useCallback((errorMessage) => {
    setError(errorMessage || 'Ödeme işlemi başarısız oldu');
    setCurrentStep(0);
    setIyzicoData(null);
  }, []);

  // Currency değiştiğinde limitleri güncelle
  const handleCurrencyChange = useCallback((currency) => {
    setSelectedCurrency(currency);
    form.setFieldsValue({ amount: null });
  }, [form]);

  const limits = DEPOSIT_LIMITS[selectedCurrency] || DEPOSIT_LIMITS.EUR;

  // Step 1: Tutar Seçimi
  const renderAmountStep = () => (
    <Form
      form={form}
      layout="vertical"
      onFinish={handleSubmit}
      initialValues={{
        currency: selectedCurrency,
        amount: null
      }}
    >
      {error && (
        <Alert
          message="Error"
          description={error}
          type="error"
          showIcon
          closable
          onClose={() => setError(null)}
          className="mb-4"
        />
      )}

      <Form.Item
        name="currency"
        label="Currency"
        rules={[{ required: true, message: 'Please select a currency' }]}
      >
        <Select size="large" onChange={handleCurrencyChange}>
          <Option value="TRY">🇹🇷 Turkish Lira (TRY)</Option>
          <Option value="EUR">🇪🇺 Euro (EUR)</Option>
          <Option value="USD">🇺🇸 US Dollar (USD)</Option>
          <Option value="GBP">🇬🇧 British Pound (GBP)</Option>
        </Select>
      </Form.Item>

      <Form.Item
        name="amount"
        label="Amount to Deposit"
        rules={[
          { required: true, message: 'Please enter an amount' },
          { 
            type: 'number', 
            min: limits.min, 
            message: `Minimum ${formatCurrency(limits.min, selectedCurrency)}` 
          },
          { 
            type: 'number', 
            max: limits.max, 
            message: `Maximum ${formatCurrency(limits.max, selectedCurrency)}` 
          }
        ]}
      >
        <InputNumber
          size="large"
          className="w-full"
          min={limits.min}
          max={limits.max}
          precision={2}
          placeholder={`${limits.min} - ${limits.max}`}
          addonAfter={selectedCurrency}
        />
      </Form.Item>

      {/* Quick amount selection */}
      <div className="mb-4">
        <span className="text-gray-500 text-sm mb-2 block">Quick Select:</span>
        <div className="flex flex-wrap gap-2">
          {getQuickAmounts(selectedCurrency).map((amount) => (
            <Button
              key={amount}
              size="small"
              onClick={() => form.setFieldsValue({ amount })}
            >
              {formatCurrency(amount, selectedCurrency)}
            </Button>
          ))}
        </div>
      </div>

      <Form.Item className="mb-0 mt-6">
        <Button
          type="primary"
          htmlType="submit"
          size="large"
          block
          loading={loading}
          icon={<CreditCardOutlined />}
          className="bg-blue-600 hover:bg-blue-700"
        >
          Continue to Payment
        </Button>
      </Form.Item>

      <div className="mt-4 text-center text-sm text-gray-500">
        🔒 Secure payment • Protected by iyzico
      </div>
    </Form>
  );

  // Step 2: Iyzico Ödeme
  const renderPaymentStep = () => (
    <IyzicoCheckout
      visible={true}
      checkoutFormContent={iyzicoData?.checkoutFormContent}
      paymentPageUrl={iyzicoData?.paymentPageUrl}
      onClose={() => {
        setCurrentStep(0);
        setIyzicoData(null);
      }}
      onSuccess={handlePaymentSuccess}
      onError={handlePaymentError}
    />
  );

  // Step 3: Success
  const renderSuccessStep = () => (
    <Result
      status="success"
      icon={<CheckCircleOutlined className="text-green-500" />}
      title="Payment Successful!"
      subTitle="The amount has been added to your wallet."
      extra={[
        <Button 
          type="primary" 
          key="close" 
          onClick={handleClose}
          className="bg-blue-600 hover:bg-blue-700"
        >
          Done
        </Button>
      ]}
    />
  );

  // Ana render
  return (
    <>
      {/* Main deposit modal - hidden when showing payment */}
      <Modal
        open={visible && currentStep !== 1}
        onCancel={handleClose}
        footer={null}
        title={
          <span>
            <WalletOutlined className="mr-2" />
            Add Funds to Wallet
          </span>
        }
        width={480}
        centered
      >
        {/* Steps indicator */}
        <Steps current={currentStep} className="mb-6" size="small">
          <Step title="Amount" icon={currentStep === 0 && loading ? <LoadingOutlined /> : undefined} />
          <Step title="Payment" />
          <Step title="Complete" />
        </Steps>

        {/* Step content */}
        {currentStep === 0 && renderAmountStep()}
        {currentStep === 2 && renderSuccessStep()}
      </Modal>

      {/* Iyzico payment modal - shown separately */}
      {currentStep === 1 && renderPaymentStep()}
    </>
  );
}

// Hızlı tutar seçenekleri
function getQuickAmounts(currency) {
  switch (currency) {
    case 'TRY':
      return [100, 250, 500, 1000, 2500];
    case 'EUR':
    case 'USD':
      return [10, 25, 50, 100, 250];
    case 'GBP':
      return [10, 25, 50, 100, 200];
    default:
      return [10, 25, 50, 100, 250];
  }
}

export default WalletDepositModal;
