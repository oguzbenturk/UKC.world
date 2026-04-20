import { useState, useEffect, useMemo, useCallback } from 'react';
import { Modal, Button, Typography, Alert, Spin, Result, Input, Upload, Tooltip } from 'antd';
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
        style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#0ea5e9', cursor: 'pointer', background: 'none', border: 'none', padding: 0, marginLeft: 12 }}
      >
        {copied ? (
          <><CheckOutlined style={{ color: '#16a34a' }} /><span style={{ color: '#16a34a' }}>Copied</span></>
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
    <div style={{ marginTop: 10, borderRadius: 8, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
      <div style={{ padding: '8px 12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 6 }}>
        <BankOutlined style={{ color: '#64748b', fontSize: 12 }} />
        <Text style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 }}>Transfer To · {account.currency}</Text>
      </div>
      <div style={{ padding: '0 12px' }}>
        {fields.map(({ label, value, mono, copy }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f5f9', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ display: 'block', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, color: '#94a3b8', marginBottom: 2 }}>{label}</Text>
              <Text style={{ fontSize: 13, color: '#1e293b', wordBreak: 'break-all', fontFamily: mono ? 'monospace' : undefined }}>{value}</Text>
            </div>
            {copy && <CopyButton value={value} />}
          </div>
        ))}
      </div>
      {account.instructions && (
        <div style={{ padding: '8px 12px', background: '#fffbeb', borderTop: '1px solid #fde68a', display: 'flex', gap: 6 }}>
          <InfoCircleOutlined style={{ color: '#d97706', flexShrink: 0, marginTop: 2 }} />
          <Text style={{ fontSize: 11, color: '#92400e', lineHeight: 1.5 }}>{account.instructions}</Text>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const DEPOSIT_PERCENT = 20;

const Divider = () => (
  <div style={{ height: 1, background: '#e5e7eb', margin: '0 24px' }} />
);

const CheckoutModal = ({ visible, onClose, userBalance, onSuccess }) => {
  const { cart, getCartTotal, getCartCount, clearCart } = useCart();
  const { formatCurrency, convertCurrency, businessCurrency, userCurrency } = useCurrency();
  const { user } = useAuth();

  const [paymentMethod, setPaymentMethod] = useState('wallet');
  const [depositMethod, setDepositMethod] = useState('bank_transfer');
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

  const saveAddressToProfile = async () => {
    if (!hasCompleteAddress || !user?.id) return;
    setEditingAddress(false);
    try {
      await apiClient.put(`/users/${user.id}`, {
        address: deliveryAddress.address,
        city: deliveryAddress.city,
        country: deliveryAddress.country,
        zip_code: deliveryAddress.zip_code,
      });
    } catch {
      // address still used locally for this order even if save fails
    }
  };

  const { data: bankAccounts = [] } = useQuery({
    queryKey: ['checkout', 'bank-accounts'],
    queryFn: async () => {
      const res = await apiClient.get('/wallet/bank-accounts');
      return res.data?.results || [];
    },
    enabled: visible && (paymentMethod === 'deposit' || paymentMethod === 'bank_transfer'),
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

    if (paymentMethod === 'bank_transfer' && (!selectedBankAccountId || fileList.length === 0)) {
      setError('Please select a bank account and upload your payment receipt');
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
          : effectiveMethod === 'bank_transfer' ? 'Bank Transfer (pending approval)'
          : 'Cash at Pickup';

    Modal.confirm({
      title: isDeposit ? 'Confirm Deposit Order' : 'Confirm Order',
      icon: <ShoppingCartOutlined style={{ color: '#0ea5e9' }} />,
      content: (
        <div style={{ marginTop: 8 }}>
          <p><strong>{itemCount} item{itemCount !== 1 ? 's' : ''}</strong></p>
          {isDeposit ? (
            <div style={{ margin: '8px 0' }}>
              <p style={{ fontSize: 16, fontWeight: 700, color: '#0ea5e9' }}>
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
      const needsReceipt = (isDeposit && depositMethod === 'bank_transfer') || method === 'bank_transfer';
      if (needsReceipt) {
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
        ...((isDeposit && depositMethod === 'bank_transfer') || method === 'bank_transfer' ? {
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
    setDepositMethod('bank_transfer');
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
          content: { padding: 0, background: '#fff', borderRadius: 16, overflow: 'hidden' },
          body: { padding: '36px 28px' },
        }}
      >
        <Result
          status="success"
          icon={<CheckCircleOutlined style={{ color: '#16a34a' }} />}
          title={
            <span style={{ color: '#0f172a' }} className="font-duotone-bold-extended">
              {isPendingApproval ? 'Order Submitted!' : 'Order Placed!'}
            </span>
          }
          subTitle={
            <div style={{ marginTop: 8 }}>
              <Text style={{ color: '#64748b' }}>
                Order <Text strong style={{ color: '#0f172a' }}>{orderDetails.order_number}</Text>
              </Text>
              <br />
              <Text style={{ color: isPendingApproval ? '#d97706' : '#64748b', marginTop: 8, display: 'inline-block' }}>
                {isPendingApproval
                  ? 'Pending admin approval — you\'ll be notified once confirmed.'
                  : 'Thank you for your purchase!'}
              </Text>
            </div>
          }
          extra={[
            <Button key="continue" type="primary" onClick={handleClose} size="large"
              className="font-duotone-bold"
              style={{ background: '#0ea5e9', border: 'none', color: '#fff', borderRadius: 10 }}>
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
  const isBankTransferDirectDisabled = paymentMethod === 'bank_transfer' && (!selectedBankAccountId || fileList.length === 0);
  const isButtonDisabled = (paymentMethod === 'wallet' && !canAffordWallet && !canUseHybridWallet) || !hasCompleteAddress || editingAddress || isBankTransferDepositDisabled || isBankTransferDirectDisabled;

  const buttonLabel = isDeposit
    ? `Pay Deposit ${formatDualAmount(depositAmount)}`
    : paymentMethod === 'bank_transfer'
      ? `Submit Order · ${formatDualAmount(finalTotal)}`
      : paymentMethod === 'wallet' && canUseHybridWallet
        ? 'Pay with Wallet + Card'
        : `Pay ${formatDualAmount(finalTotal)}`;

  const paymentRows = [
    {
      key: 'wallet',
      icon: <WalletOutlined />,
      iconColor: canAffordWallet ? '#16a34a' : walletBal > 0 ? '#d97706' : '#94a3b8',
      label: 'Wallet',
      sublabel: `Balance: ${formatDualAmount(walletBal)}`,
      badge: canAffordWallet
        ? <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 600 }}>Full</span>
        : walletBal > 0
          ? <span style={{ fontSize: 11, color: '#d97706', fontWeight: 600 }}>Partial</span>
          : <span style={{ fontSize: 11, color: '#94a3b8' }}>Empty</span>,
    },
    {
      key: 'bank_transfer',
      icon: <BankOutlined />,
      iconColor: '#0ea5e9',
      label: 'Bank Transfer',
      sublabel: 'Transfer & upload receipt · admin approval',
      badge: null,
    },
    {
      key: 'deposit',
      icon: <SafetyCertificateOutlined />,
      iconColor: '#0ea5e9',
      label: `Deposit ${DEPOSIT_PERCENT}%`,
      sublabel: `Pay ${formatDualAmount(depositAmount)} now · rest on delivery`,
      badge: null,
    },
  ];

  // ─── Bank selector + receipt upload (shared) ────────────────────────────────

  const renderBankSelector = () => (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {bankAccounts.length === 0 && (
          <div style={{ padding: '10px 12px', borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>
            No bank accounts available
          </div>
        )}
        {bankAccounts.map((acc) => {
          const active = selectedBankAccountId === acc.id;
          return (
            <div
              key={acc.id}
              onClick={() => setSelectedBankAccountId(acc.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 12px', borderRadius: 8, cursor: 'pointer',
                background: active ? '#f0f9ff' : '#fff',
                border: active ? '1.5px solid #7dd3fc' : '1.5px solid #e2e8f0',
                transition: 'all 0.15s',
              }}
            >
              <BankOutlined style={{ fontSize: 14, color: active ? '#0ea5e9' : '#94a3b8', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: '#0f172a', fontWeight: 500 }} className="font-duotone-bold">{acc.bankName}</div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }} className="font-duotone-regular">
                  {acc.currency}{acc.iban ? ` · …${acc.iban.slice(-4)}` : ''}
                </div>
              </div>
              {active && <CheckOutlined style={{ color: '#0ea5e9', fontSize: 13, flexShrink: 0 }} />}
            </div>
          );
        })}
      </div>
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
              style={{ width: '100%', background: '#f8fafc', border: '1px solid #e2e8f0', color: '#475569', borderRadius: 8 }}
            >
              {fileList.length > 0 ? 'Change Receipt' : 'Upload Receipt'}
            </Button>
          </Upload>
        </div>
      )}
    </>
  );

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
        <span style={{ color: '#94a3b8', fontSize: 20, lineHeight: 1, display: 'block', marginTop: 2, marginRight: 2 }}>×</span>
      }
      styles={{
        content: { padding: 0, background: '#fff', borderRadius: 16, boxShadow: '0 24px 64px rgba(0,0,0,0.12)' },
        body: { padding: 0, maxHeight: '80vh', overflowY: 'auto' },
      }}
    >
      <Spin spinning={loading} indicator={<LoadingOutlined spin />}>

        {/* ── Header ────────────────────────────────────────────────── */}
        <div style={{ padding: '24px 24px 18px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 8 }} className="font-duotone-bold">
            Checkout
          </div>
          <div style={{ fontSize: 22, color: '#0f172a', lineHeight: 1 }} className="font-duotone-bold-extended">
            {formatDualAmount(finalTotal)}
          </div>
          <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 6 }} className="font-duotone-regular">
            {itemCount} {itemCount === 1 ? 'item' : 'items'}
            {voucherDiscount > 0 && (
              <span style={{ color: '#16a34a', marginLeft: 8 }}>· -{formatCurrency(voucherDiscount, storageCurrency)} saved</span>
            )}
          </div>
        </div>

        {/* ── Items ──────────────────────────────────────────────── */}
        <div style={{ padding: '0 24px 14px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {cart.map((item) => (
              <div key={item.cartItemId || item.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 8, overflow: 'hidden', flexShrink: 0,
                  background: '#f1f5f9', border: '1px solid #e2e8f0',
                }}>
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <ShoppingCartOutlined style={{ fontSize: 16, color: '#cbd5e1' }} />
                    </div>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: '#0f172a', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} className="font-duotone-bold">
                    {item.name}
                  </div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }} className="font-duotone-regular">
                    {item.quantity > 1 ? `${item.quantity} × ` : ''}{formatCurrency(item.price, item.currency || storageCurrency)}
                    {item.selectedSize && <span style={{ marginLeft: 6, padding: '0 5px', background: '#f1f5f9', borderRadius: 3, fontSize: 10, color: '#475569' }}>{item.selectedSize}</span>}
                    {item.selectedColor && <span style={{ marginLeft: 4, padding: '0 5px', background: '#f1f5f9', borderRadius: 3, fontSize: 10, color: '#475569' }}>{item.selectedColor}</span>}
                  </div>
                </div>
                <div style={{ fontSize: 13, color: '#0f172a', fontWeight: 600, flexShrink: 0 }} className="font-duotone-bold">
                  {formatCurrency(item.price * item.quantity, item.currency || storageCurrency)}
                </div>
              </div>
            ))}
          </div>
        </div>

        <Divider />

        {/* ── Promo code ────────────────────────────────────────────── */}
        <div style={{ padding: '14px 24px' }}>
          <PromoCodeInput
            context="shop"
            amount={total}
            currency={storageCurrency}
            appliedVoucher={appliedVoucher}
            onValidCode={(voucherData) => setAppliedVoucher(voucherData)}
            onClear={() => setAppliedVoucher(null)}
            disabled={loading}
            variant="light"
          />
        </div>

        <Divider />

        {/* ── Delivery address ──────────────────────────────────────── */}
        <div style={{ padding: '14px 24px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 10 }} className="font-duotone-bold">
            Delivery
          </div>
          {!editingAddress ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <EnvironmentOutlined style={{ color: hasCompleteAddress ? '#0ea5e9' : '#d97706', fontSize: 14, flexShrink: 0 }} />
                <Text
                  style={{ fontSize: 13, color: hasCompleteAddress ? '#334155' : '#d97706', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  className="font-duotone-regular"
                >
                  {hasCompleteAddress ? formatShippingAddress() : 'Add delivery address'}
                </Text>
              </div>
              <button
                type="button"
                onClick={() => setEditingAddress(true)}
                style={{ fontSize: 12, color: '#0ea5e9', background: 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', padding: 0, flexShrink: 0 }}
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
                className="!h-9 !rounded-lg !border-slate-200 focus-within:!border-sky-400 hover:!border-sky-300"
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <Input
                  placeholder="City"
                  value={deliveryAddress.city}
                  onChange={(e) => setDeliveryAddress(prev => ({ ...prev, city: e.target.value }))}
                  className="!h-9 !rounded-lg !border-slate-200 focus-within:!border-sky-400 hover:!border-sky-300"
                />
                <Input
                  placeholder="ZIP"
                  value={deliveryAddress.zip_code}
                  onChange={(e) => setDeliveryAddress(prev => ({ ...prev, zip_code: e.target.value }))}
                  className="!h-9 !rounded-lg !border-slate-200 focus-within:!border-sky-400 hover:!border-sky-300"
                />
              </div>
              <Input
                placeholder="Country"
                value={deliveryAddress.country}
                onChange={(e) => setDeliveryAddress(prev => ({ ...prev, country: e.target.value }))}
                className="!h-9 !rounded-lg !border-slate-200 focus-within:!border-sky-400 hover:!border-sky-300"
              />
              <div style={{ display: 'flex', gap: 16, justifyContent: 'flex-end', marginTop: 4 }}>
                <button
                  type="button"
                  onClick={() => setEditingAddress(false)}
                  style={{ fontSize: 13, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!hasCompleteAddress}
                  onClick={saveAddressToProfile}
                  style={{ fontSize: 13, color: hasCompleteAddress ? '#0ea5e9' : '#cbd5e1', background: 'none', border: 'none', cursor: hasCompleteAddress ? 'pointer' : 'default', padding: 0 }}
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
        <div style={{ padding: '14px 24px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 10 }} className="font-duotone-bold">
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
                    padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                    background: selected ? '#f0f9ff' : '#fff',
                    border: selected ? '1px solid #7dd3fc' : '1px solid #e2e8f0',
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                    background: selected ? '#e0f2fe' : '#f8fafc',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.15s',
                  }}>
                    <span style={{ fontSize: 15, color: selected ? iconColor : '#94a3b8' }}>{icon}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: '#0f172a', fontWeight: 600 }} className="font-duotone-bold">{label}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }} className="font-duotone-regular">{sublabel}</div>
                  </div>
                  {badge && <div style={{ flexShrink: 0 }}>{badge}</div>}
                  {selected && !badge && <CheckOutlined style={{ color: '#0ea5e9', fontSize: 13, flexShrink: 0 }} />}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Deposit detail panel ──────────────────────────────────── */}
        {isDeposit && (
          <div style={{ margin: '0 24px 8px', padding: '14px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>

            {/* Breakdown */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Pay now</div>
                <div style={{ fontSize: 18, color: '#0f172a', fontWeight: 700 }} className="font-duotone-bold">{formatDualAmount(depositAmount)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Due on delivery</div>
                <div style={{ fontSize: 18, color: '#0f172a', fontWeight: 700 }} className="font-duotone-bold">{formatDualAmount(remainingAmount)}</div>
              </div>
            </div>

            {/* Sub-method selector */}
            <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Pay deposit via</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 6 }}>
              {[
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
                      padding: '9px 12px', borderRadius: 8, cursor: 'pointer',
                      border: active ? '1.5px solid #0ea5e9' : '1.5px solid #e2e8f0',
                      backgroundColor: active ? '#f0f9ff' : '#fff',
                      transition: 'all 0.15s',
                    }}
                  >
                    <span style={{ fontSize: 14, color: active ? '#0ea5e9' : '#94a3b8' }}>{icon}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: active ? '#0f172a' : '#94a3b8' }} className="font-duotone-bold">{label}</span>
                  </button>
                );
              })}
            </div>

            {/* Bank transfer details (inside deposit) */}
            {depositMethod === 'bank_transfer' && (
              <div style={{ marginTop: 10 }}>
                {renderBankSelector()}
              </div>
            )}
          </div>
        )}

        {/* ── Bank transfer detail panel (direct) ────────────────────── */}
        {paymentMethod === 'bank_transfer' && (
          <div style={{ margin: '0 24px 8px', padding: '14px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8 }} className="font-duotone-regular">
              <InfoCircleOutlined style={{ marginRight: 6, color: '#d97706' }} />
              Transfer the full amount, upload your receipt — order confirms after admin approval.
            </div>
            {renderBankSelector()}
          </div>
        )}

        {/* ── Hybrid wallet info ────────────────────────────────────── */}
        {showHybridInfo && (
          <div style={{
            margin: '0 24px 8px', padding: '10px 14px',
            background: '#f0f9ff', borderRadius: 8, border: '1px solid #bae6fd',
            fontSize: 12, color: '#64748b',
          }} className="font-duotone-regular">
            <WalletOutlined style={{ marginRight: 6, color: '#0ea5e9' }} />
            <Text style={{ color: '#0f172a', fontWeight: 600 }} className="font-duotone-bold">{formatCurrency(Math.min(walletBal, finalTotal), storageCurrency)}</Text>
            {' '}from wallet
            {cardPortion > 0 && (
              <> + <Text style={{ color: '#0f172a', fontWeight: 600 }} className="font-duotone-bold">{formatCurrency(cardPortion, storageCurrency)}</Text> by card</>
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
        <div style={{ padding: '12px 24px 22px' }}>
          <Button
            type="primary"
            size="large"
            block
            onClick={handleCheckout}
            disabled={isButtonDisabled}
            loading={loading}
            className="font-duotone-bold"
            style={{
              height: 46, borderRadius: 10, fontSize: 14, border: 'none',
              background: isButtonDisabled ? '#e2e8f0' : '#0ea5e9',
              color: isButtonDisabled ? '#94a3b8' : '#fff',
            }}
          >
            {buttonLabel}
          </Button>
          {(!hasCompleteAddress || editingAddress) && (
            <div style={{ textAlign: 'center', marginTop: 8, fontSize: 12, color: '#d97706' }}>
              {editingAddress ? 'Save your address to continue' : 'Delivery address required'}
            </div>
          )}
        </div>

      </Spin>
    </Modal>
  );
};

export default CheckoutModal;
