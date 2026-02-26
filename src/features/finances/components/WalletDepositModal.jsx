/**
 * WalletDepositModal Component
 * Wallet top-up modal with Iyzico integration
 * 
 * User enters deposit amount in their preferred (display) currency.
 * Iyzico supports EUR, USD, GBP, TRY natively — no conversion needed.
 * For unsupported currencies, backend converts to TRY as fallback.
 * Wallet is credited in the user's display currency.
 */

import { useState, useCallback, useEffect } from 'react';
import { Modal, Form, InputNumber, Alert, App } from 'antd';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { useAuth } from '@/shared/hooks/useAuth';
import apiClient from '@/shared/services/apiClient';
import IyzicoCheckout from './IyzicoCheckout';

// Minimum and maximum deposit amounts (in each currency)
const DEPOSIT_LIMITS = {
  TRY: { min: 10, max: 50000 },
  EUR: { min: 1, max: 1500 },
  USD: { min: 1, max: 1500 },
  GBP: { min: 1, max: 1200 }
};

// Quick amount presets per currency
function getQuickAmounts(currency) {
  switch (currency) {
    case 'TRY': return [100, 250, 500, 1000, 2500];
    case 'GBP': return [10, 25, 50, 100, 200];
    default:    return [10, 25, 50, 100, 250];
  }
}

export function WalletDepositModal({ visible, onClose, onSuccess }) {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const { formatCurrency, businessCurrency, userCurrency } = useCurrency();
  const { user } = useAuth();
  
  const displayCurrency = user?.preferred_currency || userCurrency || businessCurrency || 'EUR';
  
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [iyzicoData, setIyzicoData] = useState(null);
  const [depositId, setDepositId] = useState(null);
  const [selectedDisplayCurrency, setSelectedDisplayCurrency] = useState(displayCurrency);
  const [depositAmount, setDepositAmount] = useState(null);
  const [paymentResult, setPaymentResult] = useState(null);   // data from successful payment
  const [failureReason, setFailureReason] = useState(null);   // reason string for failed payment
  
  useEffect(() => {
    if (visible && displayCurrency) {
      setSelectedDisplayCurrency(displayCurrency);
      setDepositAmount(null);
    }
  }, [visible, displayCurrency]);

  const handleClose = useCallback(() => {
    const wasPaymentSuccess = currentStep === 2;
    setCurrentStep(0);
    setLoading(false);
    setError(null);
    setIyzicoData(null);
    setDepositId(null);
    setDepositAmount(null);
    setPaymentResult(null);
    setFailureReason(null);
    form.resetFields();
    if (wasPaymentSuccess) {
      onSuccess?.();
    }
    onClose?.();
  }, [form, onClose, onSuccess, currentStep]);

  const handleSubmit = useCallback(async (values) => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.post('/wallet/deposit', {
        amount: depositAmount,
        currency: selectedDisplayCurrency,
        gateway: 'iyzico',
        metadata: {
          displayCurrency: selectedDisplayCurrency,
          displayAmount: depositAmount
        }
      });

      // Store the deposit ID for status polling
      const deposit = response.data?.deposit;
      if (deposit?.id) {
        setDepositId(deposit.id);
      }

      const gatewaySession = response.data?.gatewaySession;
      if (gatewaySession?.checkoutFormContent || gatewaySession?.paymentPageUrl) {
        setIyzicoData(gatewaySession);
        setCurrentStep(1);
      } else if (response.data?.checkoutFormContent || response.data?.paymentPageUrl) {
        setIyzicoData(response.data);
        setCurrentStep(1);
      } else {
        throw new Error('Payment form could not be retrieved');
      }
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Payment could not be initiated';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [depositAmount, selectedDisplayCurrency]);

  const handlePaymentSuccess = useCallback((data) => {
    setPaymentResult(data || {});
    setCurrentStep(2);
    // Don't call onSuccess here — parents close the modal in their onSuccess handler,
    // which would hide the success screen. Instead, call it when user clicks "Done".
  }, []);

  const handlePaymentError = useCallback((errorMessage) => {
    setFailureReason(errorMessage || 'Payment could not be completed');
    setCurrentStep(3); // Go to failure screen instead of step 0
    setIyzicoData(null);
  }, []);

  const handleRetryPayment = useCallback(() => {
    setFailureReason(null);
    setDepositId(null);
    setIyzicoData(null);
    setCurrentStep(0);
  }, []);

  const handleAmountChange = useCallback((value) => {
    setDepositAmount(value);
  }, []);

  const limits = DEPOSIT_LIMITS[selectedDisplayCurrency] || DEPOSIT_LIMITS.EUR;
  const quickAmounts = getQuickAmounts(selectedDisplayCurrency);
  const canSubmit = depositAmount && depositAmount >= limits.min && depositAmount <= limits.max;

  // Iyzico natively supports these currencies (no TRY conversion needed)
  const isNativeCurrency = ['TRY', 'EUR', 'USD', 'GBP'].includes(selectedDisplayCurrency);

  // ─── Step 0: Amount ───
  const renderAmountStep = () => (
    <Form form={form} layout="vertical" onFinish={handleSubmit} initialValues={{ amount: null }}>
      {error && (
        <Alert
          message={error}
          type="error"
          showIcon
          closable
          onClose={() => setError(null)}
          className="!mb-4 !rounded-lg !text-xs"
        />
      )}

      {/* Amount input */}
      <div className="mb-4">
        <label className="block text-[11px] font-semibold uppercase tracking-widest text-gray-400 mb-2">
          Deposit Amount
        </label>
        <Form.Item
          name="amount"
          className="!mb-0"
          rules={[
            { required: true, message: 'Enter an amount' },
            { type: 'number', min: limits.min, message: `Min ${formatCurrency(limits.min, selectedDisplayCurrency)}` },
            { type: 'number', max: limits.max, message: `Max ${formatCurrency(limits.max, selectedDisplayCurrency)}` }
          ]}
        >
          <InputNumber
            size="large"
            className="!w-full !rounded-xl"
            min={limits.min}
            max={limits.max}
            placeholder={`${limits.min} – ${limits.max.toLocaleString()}`}
            addonAfter={
              <span className="text-xs font-semibold text-gray-500">{selectedDisplayCurrency}</span>
            }
            onChange={handleAmountChange}
          />
        </Form.Item>
      </div>

      {/* Quick amounts */}
      <div className="flex flex-wrap gap-1.5 mb-5">
        {quickAmounts.map((amt) => (
          <button
            key={amt}
            type="button"
            onClick={() => { form.setFieldsValue({ amount: amt }); setDepositAmount(amt); }}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition cursor-pointer
              ${depositAmount === amt
                ? 'border-gray-900 bg-gray-900 text-white'
                : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'
              }`}
          >
            {formatCurrency(amt, selectedDisplayCurrency)}
          </button>
        ))}
      </div>

      {/* Payment info */}
      {depositAmount > 0 && (
        <div className="rounded-xl bg-gray-50 border border-gray-100 p-3.5 mb-5">
          <div className="flex items-start gap-2.5">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0">
              <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
            </svg>
            <div className="min-w-0 text-xs leading-relaxed">
              <p className="text-gray-700">
                Wallet receives <span className="font-bold text-gray-900">{formatCurrency(depositAmount, selectedDisplayCurrency)}</span>
              </p>
              <p className="text-gray-400 text-[11px] mt-1">
                {isNativeCurrency
                  ? `Payment charged in ${selectedDisplayCurrency} · Your bank may apply a small conversion fee`
                  : 'Payment converted to TRY · Your bank converts to your card currency'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Submit */}
      <Form.Item className="!mb-0">
        <button
          type="submit"
          disabled={!canSubmit || loading}
          className={`w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition
            ${canSubmit && !loading
              ? 'bg-gray-900 text-white shadow-sm hover:bg-gray-800 active:scale-[0.98] cursor-pointer'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
        >
          {loading ? (
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z" />
            </svg>
          )}
          {canSubmit && depositAmount
            ? `Deposit ${formatCurrency(depositAmount, selectedDisplayCurrency)}`
            : 'Continue to Payment'
          }
        </button>
      </Form.Item>

      {/* Trust badge */}
      <p className="mt-3 text-center text-[11px] text-gray-400 leading-relaxed">
        🔒 Secure payment · Protected by iyzico
        <br />
        <span className="text-[10px]">
          Processed securely via iyzico payment gateway
        </span>
      </p>
    </Form>
  );

  // ─── Step 1: Iyzico ───
  const renderPaymentStep = () => (
    <IyzicoCheckout
      visible={true}
      paymentPageUrl={iyzicoData?.paymentPageUrl}
      depositId={depositId}
      onClose={() => { setCurrentStep(0); setIyzicoData(null); }}
      onSuccess={handlePaymentSuccess}
      onError={handlePaymentError}
    />
  );

  // ─── Step 2: Success Receipt ───
  const renderSuccessStep = () => {
    const completedAt = paymentResult?.completedAt
      ? new Date(paymentResult.completedAt)
      : new Date();

    const receiptAmount = paymentResult?.amount || depositAmount;
    const receiptCurrency = paymentResult?.currency || selectedDisplayCurrency;
    const refId = depositId ? depositId.slice(0, 8).toUpperCase() : '—';

    return (
      <div className="flex flex-col items-center py-5 px-1">
        {/* Success icon with animation */}
        <div className="relative mb-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 ring-4 ring-emerald-50/50">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor" className="h-8 w-8 text-emerald-500">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
          </div>
        </div>

        <h3 className="text-lg font-bold text-gray-900 mb-0.5">Payment Successful</h3>
        <p className="text-xs text-gray-400 mb-5">Your wallet has been topped up</p>

        {/* Receipt card */}
        <div className="w-full rounded-2xl border border-gray-100 bg-gray-50/50 overflow-hidden">
          {/* Amount hero */}
          <div className="bg-white px-5 py-4 text-center border-b border-dashed border-gray-200">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">Amount Added</p>
            <p className="text-2xl font-bold text-gray-900">
              {formatCurrency(receiptAmount, receiptCurrency)}
            </p>
          </div>

          {/* Details */}
          <div className="px-5 py-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-gray-400">Reference</span>
              <span className="text-[11px] font-mono font-semibold text-gray-600">#{refId}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-gray-400">Method</span>
              <span className="text-[11px] font-medium text-gray-600">Credit Card · iyzico</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-gray-400">Date</span>
              <span className="text-[11px] font-medium text-gray-600">
                {completedAt.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                {' · '}
                {completedAt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-gray-400">Status</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Completed
              </span>
            </div>
          </div>
        </div>

        {/* Done button */}
        <button
          type="button"
          onClick={handleClose}
          className="mt-5 w-full rounded-xl bg-gray-900 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 active:scale-[0.97] cursor-pointer"
        >
          Done
        </button>
      </div>
    );
  };

  // ─── Step 3: Failure ───
  const renderFailureStep = () => (
    <div className="flex flex-col items-center py-6 px-1 text-center">
      {/* Error icon */}
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-50 ring-4 ring-red-50/50 mb-4">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-8 w-8 text-red-500">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
        </svg>
      </div>

      <h3 className="text-lg font-bold text-gray-900 mb-1">Payment Not Completed</h3>

      {/* Reason */}
      {failureReason && (
        <div className="w-full rounded-xl bg-red-50 border border-red-100 p-3 mt-3 mb-2">
          <p className="text-xs text-red-700 leading-relaxed">{failureReason}</p>
        </div>
      )}

      {/* Reassurance */}
      <div className="w-full rounded-xl bg-gray-50 border border-gray-100 p-3 mt-2 mb-5">
        <div className="flex items-start gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
          </svg>
          <p className="text-xs text-gray-500 leading-relaxed text-left">
            No funds were charged to your card. You can safely try again or use a different payment method.
          </p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-col gap-2 w-full">
        <button
          type="button"
          onClick={handleRetryPayment}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-gray-900 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 active:scale-[0.97] cursor-pointer"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
          </svg>
          Try Again
        </button>
        <button
          type="button"
          onClick={handleClose}
          className="w-full rounded-xl border border-gray-200 py-2 text-xs font-medium text-gray-500 transition hover:bg-gray-50 cursor-pointer"
        >
          Close
        </button>
      </div>
    </div>
  );

  // Step indicator dots
  const stepItems = [
    { title: 'Amount' },
    { title: 'Payment' },
    { title: 'Complete' },
  ];

  return (
    <>
      <Modal
        open={visible && currentStep !== 1}
        onCancel={handleClose}
        footer={null}
        closable={false}
        width={400}
        centered
        destroyOnHidden
        styles={{
          body: { padding: 0 },
          content: {
            padding: 0,
            borderRadius: 16,
            overflow: 'hidden',
            boxShadow: '0 20px 60px rgba(0,0,0,0.12), 0 4px 16px rgba(0,0,0,0.04)',
          },
          mask: { backdropFilter: 'blur(6px)', background: 'rgba(0,0,0,0.2)' },
        }}
      >
        {/* Header */}
        <div className="relative bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 px-5 pt-4 pb-4">
          <button
            type="button"
            onClick={handleClose}
            className="absolute top-3 right-3 flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-white/60 transition hover:bg-white/20 hover:text-white cursor-pointer"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-3.5 w-3.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 backdrop-blur-sm">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-4.5 w-4.5 text-white">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white leading-tight">Add Funds</h3>
              <p className="text-[10px] text-white/50 mt-0.5">Credit card · iyzico</p>
            </div>
          </div>
        </div>

        {/* Step indicator - hide on failure screen */}
        {currentStep !== 3 && (
        <div className="px-5 pt-4 pb-1">
          <div className="flex items-center justify-between">
            {stepItems.map((s, i) => (
              <div key={s.title} className="flex items-center gap-1.5">
                <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold
                  ${i <= currentStep ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-400'}
                `}>
                  {i < currentStep ? '✓' : i + 1}
                </span>
                <span className={`text-[11px] font-medium ${i <= currentStep ? 'text-gray-700' : 'text-gray-400'}`}>
                  {s.title}
                </span>
                {i < stepItems.length - 1 && (
                  <div className={`mx-2 h-px w-8 ${i < currentStep ? 'bg-gray-900' : 'bg-gray-200'}`} />
                )}
              </div>
            ))}
          </div>
        </div>
        )}

        {/* Content */}
        <div className="px-5 pt-3 pb-5">
          {currentStep === 0 && renderAmountStep()}
          {currentStep === 2 && renderSuccessStep()}
          {currentStep === 3 && renderFailureStep()}
        </div>
      </Modal>

      {currentStep === 1 && renderPaymentStep()}
    </>
  );
}

export default WalletDepositModal;
