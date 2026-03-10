// src/features/students/components/CheckoutModal.jsx
// Checkout modal with wallet/credit card payment options + delivery address confirmation

import { useState, useEffect } from 'react';
import { Modal, Button, Typography, Radio, Tag, Alert, Spin, Result, Input } from 'antd';
import {
  WalletOutlined,
  CreditCardOutlined,
  CheckCircleOutlined,
  ShoppingCartOutlined,
  SafetyCertificateOutlined,
  LoadingOutlined,
  EnvironmentOutlined
} from '@ant-design/icons';
import { useCart } from '@/shared/contexts/CartContext';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { useAuth } from '@/shared/hooks/useAuth';
import apiClient from '@/shared/services/apiClient';
import PromoCodeInput from '@/shared/components/PromoCodeInput';

const { Text } = Typography;

const CheckoutModal = ({ visible, onClose, userBalance, onSuccess }) => {
  const { cart, getCartTotal, getCartCount, clearCart } = useCart();
  const { formatCurrency, convertCurrency, businessCurrency, userCurrency } = useCurrency();
  const { user } = useAuth();
  
  const [paymentMethod, setPaymentMethod] = useState('wallet');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [orderDetails, setOrderDetails] = useState(null);
  const [appliedVoucher, setAppliedVoucher] = useState(null);

  // Delivery address state
  const [editingAddress, setEditingAddress] = useState(false);
  const [deliveryAddress, setDeliveryAddress] = useState({
    address: '',
    city: '',
    country: '',
    zip_code: '',
  });

  // Pre-fill address from user profile when modal opens
  useEffect(() => {
    if (visible && user) {
      const addr = {
        address: user.address || '',
        city: user.city || '',
        country: user.country || '',
        zip_code: user.zip_code || '',
      };
      setDeliveryAddress(addr);
      // Auto-open editing if no address on file
      setEditingAddress(!addr.address && !addr.city);
    }
  }, [visible, user]);

  const hasCompleteAddress = deliveryAddress.address && deliveryAddress.city && deliveryAddress.country && deliveryAddress.zip_code;

  const formatShippingAddress = () => {
    const parts = [deliveryAddress.address, deliveryAddress.city, deliveryAddress.zip_code, deliveryAddress.country].filter(Boolean);
    return parts.join(', ');
  };

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

  // Calculate discount from applied voucher
  const voucherDiscount = appliedVoucher?.discount?.discountAmount || 0;
  const finalTotal = Math.max(0, total - voucherDiscount);
  const canAffordWallet = userBalance >= finalTotal;
  const amountNeeded = finalTotal - (userBalance || 0);
  const canUseHybridWallet = !canAffordWallet && (userBalance || 0) > 0;

  const handleCheckout = async () => {
    if (!hasCompleteAddress) {
      setError('Please provide a complete delivery address before checking out');
      return;
    }

    if (paymentMethod === 'wallet' && !canAffordWallet && !canUseHybridWallet) {
      setError('Insufficient wallet balance');
      return;
    }

    // Determine effective payment method
    const effectiveMethod = (paymentMethod === 'wallet' && !canAffordWallet && canUseHybridWallet)
      ? 'wallet_hybrid'
      : paymentMethod;

    const creditCardHasWallet = effectiveMethod === 'credit_card' && (userBalance || 0) > 0;
    const cardOnlyAmount = creditCardHasWallet ? Math.max(0, finalTotal - (userBalance || 0)) : finalTotal;

    const paymentLabel = effectiveMethod === 'wallet_hybrid'
      ? `Wallet (${formatCurrency(userBalance, storageCurrency)}) + Card (${formatCurrency(amountNeeded, storageCurrency)})`
      : creditCardHasWallet
      ? `Wallet (${formatCurrency(userBalance, storageCurrency)}) + Card (${formatCurrency(cardOnlyAmount, storageCurrency)})`
      : effectiveMethod === 'wallet' ? 'Wallet'
      : effectiveMethod === 'credit_card' ? 'Credit Card'
      : 'Cash at Pickup';

    Modal.confirm({
      title: 'Confirm Order',
      icon: <ShoppingCartOutlined style={{ color: '#3B82F6' }} />,
      content: (
        <div style={{ marginTop: 8 }}>
          <p><strong>{itemCount} item{itemCount !== 1 ? 's' : ''}</strong></p>
          <p style={{ fontSize: 18, fontWeight: 700, margin: '8px 0' }}>{formatCurrency(finalTotal, storageCurrency)}</p>
          <p style={{ color: '#888' }}>Delivery to: {formatShippingAddress()}</p>
          <p style={{ color: '#888' }}>Payment: {paymentLabel}</p>
          {(effectiveMethod === 'wallet_hybrid' || creditCardHasWallet) && (
            <div style={{ marginTop: 8, padding: '8px 12px', background: '#eff6ff', borderRadius: 8, border: '1px solid #bfdbfe' }}>
              <p style={{ color: '#1d4ed8', fontSize: 13, margin: 0 }}>
                Your wallet balance of <strong>{formatCurrency(Math.min(userBalance || 0, finalTotal), storageCurrency)}</strong> will be used first{cardOnlyAmount > 0 || amountNeeded > 0 ? <>, and the remaining <strong>{formatCurrency(effectiveMethod === 'wallet_hybrid' ? amountNeeded : cardOnlyAmount, storageCurrency)}</strong> will be charged from your card.</> : '.'}
              </p>
            </div>
          )}
        </div>
      ),
      okText: 'Place Order',
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
      // Prepare order items
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
        voucher_code: appliedVoucher?.code || null
      });

      // Handle Redirect (Iyzico)
      if (response.data.paymentPageUrl) {
        // Clear cart before redirect — payment is already initiated, stock is reserved
        clearCart();
        window.location.href = response.data.paymentPageUrl;
        return;
      }

      if (response.data.success) {
        setSuccess(true);
        setOrderDetails(response.data.order);
        clearCart();
        
        if (onSuccess) {
          onSuccess(response.data.order);
        }
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
    setEditingAddress(false);
    setAppliedVoucher(null);
    onClose();
  };

  // Success state
  if (success && orderDetails) {
    return (
      <Modal
        open={visible}
        onCancel={handleClose}
        footer={null}
        width={420}
        centered
        closable={false}
      >
        <Result
          status="success"
          icon={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
          title="Order Placed Successfully!"
          subTitle={
            <div>
              <Text>Order Number: <Text strong>{orderDetails.order_number}</Text></Text>
              <br />
              <Text type="secondary">Thank you for your purchase!</Text>
            </div>
          }
          extra={[
            <Button key="continue" type="primary" onClick={handleClose} size="large">
              Continue Shopping
            </Button>
          ]}
        />
      </Modal>
    );
  }

  const paymentOptionStyle = (value) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 14px',
    borderRadius: 10,
    border: paymentMethod === value ? '2px solid #3B82F6' : '1px solid #e5e7eb',
    background: paymentMethod === value ? '#eff6ff' : '#fff',
    cursor: 'pointer',
    transition: 'all 0.15s',
  });

  // Compute hybrid info text
  const walletBal = userBalance || 0;
  const cardPortion = Math.max(0, finalTotal - walletBal);
  const showHybridInfo = (paymentMethod === 'credit_card' && walletBal > 0) ||
    (paymentMethod === 'wallet' && !canAffordWallet && canUseHybridWallet);

  return (
    <Modal
      open={visible}
      onCancel={handleClose}
      footer={null}
      width={400}
      centered
      title={null}
      closable
      styles={{ body: { padding: '20px 24px 16px' } }}
    >
      <Spin spinning={loading} indicator={<LoadingOutlined spin />} tip="Processing...">
        {/* Header with total */}
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <ShoppingCartOutlined style={{ fontSize: 28, color: '#3B82F6', marginBottom: 4 }} />
          <div style={{ fontSize: 28, fontWeight: 700, color: '#111', lineHeight: 1.2 }}>
            {formatDualAmount(finalTotal)}
          </div>
          <Text type="secondary" style={{ fontSize: 13 }}>
            {itemCount} {itemCount === 1 ? 'item' : 'items'}
            {voucherDiscount > 0 && (
              <span style={{ color: '#52c41a', marginLeft: 6 }}>
                (-{formatCurrency(voucherDiscount, storageCurrency)} promo)
              </span>
            )}
          </Text>
        </div>

        {/* Promo Code - compact */}
        <div style={{ marginBottom: 12 }}>
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

        {/* Delivery Address - inline */}
        <div style={{
          background: '#f9fafb',
          borderRadius: 10,
          padding: '10px 14px',
          marginBottom: 12,
          border: '1px solid #f0f0f0',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
              <EnvironmentOutlined style={{ color: '#6b7280', flexShrink: 0 }} />
              {editingAddress ? (
                <Text type="secondary" style={{ fontSize: 12 }}>Edit address</Text>
              ) : hasCompleteAddress ? (
                <Text style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {formatShippingAddress()}
                </Text>
              ) : (
                <Text type="warning" style={{ fontSize: 13 }}>Add delivery address</Text>
              )}
            </div>
            <Button
              type="link"
              size="small"
              style={{ padding: 0, height: 'auto', fontSize: 12 }}
              onClick={() => setEditingAddress(!editingAddress)}
            >
              {editingAddress ? 'Cancel' : hasCompleteAddress ? 'Edit' : 'Add'}
            </Button>
          </div>

          {editingAddress && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
              <Input
                placeholder="Street address"
                value={deliveryAddress.address}
                onChange={(e) => setDeliveryAddress(prev => ({ ...prev, address: e.target.value }))}
                size="small"
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <Input
                  placeholder="City"
                  value={deliveryAddress.city}
                  onChange={(e) => setDeliveryAddress(prev => ({ ...prev, city: e.target.value }))}
                  size="small"
                />
                <Input
                  placeholder="ZIP"
                  value={deliveryAddress.zip_code}
                  onChange={(e) => setDeliveryAddress(prev => ({ ...prev, zip_code: e.target.value }))}
                  size="small"
                />
              </div>
              <Input
                placeholder="Country"
                value={deliveryAddress.country}
                onChange={(e) => setDeliveryAddress(prev => ({ ...prev, country: e.target.value }))}
                size="small"
              />
              <Button
                type="primary"
                size="small"
                disabled={!hasCompleteAddress}
                onClick={() => setEditingAddress(false)}
                style={{ alignSelf: 'flex-end' }}
              >
                Confirm
              </Button>
            </div>
          )}
        </div>

        {/* Payment Methods - compact cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          <div style={paymentOptionStyle('wallet')} onClick={() => setPaymentMethod('wallet')}>
            <Radio checked={paymentMethod === 'wallet'} style={{ margin: 0 }} />
            <WalletOutlined style={{ fontSize: 18, color: canAffordWallet ? '#52c41a' : '#f59e0b' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <Text strong style={{ fontSize: 13 }}>Wallet</Text>
              <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>
                Balance: {formatDualAmount(walletBal)}
              </Text>
            </div>
            {canAffordWallet ? (
              <Tag color="success" style={{ margin: 0, fontSize: 11 }}>Full</Tag>
            ) : walletBal > 0 ? (
              <Tag color="warning" style={{ margin: 0, fontSize: 11 }}>Partial</Tag>
            ) : (
              <Tag style={{ margin: 0, fontSize: 11 }}>Empty</Tag>
            )}
          </div>

          <div style={paymentOptionStyle('credit_card')} onClick={() => setPaymentMethod('credit_card')}>
            <Radio checked={paymentMethod === 'credit_card'} style={{ margin: 0 }} />
            <CreditCardOutlined style={{ fontSize: 18, color: '#3B82F6' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <Text strong style={{ fontSize: 13 }}>Card</Text>
              <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>
                {walletBal > 0 ? 'Wallet balance used first' : 'Secure payment via Iyzico'}
              </Text>
            </div>
            <SafetyCertificateOutlined style={{ color: '#52c41a', fontSize: 14 }} />
          </div>
        </div>

        {/* Hybrid wallet+card info - single compact line */}
        {showHybridInfo && (
          <div style={{
            padding: '8px 12px',
            background: '#eff6ff',
            borderRadius: 8,
            border: '1px solid #bfdbfe',
            marginBottom: 12,
            fontSize: 12,
            color: '#1d4ed8',
            lineHeight: 1.5,
          }}>
            <WalletOutlined style={{ marginRight: 4 }} />
            <strong>{formatCurrency(Math.min(walletBal, finalTotal), storageCurrency)}</strong> from wallet
            {cardPortion > 0 && (
              <> + <CreditCardOutlined style={{ marginLeft: 2, marginRight: 4 }} />
              <strong>{formatCurrency(cardPortion, storageCurrency)}</strong> by card</>
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <Alert message={error} type="error" showIcon style={{ marginBottom: 12, borderRadius: 8 }} />
        )}

        {/* Checkout Button */}
        <Button
          type="primary"
          size="large"
          block
          onClick={handleCheckout}
          disabled={(paymentMethod === 'wallet' && !canAffordWallet && !canUseHybridWallet) || !hasCompleteAddress || editingAddress}
          loading={loading}
          style={{
            height: 48,
            borderRadius: 10,
            fontWeight: 600,
            fontSize: 15,
            background: (paymentMethod === 'wallet' && !canAffordWallet && !canUseHybridWallet) || !hasCompleteAddress || editingAddress ? undefined : '#3B82F6',
            border: 'none',
          }}
        >
          {paymentMethod === 'wallet' && canAffordWallet
            ? `Pay ${formatCurrency(finalTotal, storageCurrency)}`
            : paymentMethod === 'wallet' && canUseHybridWallet
            ? 'Pay with Wallet + Card'
            : paymentMethod === 'credit_card'
            ? `Pay ${formatCurrency(finalTotal, storageCurrency)}`
            : 'Place Order'
          }
        </Button>

        {(!hasCompleteAddress || editingAddress) && (
          <Text style={{ display: 'block', textAlign: 'center', marginTop: 6, fontSize: 12, color: '#faad14' }}>
            {editingAddress ? 'Please confirm your address' : 'Delivery address required'}
          </Text>
        )}
      </Spin>
    </Modal>
  );
};

export default CheckoutModal;
