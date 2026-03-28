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
        className="ukc-checkout-modal"
        rootClassName="dark"
        styles={{ 
          content: { padding: 0, backgroundColor: 'transparent', boxShadow: 'none' },
          body: { padding: '24px', background: '#1a262b', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }
        }}
      >
        <Result
          status="success"
          icon={<CheckCircleOutlined style={{ color: '#10b981' }} />}
          title={<span style={{ color: '#fff' }} className="font-duotone-bold-extended">Order Placed Successfully!</span>}
          subTitle={
            <div style={{ color: '#9ca3af' }} className="font-duotone-regular mt-2">
              <Text style={{ color: '#d1d5db' }}>Order Number: <Text strong style={{ color: '#fff', marginLeft: 4 }}>{orderDetails.order_number}</Text></Text>
              <br />
              <Text style={{ color: '#9ca3af', marginTop: 8, display: 'inline-block' }}>Thank you for your purchase!</Text>
            </div>
          }
          extra={[
            <Button key="continue" type="primary" onClick={handleClose} size="large" className="font-duotone-bold !bg-[#00a8c4] border-none !text-white hover:!opacity-90">
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
    border: paymentMethod === value ? '2px solid #00a8c4' : '1px solid rgba(255,255,255,0.08)',
    background: paymentMethod === value ? 'rgba(0,168,196,0.05)' : 'rgba(255,255,255,0.03)',
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
      closeIcon={<span className="text-white/40 hover:text-white transition-colors mt-2 mr-2">×</span>}
      className="ukc-checkout-modal"
      rootClassName="dark"
      styles={{ 
        content: { padding: 0, backgroundColor: 'transparent', boxShadow: 'none' },
        body: { padding: '20px 24px 16px', background: '#1a262b', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }
      }}
    >
      <Spin spinning={loading} indicator={<LoadingOutlined spin />} tip={<span style={{color: '#00a8c4'}}>Processing...</span>}>
        {/* Header with total */}
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <ShoppingCartOutlined style={{ fontSize: 28, color: '#00a8c4', marginBottom: 4 }} />
          <div style={{ fontSize: 28, color: '#fff', lineHeight: 1.2 }} className="font-duotone-bold-extended">
            {formatDualAmount(finalTotal)}
          </div>
          <Text style={{ fontSize: 13, color: '#9ca3af' }} className="font-duotone-regular">
            {itemCount} {itemCount === 1 ? 'item' : 'items'}
            {voucherDiscount > 0 && (
              <span style={{ color: '#10b981', marginLeft: 6 }}>
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
          background: 'rgba(255,255,255,0.03)',
          borderRadius: 10,
          padding: '10px 14px',
          marginBottom: 12,
          border: '1px solid rgba(255,255,255,0.08)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
              <EnvironmentOutlined style={{ color: '#9ca3af', flexShrink: 0 }} />
              {editingAddress ? (
                <Text style={{ fontSize: 12, color: '#9ca3af' }} className="font-duotone-regular">Edit address</Text>
              ) : hasCompleteAddress ? (
                <Text style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#fff' }} className="font-duotone-regular">
                  {formatShippingAddress()}
                </Text>
              ) : (
                <Text style={{ fontSize: 13, color: '#f59e0b' }} className="font-duotone-regular">Add delivery address</Text>
              )}
            </div>
            <Button
              type="text"
              size="small"
              className="!text-[#00a8c4] hover:!bg-[#00a8c4]/10 transition-all font-duotone-bold"
              style={{ padding: '0 8px', height: 24, fontSize: 12, borderRadius: 6 }}
              onClick={() => setEditingAddress(!editingAddress)}
            >
              {editingAddress ? 'Cancel' : hasCompleteAddress ? 'Edit' : 'Add'}
            </Button>
          </div>

          {editingAddress && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
              <Input
                placeholder="Street address"
                value={deliveryAddress.address}
                onChange={(e) => setDeliveryAddress(prev => ({ ...prev, address: e.target.value }))}
                className="!bg-white/5 !border-white/10 !text-white !h-9 !rounded-lg [&_input]:!bg-transparent focus-within:!border-[#00a8c4] hover:!border-[#00a8c4]/50"
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <Input
                  placeholder="City"
                  value={deliveryAddress.city}
                  onChange={(e) => setDeliveryAddress(prev => ({ ...prev, city: e.target.value }))}
                  className="!bg-white/5 !border-white/10 !text-white !h-9 !rounded-lg [&_input]:!bg-transparent focus-within:!border-[#00a8c4] hover:!border-[#00a8c4]/50"
                />
                <Input
                  placeholder="ZIP"
                  value={deliveryAddress.zip_code}
                  onChange={(e) => setDeliveryAddress(prev => ({ ...prev, zip_code: e.target.value }))}
                  className="!bg-white/5 !border-white/10 !text-white !h-9 !rounded-lg [&_input]:!bg-transparent focus-within:!border-[#00a8c4] hover:!border-[#00a8c4]/50"
                />
              </div>
              <Input
                placeholder="Country"
                value={deliveryAddress.country}
                onChange={(e) => setDeliveryAddress(prev => ({ ...prev, country: e.target.value }))}
                className="!bg-white/5 !border-white/10 !text-white !h-9 !rounded-lg [&_input]:!bg-transparent focus-within:!border-[#00a8c4] hover:!border-[#00a8c4]/50"
              />
              <Button
                type="primary"
                size="small"
                disabled={!hasCompleteAddress}
                onClick={() => setEditingAddress(false)}
                className="font-duotone-bold mt-1 !bg-[#00a8c4] !border-none !text-white hover:!opacity-90 disabled:!bg-white/10 disabled:!text-white/30 transition-all rounded-lg h-8"
                style={{ alignSelf: 'flex-end', width: 90 }}
              >
                Confirm
              </Button>
            </div>
          )}
        </div>

        {/* Payment Methods - compact cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          <div style={paymentOptionStyle('wallet')} onClick={() => setPaymentMethod('wallet')}>
            <div style={{
              width: 18, 
              height: 18, 
              borderRadius: '50%', 
              border: paymentMethod === 'wallet' ? '5px solid #00a8c4' : '2px solid rgba(255,255,255,0.2)',
              marginRight: 4, 
              transition: 'all 0.2s',
              flexShrink: 0
            }} />
            <WalletOutlined style={{ fontSize: 18, color: canAffordWallet ? '#10b981' : '#f59e0b' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 13, color: '#fff' }} className="font-duotone-bold">Wallet</Text>
              <Text style={{ fontSize: 11, display: 'block', color: '#9ca3af' }} className="font-duotone-regular">
                Balance: {formatDualAmount(walletBal)}
              </Text>
            </div>
            {canAffordWallet ? (
              <Tag color="success" style={{ margin: 0, fontSize: 11, background: 'rgba(16, 185, 129, 0.1)', border: 'none', color: '#10b981' }}>Full</Tag>
            ) : walletBal > 0 ? (
              <Tag color="warning" style={{ margin: 0, fontSize: 11, background: 'rgba(245, 158, 11, 0.1)', border: 'none', color: '#f59e0b' }}>Partial</Tag>
            ) : (
              <Tag style={{ margin: 0, fontSize: 11, background: 'rgba(255,255,255,0.05)', border: 'none', color: '#9ca3af' }}>Empty</Tag>
            )}
          </div>

          <div style={paymentOptionStyle('credit_card')} onClick={() => setPaymentMethod('credit_card')}>
            <div style={{
              width: 18, 
              height: 18, 
              borderRadius: '50%', 
              border: paymentMethod === 'credit_card' ? '5px solid #00a8c4' : '2px solid rgba(255,255,255,0.2)',
              marginRight: 4, 
              transition: 'all 0.2s',
              flexShrink: 0
            }} />
            <CreditCardOutlined style={{ fontSize: 18, color: '#00a8c4' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 13, color: '#fff' }} className="font-duotone-bold">Card</Text>
              <Text style={{ fontSize: 11, display: 'block', color: '#9ca3af' }} className="font-duotone-regular">
                {walletBal > 0 ? 'Wallet balance used first' : 'Secure payment via Iyzico'}
              </Text>
            </div>
            <SafetyCertificateOutlined style={{ color: '#10b981', fontSize: 14 }} />
          </div>
        </div>

        {/* Hybrid wallet+card info - single compact line */}
        {showHybridInfo && (
          <div style={{
            padding: '8px 12px',
            background: 'rgba(0,168,196,0.1)',
            borderRadius: 8,
            border: '1px solid rgba(0,168,196,0.2)',
            marginBottom: 12,
            fontSize: 12,
            color: '#00a8c4',
            lineHeight: 1.5,
          }} className="font-duotone-regular">
            <WalletOutlined style={{ marginRight: 4 }} />
            <strong className="font-duotone-bold text-white">{formatCurrency(Math.min(walletBal, finalTotal), storageCurrency)}</strong> from wallet
            {cardPortion > 0 && (
              <> + <CreditCardOutlined style={{ marginLeft: 2, marginRight: 4 }} />
              <strong className="font-duotone-bold text-white">{formatCurrency(cardPortion, storageCurrency)}</strong> by card</>
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
          className="font-duotone-bold !text-white hover:!opacity-90 active:scale-[0.99] transition-all disabled:!bg-white/5 disabled:!text-white/30"
          style={{
            height: 48,
            borderRadius: 10,
            fontSize: 15,
            background: (paymentMethod === 'wallet' && !canAffordWallet && !canUseHybridWallet) || !hasCompleteAddress || editingAddress ? undefined : '#00a8c4',
            border: 'none',
          }}
        >
          {paymentMethod === 'wallet' && canAffordWallet
            ? `Pay ${formatDualAmount(finalTotal, storageCurrency)}`
            : paymentMethod === 'wallet' && canUseHybridWallet
            ? 'Pay with Wallet + Card'
            : paymentMethod === 'credit_card'
            ? `Pay ${formatDualAmount(finalTotal, storageCurrency)}`
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
