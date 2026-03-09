// src/features/students/components/CheckoutModal.jsx
// Checkout modal with wallet/credit card payment options + delivery address confirmation

import { useState, useEffect } from 'react';
import { Modal, Button, Typography, Radio, Space, Divider, Tag, Alert, Spin, Result, Input } from 'antd';
import {
  WalletOutlined,
  CreditCardOutlined,
  CheckCircleOutlined,
  ShoppingCartOutlined,
  SafetyCertificateOutlined,
  LoadingOutlined,
  EnvironmentOutlined,
  EditOutlined
} from '@ant-design/icons';
import { useCart } from '@/shared/contexts/CartContext';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { useAuth } from '@/shared/hooks/useAuth';
import apiClient from '@/shared/services/apiClient';
import PromoCodeInput from '@/shared/components/PromoCodeInput';

const { Text, Title } = Typography;

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
    if (!showDualCurrency) return formatCurrency(amount, baseCurrency);
    const converted = convertCurrency(amount, baseCurrency, userCurrency);
    return `${formatCurrency(amount, baseCurrency)} / ${formatCurrency(converted, userCurrency)}`;
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

    const paymentLabel = effectiveMethod === 'wallet_hybrid'
      ? `Wallet (${formatCurrency(userBalance, storageCurrency)}) + Card (${formatCurrency(amountNeeded, storageCurrency)})`
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
          {effectiveMethod === 'wallet_hybrid' && (
            <div style={{ marginTop: 8, padding: '8px 12px', background: '#eff6ff', borderRadius: 8, border: '1px solid #bfdbfe' }}>
              <p style={{ color: '#1d4ed8', fontSize: 13, margin: 0 }}>
                Your wallet balance of <strong>{formatCurrency(userBalance, storageCurrency)}</strong> will be used, and the remaining <strong>{formatCurrency(amountNeeded, storageCurrency)}</strong> will be charged from your card.
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
            <Space direction="vertical" size={4}>
              <Text>Order Number: <Text strong>{orderDetails.order_number}</Text></Text>
              <Text type="secondary">Thank you for your purchase!</Text>
            </Space>
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

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ShoppingCartOutlined style={{ fontSize: 20 }} />
          <span>Checkout</span>
        </div>
      }
      open={visible}
      onCancel={handleClose}
      footer={null}
      width={440}
      centered
    >
      <Spin spinning={loading} indicator={<LoadingOutlined spin />} tip="Processing your order...">
        <div style={{ padding: '8px 0' }}>
          {/* Order Summary */}
          <div style={{ 
            background: '#f8f9fa', 
            borderRadius: 12, 
            padding: 16, 
            marginBottom: 20 
          }}>
            <Text type="secondary" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Order Summary
            </Text>
            <div style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text>{itemCount} {itemCount === 1 ? 'item' : 'items'}</Text>
                <Text strong>{formatDualAmount(total)}</Text>
              </div>
              {voucherDiscount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Text style={{ color: '#52c41a' }}>
                    Promo: {appliedVoucher?.code}
                  </Text>
                  <Text style={{ color: '#52c41a' }} strong>
                    -{formatCurrency(voucherDiscount, storageCurrency)}
                  </Text>
                </div>
              )}
              <Divider style={{ margin: '12px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Title level={5} style={{ margin: 0 }}>Total</Title>
                <Title level={4} style={{ margin: 0, color: '#1890ff' }}>
                  {formatDualAmount(finalTotal)}
                </Title>
              </div>
            </div>
          </div>

          {/* Promo Code */}
          <div style={{ marginBottom: 20 }}>
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

          {/* Delivery Address */}
          <div style={{ 
            background: '#f8f9fa', 
            borderRadius: 12, 
            padding: 16, 
            marginBottom: 20 
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text type="secondary" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                <EnvironmentOutlined style={{ marginRight: 6 }} />
                Delivery Address
              </Text>
              {hasCompleteAddress && !editingAddress && (
                <Button 
                  type="link" 
                  size="small" 
                  icon={<EditOutlined />}
                  onClick={() => setEditingAddress(true)}
                >
                  Edit
                </Button>
              )}
            </div>

            {editingAddress ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Input
                  placeholder="Street address"
                  value={deliveryAddress.address}
                  onChange={(e) => setDeliveryAddress(prev => ({ ...prev, address: e.target.value }))}
                  size="middle"
                />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <Input
                    placeholder="City"
                    value={deliveryAddress.city}
                    onChange={(e) => setDeliveryAddress(prev => ({ ...prev, city: e.target.value }))}
                    size="middle"
                  />
                  <Input
                    placeholder="ZIP / Postal code"
                    value={deliveryAddress.zip_code}
                    onChange={(e) => setDeliveryAddress(prev => ({ ...prev, zip_code: e.target.value }))}
                    size="middle"
                  />
                </div>
                <Input
                  placeholder="Country"
                  value={deliveryAddress.country}
                  onChange={(e) => setDeliveryAddress(prev => ({ ...prev, country: e.target.value }))}
                  size="middle"
                />
                <Button 
                  type="primary" 
                  size="small" 
                  disabled={!hasCompleteAddress}
                  onClick={() => setEditingAddress(false)}
                  style={{ alignSelf: 'flex-end', marginTop: 4 }}
                >
                  Confirm Address
                </Button>
              </div>
            ) : hasCompleteAddress ? (
              <Text style={{ fontSize: 13 }}>{formatShippingAddress()}</Text>
            ) : (
              <Alert
                message="No delivery address on file"
                description="Please add your delivery address to continue."
                type="warning"
                showIcon
                style={{ borderRadius: 8 }}
              />
            )}
          </div>

          {/* Payment Method Selection */}
          <div style={{ marginBottom: 20 }}>
            <Text strong style={{ display: 'block', marginBottom: 12 }}>
              Select Payment Method
            </Text>
            <Radio.Group 
              value={paymentMethod} 
              onChange={(e) => setPaymentMethod(e.target.value)}
              style={{ width: '100%' }}
            >
              <Space direction="vertical" style={{ width: '100%' }}>
                {/* Wallet Option */}
                <Radio 
                  value="wallet" 
                  style={{ 
                    width: '100%', 
                    padding: '14px 16px', 
                    background: paymentMethod === 'wallet' ? '#e6f7ff' : '#f5f5f5',
                    borderRadius: 10,
                    border: paymentMethod === 'wallet' ? '2px solid #1890ff' : '2px solid transparent',
                    margin: 0
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                    <Space>
                      <WalletOutlined style={{ fontSize: 20, color: canAffordWallet ? '#52c41a' : '#ff4d4f' }} />
                      <div>
                        <Text strong>Pay with Wallet</Text>
                        <br />
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          Balance: {formatDualAmount(userBalance || 0)}
                        </Text>
                      </div>
                    </Space>
                    {canAffordWallet ? (
                      <Tag color="success">Available</Tag>
                    ) : (
                      <Tag color="error">Need {formatDualAmount(amountNeeded)}</Tag>
                    )}
                  </div>
                </Radio>

                {/* Credit Card Option */}
                <Radio 
                  value="credit_card"
                  style={{ 
                    width: '100%', 
                    padding: '14px 16px', 
                    background: paymentMethod === 'credit_card' ? '#e6f7ff' : '#f5f5f5',
                    borderRadius: 10,
                    border: paymentMethod === 'credit_card' ? '2px solid #1890ff' : '2px solid transparent',
                    margin: 0
                  }}
                >
                  <Space>
                    <CreditCardOutlined style={{ fontSize: 20, color: '#1890ff' }} />
                    <div>
                      <Text strong>Credit/Debit Card</Text>
                      <br />
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        Secure payment via Iyzico
                      </Text>
                    </div>
                  </Space>
                </Radio>

                {/* Cash Option (for in-store pickup) */}
                <Radio 
                  value="cash"
                  style={{ 
                    width: '100%', 
                    padding: '14px 16px', 
                    background: paymentMethod === 'cash' ? '#e6f7ff' : '#f5f5f5',
                    borderRadius: 10,
                    border: paymentMethod === 'cash' ? '2px solid #1890ff' : '2px solid transparent',
                    margin: 0
                  }}
                >
                  <Space>
                    <ShoppingCartOutlined style={{ fontSize: 20, color: '#faad14' }} />
                    <div>
                      <Text strong>Pay at Pickup</Text>
                      <br />
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        Pay when you collect your order
                      </Text>
                    </div>
                  </Space>
                </Radio>
              </Space>
            </Radio.Group>
          </div>

          {/* Error Message */}
          {error && (
            <Alert 
              message={error} 
              type="error" 
              showIcon 
              style={{ marginBottom: 16, borderRadius: 8 }} 
            />
          )}

          {/* Wallet Insufficient Warning */}
          {paymentMethod === 'wallet' && !canAffordWallet && (
            <Alert
              message="Insufficient Balance"
              description={`You need ${formatDualAmount(amountNeeded)} more in your wallet. Please top up or choose a different payment method.`}
              type="warning"
              showIcon
              style={{ marginBottom: 16, borderRadius: 8 }}
            />
          )}

          {/* Credit Card Notice */}
          {paymentMethod === 'credit_card' && (
            <Alert
              message="Card Payment"
              description="You will be redirected to complete your payment securely. Your order will be confirmed once payment is successful."
              type="info"
              showIcon
              style={{ marginBottom: 16, borderRadius: 8 }}
            />
          )}

          {/* Cash Payment Notice */}
          {paymentMethod === 'cash' && (
            <Alert
              message="Pay at Pickup"
              description="Your order will be reserved for you. Please pay when you collect your items from our store."
              type="info"
              showIcon
              style={{ marginBottom: 16, borderRadius: 8 }}
            />
          )}

          {/* Wallet Hybrid Payment Notice */}
          {paymentMethod === 'wallet' && !canAffordWallet && canUseHybridWallet && (
            <Alert
              message="Partial Wallet Payment"
              description={`Your wallet balance (${formatCurrency(userBalance, storageCurrency)}) will be used, and the remaining ${formatCurrency(amountNeeded, storageCurrency)} will be charged from your card.`}
              type="info"
              showIcon
              style={{ marginBottom: 16, borderRadius: 8 }}
            />
          )}

          {/* Checkout Button */}
          <Button
            type="primary"
            size="large"
            block
            icon={paymentMethod === 'wallet' ? <WalletOutlined /> : <CreditCardOutlined />}
            onClick={handleCheckout}
            disabled={(paymentMethod === 'wallet' && !canAffordWallet && !canUseHybridWallet) || !hasCompleteAddress || editingAddress}
            loading={loading}
            style={{
              height: 52,
              borderRadius: 12,
              fontWeight: 600,
              fontSize: 16,
              background: '#3B82F6',
              border: 'none'
            }}
          >
            {paymentMethod === 'wallet' && canAffordWallet
              ? `Pay ${formatCurrency(finalTotal, storageCurrency)} from Wallet`
              : paymentMethod === 'wallet' && canUseHybridWallet
              ? `Pay with Wallet + Card`
              : paymentMethod === 'credit_card'
              ? `Pay ${formatCurrency(finalTotal, storageCurrency)} by Card`
              : 'Place Order'
            }
          </Button>

          {(!hasCompleteAddress || editingAddress) && (
            <Text type="warning" style={{ display: 'block', textAlign: 'center', marginTop: 8, fontSize: 13, color: '#faad14' }}>
              {editingAddress ? '⚠ Please confirm your address to continue' : '⚠ A complete delivery address is required'}
            </Text>
          )}

          {/* Security Note */}
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            gap: 8, 
            marginTop: 16 
          }}>
            <SafetyCertificateOutlined style={{ color: '#52c41a', fontSize: 14 }} />
            <Text type="secondary" style={{ fontSize: 12 }}>
              Secure checkout • SSL encrypted
            </Text>
          </div>
        </div>
      </Spin>
    </Modal>
  );
};

export default CheckoutModal;
