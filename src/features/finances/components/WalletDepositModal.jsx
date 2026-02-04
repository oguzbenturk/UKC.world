/**
 * WalletDepositModal Component
 * Cüzdana para yükleme modal'ı - Iyzico entegrasyonu
 * 
 * Supports separate display currency (user's preferred) and payment currency (card currency).
 * User enters amount in their preferred currency but can pay with any supported card currency.
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { Modal, Form, InputNumber, Select, Button, Alert, Steps, Result, Divider, Typography } from 'antd';
import { WalletOutlined, CreditCardOutlined, CheckCircleOutlined, LoadingOutlined, SwapOutlined } from '@ant-design/icons';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { useAuth } from '@/shared/hooks/useAuth';
import apiClient from '@/shared/services/apiClient';
import IyzicoCheckout from './IyzicoCheckout';

const { Option } = Select;
const { Step } = Steps;
const { Text } = Typography;

// Minimum ve maximum deposit tutarları (in each currency)
const DEPOSIT_LIMITS = {
  TRY: { min: 10, max: 50000 },
  EUR: { min: 1, max: 5000 },
  USD: { min: 1, max: 5000 },
  GBP: { min: 1, max: 5000 }
};

// Supported payment currencies
const PAYMENT_CURRENCIES = ['TRY', 'EUR', 'USD', 'GBP'];

export function WalletDepositModal({ visible, onClose, onSuccess }) {
  const [form] = Form.useForm();
  const { formatCurrency, businessCurrency, userCurrency, convertCurrency } = useCurrency();
  const { user } = useAuth();
  
  // Get user's preferred currency for DISPLAY (what they see in wallet)
  const displayCurrency = user?.preferred_currency || userCurrency || businessCurrency || 'EUR';
  
  // State
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [iyzicoData, setIyzicoData] = useState(null);
  const [selectedDisplayCurrency, setSelectedDisplayCurrency] = useState(displayCurrency);
  const [paymentCurrency, setPaymentCurrency] = useState(displayCurrency); // Currency to send to gateway
  const [depositAmount, setDepositAmount] = useState(null); // Amount in display currency
  
  // Calculate payment amount in selected payment currency
  const paymentAmount = useMemo(() => {
    if (!depositAmount || selectedDisplayCurrency === paymentCurrency) {
      return depositAmount;
    }
    return convertCurrency(depositAmount, selectedDisplayCurrency, paymentCurrency);
  }, [depositAmount, selectedDisplayCurrency, paymentCurrency, convertCurrency]);
  
  // Update currencies when modal opens
  useEffect(() => {
    if (visible && displayCurrency) {
      setSelectedDisplayCurrency(displayCurrency);
      setPaymentCurrency(displayCurrency);
      setDepositAmount(null);
    }
  }, [visible, displayCurrency]);

  // Reset state when modal closes
  const handleClose = useCallback(() => {
    setCurrentStep(0);
    setLoading(false);
    setError(null);
    setIyzicoData(null);
    setDepositAmount(null);
    form.resetFields();
    onClose?.();
  }, [form, onClose]);

  // Form submit - Iyzico payment initiation
  // Send payment in selected payment currency
  const handleSubmit = useCallback(async (values) => {
    setLoading(true);
    setError(null);

    try {
      // Send payment in the selected payment currency
      const response = await apiClient.post('/wallet/deposit', {
        amount: paymentAmount, // Amount in payment currency
        currency: paymentCurrency, // Currency to charge
        gateway: 'iyzico',
        metadata: {
          // Store display currency info for reference
          displayCurrency: selectedDisplayCurrency,
          displayAmount: depositAmount,
          paymentCurrency: paymentCurrency,
          paymentAmount: paymentAmount
        }
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
  }, [paymentAmount, paymentCurrency, selectedDisplayCurrency, depositAmount]);

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

  // Payment currency change handler
  const handlePaymentCurrencyChange = useCallback((currency) => {
    setPaymentCurrency(currency);
  }, []);

  // Amount change handler
  const handleAmountChange = useCallback((value) => {
    setDepositAmount(value);
  }, []);

  const limits = DEPOSIT_LIMITS[selectedDisplayCurrency] || DEPOSIT_LIMITS.EUR;
  const showConversionPreview = paymentCurrency !== selectedDisplayCurrency && depositAmount > 0;

  // Step 1: Tutar Seçimi
  const renderAmountStep = () => (
    <Form
      form={form}
      layout="vertical"
      onFinish={handleSubmit}
      initialValues={{
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
        name="amount"
        label={`Amount to Deposit (${selectedDisplayCurrency})`}
        rules={[
          { required: true, message: 'Please enter an amount' },
          { 
            type: 'number', 
            min: limits.min, 
            message: `Minimum ${formatCurrency(limits.min, selectedDisplayCurrency)}` 
          },
          { 
            type: 'number', 
            max: limits.max, 
            message: `Maximum ${formatCurrency(limits.max, selectedDisplayCurrency)}` 
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
          addonAfter={selectedDisplayCurrency}
          onChange={handleAmountChange}
        />
      </Form.Item>

      {/* Quick amount selection */}
      <div className="mb-4">
        <span className="text-gray-500 text-sm mb-2 block">Quick Select:</span>
        <div className="flex flex-wrap gap-2">
          {getQuickAmounts(selectedDisplayCurrency).map((amount) => (
            <Button
              key={amount}
              size="small"
              onClick={() => {
                form.setFieldsValue({ amount });
                setDepositAmount(amount);
              }}
            >
              {formatCurrency(amount, selectedDisplayCurrency)}
            </Button>
          ))}
        </div>
      </div>

      <Divider className="my-4">
        <SwapOutlined /> Payment Method
      </Divider>

      <Form.Item
        label="Pay with (card currency)"
        tooltip="Select the currency your card uses. This determines what currency is sent to the payment gateway."
      >
        <Select 
          size="large" 
          value={paymentCurrency}
          onChange={handlePaymentCurrencyChange}
          getPopupContainer={(triggerNode) => triggerNode.parentElement}
          popupMatchSelectWidth={true}
        >
          <Option value="TRY">🇹🇷 Turkish Lira (TRY)</Option>
          <Option value="EUR">🇪🇺 Euro (EUR)</Option>
          <Option value="USD">🇺🇸 US Dollar (USD)</Option>
          <Option value="GBP">🇬🇧 British Pound (GBP)</Option>
        </Select>
      </Form.Item>

      {/* Conversion Preview */}
      {showConversionPreview && (
        <Alert
          type="info"
          showIcon
          icon={<SwapOutlined />}
          message="Currency Conversion"
          description={
            <div className="mt-1">
              <Text>You want <Text strong>{formatCurrency(depositAmount, selectedDisplayCurrency)}</Text> in your wallet.</Text>
              <br />
              <Text>Your card will be charged <Text strong className="text-blue-600">{formatCurrency(paymentAmount, paymentCurrency)}</Text>.</Text>
              <br />
              <Text type="secondary" className="text-xs">
                💳 Note: Payment gateway will process in {paymentCurrency}. Your bank may apply additional conversion.
              </Text>
              <br />
              <Text type="secondary" className="text-xs mt-1 block">
                Exchange rates are approximate. Final amount may vary slightly.
              </Text>
            </div>
          }
          className="mb-4"
        />
      )}

      <Form.Item className="mb-0 mt-6">
        <Button
          type="primary"
          htmlType="submit"
          size="large"
          block
          loading={loading}
          disabled={!depositAmount || depositAmount < limits.min}
          icon={<CreditCardOutlined />}
          className="bg-blue-600 hover:bg-blue-700"
        >
          {paymentAmount && paymentCurrency
            ? `Pay ${formatCurrency(paymentAmount, paymentCurrency)}`
            : 'Continue to Payment'
          }
        </Button>
      </Form.Item>

      <div className="mt-4 text-center text-sm text-gray-500">
        🔒 Secure payment • Protected by iyzico
        <br />
        <span className="text-xs">
          Payment processed in {paymentCurrency} • Currency conversion may apply
        </span>
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
