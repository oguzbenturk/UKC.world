import { useState, useEffect, useMemo, useCallback } from 'react';
import { Modal, Button, Typography, Alert, Spin, Result, Input, Upload, Select, Tooltip } from 'antd';
import {
  WalletOutlined,
  CreditCardOutlined,
  CheckCircleOutlined,
  ShoppingCartOutlined,
  SafetyCertificateOutlined,
  LoadingOutlined,
  EnvironmentOutlined,
  BankOutlined,
  UploadOutlined,
  CheckOutlined,
  CopyOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useCart } from '@/shared/contexts/CartContext';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { useAuth } from '@/shared/hooks/useAuth';
import apiClient, { resolveApiBaseUrl, getAccessToken } from '@/shared/services/apiClient';
import PromoCodeInput from '@/shared/components/PromoCodeInput';

const { Text } = Typography;

// ─── Bank transfer helpers ────────────────────────────────────────────────────

function CopyButton({ value }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(value || '').then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <Tooltip title={copied ? 'Copied!' : 'Copy'} placement="top">
      <button
        type="button"
        onClick={handleCopy}
        style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#00a8c4', cursor: 'pointer', background: 'none', border: 'none', padding: 0, marginLeft: 12 }}
      >
        {copied ? (
          <><CheckOutlined style={{ color: '#10b981' }} /><span style={{ color: '#10b981' }}>Copied</span></>
        ) : (
          <><CopyOutlined />Copy</>
        )}
      </button>
    </Tooltip>
  );
}

function BankDetailsCard({ account }) {
  if (!account) return null;
  const fields = [
    { label: 'Bank', value: account.bankName },
    { label: 'Account Holder', value: account.accountHolder },
    { label: 'IBAN', value: account.iban, mono: true, copy: true },
    ...(account.swiftCode ? [{ label: 'SWIFT / BIC', value: account.swiftCode, mono: true, copy: true }] : []),
    ...(account.accountNumber ? [{ label: 'Account No.', value: account.accountNumber, mono: true, copy: true }] : []),
  ];
  return (
    <div style={{ marginTop: 10, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', overflow: 'hidden' }}>
      <div style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 6 }}>
        <BankOutlined style={{ color: '#9ca3af', fontSize: 12 }} />
        <Text style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 1 }}>Transfer To · {account.currency}</Text>
      </div>
      <div style={{ padding: '0 12px' }}>
        {fields.map(({ label, value, mono, copy }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ display: 'block', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, color: '#4b5563', marginBottom: 2 }}>{label}</Text>
              <Text style={{ fontSize: 13, color: '#e5e7eb', wordBreak: 'break-all', fontFamily: mono ? 'monospace' : undefined }}>{value}</Text>
            </div>
            {copy && <CopyButton value={value} />}
          </div>
        ))}
      </div>
      {account.instructions && (
        <div style={{ padding: '8px 12px', background: 'rgba(245,158,11,0.06)', borderTop: '1px solid rgba(245,158,11,0.15)', display: 'flex', gap: 6 }}>
          <InfoCircleOutlined style={{ color: '#f59e0b', flexShrink: 0, marginTop: 2 }} />
          <Text style={{ fontSize: 11, color: '#fcd34d', lineHeight: 1.5 }}>{account.instructions}</Text>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const DEPOSIT_PERCENT = 20;

const Divider = () => (
  <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '0 24px' }} />
);

const CheckoutModal = ({ visible, onClose, userBalance, onSuccess }) => {
  const { cart, getCartTotal, getCartCount, clearCart } = useCart();
  const { formatCurrency, convertCurrency, businessCurrency, userCurrency } = useCurrency();
  const { user } = useAuth();

  const [paymentMethod, setPaymentMethod] = useState('wallet');
  const [depositMethod, setDepositMethod] = useState('credit_card');
  const [selectedBankAccountId, setSelectedBankAccountId] = useState(null);
  const [fileList, setFileList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [orderDetails, setOrderDetails] = useState(null);
  const [appliedVoucher, setAppliedVoucher] = useState(null);

  const [editingAddress, setEditingAddress] = useState(false);
  const [deliveryAddress, setDeliveryAddress] = useState({
    address: '',
    city: '',
    country: '',
    zip_code: '',
  });

  useEffect(() => {
    if (visible && user) {
      const addr = {
        address: user.address || '',
        city: user.city || '',
        country: user.country || '',
        zip_code: user.zip_code || '',
      };
      setDeliveryAddress(addr);
      setEditingAddress(!addr.address && !addr.city);
    }
  }, [visible, user]);

  const hasCompleteAddress = deliveryAddress.address && deliveryAddress.city && deliveryAddress.country && deliveryAddress.zip_code;

  const formatShippingAddress = () => {
    const parts = [deliveryAddress.address, deliveryAddress.city, deliveryAddress.zip_code, deliveryAddress.country].filter(Boolean);
    return parts.join(', ');
  };

  const { data: bankAccounts = [] } = useQuery({
    queryKey: ['checkout', 'bank-accounts'],
    queryFn: async () => {
      const res = await apiClient.get('/wallet/bank-accounts');
      return res.data?.results || [];
    },
    enabled: visible && paymentMethod === 'deposit',
    staleTime: 300_000,
  });

  const selectedAccount = useMemo(
    () => bankAccounts.find(a => a.id === selectedBankAccountId),
    [bankAccounts, selectedBankAccountId]
  );

  const uploadReceipt = useCallback((file) =>
    new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append('image', file);
      const token = getAccessToken() || localStorage.getItem('token');
      const base = resolveApiBaseUrl();
      const xhr = new XMLHttpRequest();
      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          resolve(JSON.parse(xhr.responseText).url);
        } else {
          reject(new Error(JSON.parse(xhr.responseText || '{}').error || 'Upload failed'));
        }
      });
      xhr.addEventListener('error', () => reject(new Error('Upload failed')));
      xhr.open('POST', `${base}/api/upload/wallet-deposit`);
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.send(formData);
    }), []);

  const storageCurrency = businessCurrency || 'EUR';
  const showDualCurrency = storageCurrency !== userCurrency && convertCurrency;

  const formatDualAmount = (amount, baseCurrency = storageCurrency) => {
    const eurAmount = baseCurrency === 'EUR' ? amount : (convertCurrency ? convertCurrency(amount, baseCurrency, 'EUR') : amount);
    const eurFormatted = formatCurrency(eurAmount, 'EUR');
    if (!showDualCurrency) return eurFormatted;
    const converted = convertCurrency(amount, baseCurrency, userCurrency);
    return `${eurFormatted} (~${formatCurrency(converted, userCurrency)})`;
  };

  const total = getCartTotal();
  const itemCount = getCartCount();

  const voucherDiscount = appliedVoucher?.discount?.discountAmount || 0;
  const finalTotal = Math.max(0, total - voucherDiscount);
  const canAffordWallet = userBalance >= finalTotal;
  const amountNeeded = finalTotal - (userBalance || 0);
  const canUseHybridWallet = !canAffordWallet && (userBalance || 0) > 0;

  const depositAmount = parseFloat((finalTotal * DEPOSIT_PERCENT / 100).toFixed(2));
  const remainingAmount = parseFloat((finalTotal - depositAmount).toFixed(2));
  const isDeposit = paymentMethod === 'deposit';

  const handleCheckout = async () => {
    if (!hasCompleteAddress) {
      setError('Please provide a complete delivery address before checking out');
      return;
    }

    if (paymentMethod === 'wallet' && !canAffordWallet && !canUseHybridWallet) {
      setError('Insufficient wallet balance');
      return;
    }

    if (isDeposit && depositMethod === 'bank_transfer' && (!selectedBankAccountId || fileList.length === 0)) {
      setError('Please select a bank account and upload your deposit receipt');
      return;
    }

    const effectiveMethod = isDeposit
      ? depositMethod
      : (paymentMethod === 'wallet' && !canAffordWallet && canUseHybridWallet)
        ? 'wallet_hybrid'
        : paymentMethod;

    const walletBal = userBalance || 0;
    const creditCardHasWallet = effectiveMethod === 'credit_card' && walletBal > 0;
    const cardPortion = Math.max(0, finalTotal - walletBal);

    const paymentLabel = isDeposit
      ? `Deposit ${DEPOSIT_PERCENT}% (${formatCurrency(depositAmount, storageCurrency)}) via ${depositMethod === 'credit_card' ? 'Card' : 'Bank Transfer'}`
      : effectiveMethod === 'wallet_hybrid'
        ? `Wallet (${formatCurrency(walletBal, storageCurrency)}) + Card (${formatCurrency(amountNeeded, storageCurrency)})`
        : creditCardHasWallet
          ? `Wallet (${formatCurrency(walletBal, storageCurrency)}) + Card (${formatCurrency(cardPortion, storageCurrency)})`
          : effectiveMethod === 'wallet' ? 'Wallet'
          : effectiveMethod === 'credit_card' ? 'Credit Card'
          : 'Cash at Pickup';

    Modal.confirm({
      title: isDeposit ? 'Confirm Deposit Order' : 'Confirm Order',
      icon: <ShoppingCartOutlined style={{ color: '#00a8c4' }} />,
      content: (
        <div style={{ marginTop: 8 }}>
          <p><strong>{itemCount} item{itemCount !== 1 ? 's' : ''}</strong></p>
          {isDeposit ? (
            <div style={{ margin: '8px 0' }}>
              <p style={{ fontSize: 16, fontWeight: 700, color: '#00a8c4' }}>
                Deposit: {formatCurrency(depositAmount, storageCurrency)}
              </p>
              <p style={{ fontSize: 13, color: '#888' }}>
                Remaining on delivery: {formatCurrency(remainingAmount, storageCurrency)}
              </p>
            </div>
          ) : (
            <p style={{ fontSize: 18, fontWeight: 700, margin: '8px 0' }}>{formatCurrency(finalTotal, storageCurrency)}</p>
          )}
          <p style={{ color: '#888' }}>Delivery to: {formatShippingAddress()}</p>
          <p style={{ color: '#888' }}>Payment: {paymentLabel}</p>
          {(effectiveMethod === 'wallet_hybrid' || (creditCardHasWallet && !isDeposit)) && (
            <div style={{ marginTop: 8, padding: '8px 12px', background: '#eff6ff', borderRadius: 8, border: '1px solid #bfdbfe' }}>
              <p style={{ color: '#1d4ed8', fontSize: 13, margin: 0 }}>
                Your wallet balance of <strong>{formatCurrency(Math.min(walletBal, finalTotal), storageCurrency)}</strong> will be used first
                {(cardPortion > 0 || amountNeeded > 0) && <>, and the remaining <strong>{formatCurrency(effectiveMethod === 'wallet_hybrid' ? amountNeeded : cardPortion, storageCurrency)}</strong> will be charged from your card.</>}
              </p>
            </div>
          )}
        </div>
      ),
      okText: isDeposit ? `Pay Deposit ${formatCurrency(depositAmount, storageCurrency)}` : 'Place Order',
      cancelText: 'Go Back',
      centered: true,
      onOk: () => executeCheckout(effectiveMethod),
    });
  };

  const executeCheckout = async (effectiveMethod) => {
    const method = effectiveMethod || paymentMethod;
    setLoading(true);
    setError(null);

    try {
      let receiptUrl = null;
      if (isDeposit && depositMethod === 'bank_transfer') {
        if (fileList.length === 0) {
          setError('Please upload a proof of payment (receipt)');
          setLoading(false);
          return;
        }
        try {
          receiptUrl = await uploadReceipt(fileList[0]);
        } catch (uploadErr) {
          setError(uploadErr.message || 'Error uploading receipt');
          setLoading(false);
          return;
        }
      }

      const items = cart.map(item => ({
        product_id: item.id,
        product_name: item.name,
        quantity: item.quantity,
        selected_size: item.selectedSize,
        selected_color: item.selectedColor,
        selected_variant: item.selectedVariant
      }));

      const response = await apiClient.post('/shop-orders', {
        items,
        payment_method: method,
        use_wallet: method === 'wallet' || method === 'wallet_hybrid',
        shipping_address: formatShippingAddress(),
        voucher_code: appliedVoucher?.code || null,
        ...(isDeposit ? { deposit_percent: DEPOSIT_PERCENT, deposit_amount: depositAmount } : {}),
        ...(isDeposit && depositMethod === 'bank_transfer' ? {
          bank_account_id: selectedBankAccountId,
          receipt_url: receiptUrl,
        } : {}),
      });

      if (response.data.paymentPageUrl) {
        // Do NOT clear cart here — payment hasn't happened yet.
        // Cart will be cleared by PaymentCallback on confirmed success.
        window.location.href = response.data.paymentPageUrl;
        return;
      }

      if (response.data.success) {
        setSuccess(true);
        setOrderDetails(response.data.order);
        clearCart();
        if (onSuccess) onSuccess(response.data.order);
      } else {
        setError(response.data.error || 'Failed to place order');
      }
    } catch (err) {
      console.error('Checkout error:', err);
      setError(err.response?.data?.error || 'Failed to process your order. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (success) {
      setSuccess(false);
      setOrderDetails(null);
    }
    setError(null);
    setPaymentMethod('wallet');
    setDepositMethod('credit_card');
    setSelectedBankAccountId(null);
    setFileList([]);
    setEditingAddress(false);
    setAppliedVoucher(null);
    onClose();
  };

  // ─── Success screen ──────────────────────────────────────────────────────────

  if (success && orderDetails) {
    const isPendingApproval = orderDetails.payment_status === 'waiting_payment';
    return (
      <Modal
        open={visible}
        onCancel={handleClose}
        footer={null}
        width={400}
        centered
        closable={false}
        styles={{
          content: { padding: 0, background: '#111827', borderRadius: 20, overflow: 'hidden' },
          body: { padding: '40px 32px' },
        }}
      >
        <Result
          status="success"
          icon={<CheckCircleOutlined style={{ color: '#10b981' }} />}
          title={
            <span style={{ color: '#f9fafb' }} className="font-duotone-bold-extended">
              {isPendingApproval ? 'Order Submitted!' : 'Order Placed!'}
            </span>
          }
          subTitle={
            <div style={{ marginTop: 8 }}>
              <Text style={{ color: '#9ca3af' }}>
                Order <Text strong style={{ color: '#f9fafb' }}>{orderDetails.order_number}</Text>
              </Text>
              <br />
              <Text style={{ color: isPendingApproval ? '#f59e0b' : '#6b7280', marginTop: 8, display: 'inline-block' }}>
                {isPendingApproval
                  ? 'Pending admin approval — you\'ll be notified once confirmed.'
                  : 'Thank you for your purchase!'}
              </Text>
            </div>
          }
          extra={[
            <Button key="continue" type="primary" onClick={handleClose} size="large"
              className="font-duotone-bold"
              style={{ background: '#00a8c4', border: 'none', color: '#fff', borderRadius: 10 }}>
              Continue Shopping
            </Button>
          ]}
        />
      </Modal>
    );
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  const walletBal = userBalance || 0;
  const cardPortion = Math.max(0, finalTotal - walletBal);
  const showHybridInfo = !isDeposit && (
    (paymentMethod === 'credit_card' && walletBal > 0) ||
    (paymentMethod === 'wallet' && !canAffordWallet && canUseHybridWallet)
  );
  const isBankTransferDepositDisabled = isDeposit && depositMethod === 'bank_transfer' && (!selectedBankAccountId || fileList.length === 0);
  const isButtonDisabled = (paymentMethod === 'wallet' && !canAffordWallet && !canUseHybridWallet) || !hasCompleteAddress || editingAddress || isBankTransferDepositDisabled;

  const buttonLabel = isDeposit
    ? `Pay Deposit ${formatDualAmount(depositAmount)}`
    : paymentMethod === 'wallet' && canUseHybridWallet
      ? 'Pay with Wallet + Card'
      : `Pay ${formatDualAmount(finalTotal)}`;

  const paymentRows = [
    {
      key: 'wallet',
      icon: <WalletOutlined />,
      iconColor: canAffordWallet ? '#10b981' : walletBal > 0 ? '#f59e0b' : '#6b7280',
      label: 'Wallet',
      sublabel: `Balance: ${formatDualAmount(walletBal)}`,
      badge: canAffordWallet
        ? <span style={{ fontSize: 11, color: '#10b981', fontWeight: 600 }}>Full</span>
        : walletBal > 0
          ? <span style={{ fontSize: 11, color: '#f59e0b', fontWeight: 600 }}>Partial</span>
          : <span style={{ fontSize: 11, color: '#4b5563' }}>Empty</span>,
    },
    {
      key: 'credit_card',
      icon: <CreditCardOutlined />,
      iconColor: '#00a8c4',
      label: 'Card',
      sublabel: walletBal > 0 ? 'Wallet balance applied first' : 'Secure via Iyzico',
      badge: <SafetyCertificateOutlined style={{ color: '#10b981', fontSize: 13 }} />,
    },
    {
      key: 'deposit',
      icon: <SafetyCertificateOutlined />,
      iconColor: '#00a8c4',
      label: `Deposit ${DEPOSIT_PERCENT}%`,
      sublabel: `Pay ${formatDualAmount(depositAmount)} now · rest on delivery`,
      badge: null,
    },
  ];

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <Modal
      open={visible}
      onCancel={handleClose}
      footer={null}
      width={420}
      centered
      title={null}
      closable
      closeIcon={
        <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 22, lineHeight: 1, display: 'block', marginTop: 2, marginRight: 2 }}>×</span>
      }
      styles={{
        content: { padding: 0, background: '#111827', borderRadius: 20, overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,0.6)' },
        body: { padding: 0 },
      }}
    >
      <Spin spinning={loading} indicator={<LoadingOutlined spin />}>

        {/* ── Header ────────────────────────────────────────────────── */}
        <div style={{ padding: '28px 24px 20px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#374151', marginBottom: 10 }} className="font-duotone-bold">
            Checkout
          </div>
          <div style={{ fontSize: 22, color: '#f9fafb', lineHeight: 1 }} className="font-duotone-bold-extended">
            {formatDualAmount(finalTotal)}
          </div>
          <div style={{ fontSize: 13, color: '#6b7280', marginTop: 6 }} className="font-duotone-regular">
            {itemCount} {itemCount === 1 ? 'item' : 'items'}
            {voucherDiscount > 0 && (
              <span style={{ color: '#10b981', marginLeft: 8 }}>· -{formatCurrency(voucherDiscount, storageCurrency)} saved</span>
            )}
          </div>
        </div>

        <Divider />

        {/* ── Promo code ────────────────────────────────────────────── */}
        <div style={{ padding: '16px 24px' }}>
          <PromoCodeInput
            context="shop"
            amount={total}
            currency={storageCurrency}
            appliedVoucher={appliedVoucher}
            onValidCode={(voucherData) => setAppliedVoucher(voucherData)}
            onClear={() => setAppliedVoucher(null)}
            disabled={loading}
          />
        </div>

        <Divider />

        {/* ── Delivery address ──────────────────────────────────────── */}
        <div style={{ padding: '16px 24px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#374151', marginBottom: 12 }} className="font-duotone-bold">
            Delivery
          </div>
          {!editingAddress ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <EnvironmentOutlined style={{ color: hasCompleteAddress ? '#00a8c4' : '#f59e0b', fontSize: 14, flexShrink: 0 }} />
                <Text
                  style={{ fontSize: 13, color: hasCompleteAddress ? '#d1d5db' : '#f59e0b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  className="font-duotone-regular"
                >
                  {hasCompleteAddress ? formatShippingAddress() : 'Add delivery address'}
                </Text>
              </div>
              <button
                type="button"
                onClick={() => setEditingAddress(true)}
                style={{ fontSize: 12, color: '#00a8c4', background: 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', padding: 0, flexShrink: 0 }}
                className="font-duotone-bold"
              >
                {hasCompleteAddress ? 'Edit' : 'Add'}
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Input
                placeholder="Street address"
                value={deliveryAddress.address}
                onChange={(e) => setDeliveryAddress(prev => ({ ...prev, address: e.target.value }))}
                className="!bg-white/5 !border-white/10 !text-white !h-9 !rounded-lg focus-within:!border-[#00a8c4] hover:!border-[#00a8c4]/50"
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <Input
                  placeholder="City"
                  value={deliveryAddress.city}
                  onChange={(e) => setDeliveryAddress(prev => ({ ...prev, city: e.target.value }))}
                  className="!bg-white/5 !border-white/10 !text-white !h-9 !rounded-lg focus-within:!border-[#00a8c4] hover:!border-[#00a8c4]/50"
                />
                <Input
                  placeholder="ZIP"
                  value={deliveryAddress.zip_code}
                  onChange={(e) => setDeliveryAddress(prev => ({ ...prev, zip_code: e.target.value }))}
                  className="!bg-white/5 !border-white/10 !text-white !h-9 !rounded-lg focus-within:!border-[#00a8c4] hover:!border-[#00a8c4]/50"
                />
              </div>
              <Input
                placeholder="Country"
                value={deliveryAddress.country}
                onChange={(e) => setDeliveryAddress(prev => ({ ...prev, country: e.target.value }))}
                className="!bg-white/5 !border-white/10 !text-white !h-9 !rounded-lg focus-within:!border-[#00a8c4] hover:!border-[#00a8c4]/50"
              />
              <div style={{ display: 'flex', gap: 16, justifyContent: 'flex-end', marginTop: 4 }}>
                <button
                  type="button"
                  onClick={() => setEditingAddress(false)}
                  style={{ fontSize: 13, color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!hasCompleteAddress}
                  onClick={() => setEditingAddress(false)}
                  style={{ fontSize: 13, color: hasCompleteAddress ? '#00a8c4' : '#374151', background: 'none', border: 'none', cursor: hasCompleteAddress ? 'pointer' : 'default', padding: 0 }}
                  className="font-duotone-bold"
                >
                  Save
                </button>
              </div>
            </div>
          )}
        </div>

        <Divider />

        {/* ── Payment methods ───────────────────────────────────────── */}
        <div style={{ padding: '16px 24px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#374151', marginBottom: 12 }} className="font-duotone-bold">
            Payment
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {paymentRows.map(({ key, icon, iconColor, label, sublabel, badge }) => {
              const selected = paymentMethod === key;
              return (
                <div
                  key={key}
                  onClick={() => setPaymentMethod(key)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '11px 14px', borderRadius: 10, cursor: 'pointer',
                    background: selected ? 'rgba(0,168,196,0.06)' : 'transparent',
                    border: selected ? '1px solid rgba(0,168,196,0.35)' : '1px solid rgba(255,255,255,0.07)',
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{
                    width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                    background: selected ? 'rgba(0,168,196,0.12)' : 'rgba(255,255,255,0.05)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.15s',
                  }}>
                    <span style={{ fontSize: 16, color: selected ? iconColor : '#4b5563' }}>{icon}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: '#f9fafb', fontWeight: 600 }} className="font-duotone-bold">{label}</div>
                    <div style={{ fontSize: 11, color: '#6b7280', marginTop: 1 }} className="font-duotone-regular">{sublabel}</div>
                  </div>
                  {badge && <div style={{ flexShrink: 0 }}>{badge}</div>}
                  {selected && !badge && <CheckOutlined style={{ color: '#00a8c4', fontSize: 13, flexShrink: 0 }} />}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Deposit detail panel ──────────────────────────────────── */}
        {isDeposit && (
          <div style={{ margin: '0 24px 8px', padding: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.07)' }}>

            {/* Breakdown */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Pay now</div>
                <div style={{ fontSize: 18, color: '#f9fafb', fontWeight: 700 }} className="font-duotone-bold">{formatDualAmount(depositAmount)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Due on delivery</div>
                <div style={{ fontSize: 18, color: '#f9fafb', fontWeight: 700 }} className="font-duotone-bold">{formatDualAmount(remainingAmount)}</div>
              </div>
            </div>

            {/* Sub-method selector */}
            <div style={{ fontSize: 11, color: '#374151', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Pay deposit via</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {[
                { key: 'credit_card', icon: <CreditCardOutlined />, label: 'Card' },
                { key: 'bank_transfer', icon: <BankOutlined />, label: 'Bank Transfer' },
              ].map(({ key, icon, label }) => {
                const active = depositMethod === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setDepositMethod(key)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      padding: '9px 12px', borderRadius: 8, cursor: 'pointer', background: 'none',
                      border: active ? '1.5px solid #00a8c4' : '1.5px solid rgba(255,255,255,0.1)',
                      backgroundColor: active ? 'rgba(0,168,196,0.1)' : 'transparent',
                      transition: 'all 0.15s',
                    }}
                  >
                    <span style={{ fontSize: 14, color: active ? '#00a8c4' : '#4b5563' }}>{icon}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: active ? '#f9fafb' : '#9ca3af' }} className="font-duotone-bold">{label}</span>
                  </button>
                );
              })}
            </div>

            {/* Bank transfer details */}
            {depositMethod === 'bank_transfer' && (
              <div style={{ marginTop: 10 }}>
                <Select
                  placeholder="Select bank account..."
                  style={{ width: '100%', marginBottom: 0 }}
                  value={selectedBankAccountId}
                  onChange={setSelectedBankAccountId}
                  options={bankAccounts.map((acc) => ({
                    value: acc.id,
                    label: `${acc.bankName} (${acc.currency})${acc.iban ? ' — …' + acc.iban.slice(-4) : ''}`
                  }))}
                  className="!rounded-lg"
                />
                {selectedAccount && <BankDetailsCard account={selectedAccount} />}
                {selectedAccount && (
                  <div style={{ marginTop: 10 }}>
                    <Upload
                      onRemove={() => setFileList([])}
                      beforeUpload={(file) => {
                        const allowed = ['image/jpeg', 'image/png', 'application/pdf'];
                        if (!allowed.includes(file.type)) return Upload.LIST_IGNORE;
                        setFileList([file]);
                        return false;
                      }}
                      fileList={fileList}
                      maxCount={1}
                      accept=".jpg,.jpeg,.png,.pdf"
                    >
                      <Button
                        icon={<UploadOutlined />}
                        style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', color: '#d1d5db', borderRadius: 8 }}
                      >
                        {fileList.length > 0 ? 'Change Receipt' : 'Upload Receipt'}
                      </Button>
                    </Upload>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Hybrid wallet info ────────────────────────────────────── */}
        {showHybridInfo && (
          <div style={{
            margin: '0 24px 8px', padding: '10px 14px',
            background: 'rgba(0,168,196,0.06)', borderRadius: 8, border: '1px solid rgba(0,168,196,0.15)',
            fontSize: 12, color: '#9ca3af',
          }} className="font-duotone-regular">
            <WalletOutlined style={{ marginRight: 6, color: '#00a8c4' }} />
            <Text style={{ color: '#f9fafb', fontWeight: 600 }} className="font-duotone-bold">{formatCurrency(Math.min(walletBal, finalTotal), storageCurrency)}</Text>
            {' '}from wallet
            {cardPortion > 0 && (
              <> + <Text style={{ color: '#f9fafb', fontWeight: 600 }} className="font-duotone-bold">{formatCurrency(cardPortion, storageCurrency)}</Text> by card</>
            )}
          </div>
        )}

        {/* ── Error ─────────────────────────────────────────────────── */}
        {error && (
          <div style={{ margin: '0 24px 8px' }}>
            <Alert message={error} type="error" showIcon style={{ borderRadius: 8 }} />
          </div>
        )}

        {/* ── CTA ───────────────────────────────────────────────────── */}
        <div style={{ padding: '12px 24px 24px' }}>
          <Button
            type="primary"
            size="large"
            block
            onClick={handleCheckout}
            disabled={isButtonDisabled}
            loading={loading}
            className="font-duotone-bold"
            style={{
              height: 50, borderRadius: 12, fontSize: 15, border: 'none',
              background: isButtonDisabled ? 'rgba(255,255,255,0.06)' : '#00a8c4',
              color: isButtonDisabled ? 'rgba(255,255,255,0.25)' : '#fff',
            }}
          >
            {buttonLabel}
          </Button>
          {(!hasCompleteAddress || editingAddress) && (
            <div style={{ textAlign: 'center', marginTop: 8, fontSize: 12, color: '#f59e0b' }}>
              {editingAddress ? 'Save your address to continue' : 'Delivery address required'}
            </div>
          )}
        </div>

      </Spin>
    </Modal>
  );
};

export default CheckoutModal;
