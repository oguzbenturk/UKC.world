// src/features/students/components/CheckoutModal.jsx
// Checkout modal with wallet/credit card payment options

import { useState } from 'react';
import { Modal, Button, Typography, Radio, Space, Divider, Tag, Alert, Spin, Result } from 'antd';
import {
  WalletOutlined,
  CreditCardOutlined,
  CheckCircleOutlined,
  ShoppingCartOutlined,
  SafetyCertificateOutlined,
  LoadingOutlined
} from '@ant-design/icons';
import { useCart } from '@/shared/contexts/CartContext';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import apiClient from '@/shared/services/apiClient';

const { Text, Title } = Typography;

const CheckoutModal = ({ visible, onClose, userBalance, onSuccess }) => {
  const { cart, getCartTotal, getCartCount, clearCart } = useCart();
  const { formatCurrency, convertCurrency, businessCurrency, userCurrency } = useCurrency();
  
  const [paymentMethod, setPaymentMethod] = useState('wallet');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [orderDetails, setOrderDetails] = useState(null);

  const storageCurrency = businessCurrency || 'EUR';
  const showDualCurrency = storageCurrency !== userCurrency && convertCurrency;

  const formatDualAmount = (amount, baseCurrency = storageCurrency) => {
    if (!showDualCurrency) return formatCurrency(amount, baseCurrency);
    const converted = convertCurrency(amount, baseCurrency, userCurrency);
    return `${formatCurrency(amount, baseCurrency)} / ${formatCurrency(converted, userCurrency)}`;
  };

  const total = getCartTotal();
  const itemCount = getCartCount();
  const canAffordWallet = userBalance >= total;
  const amountNeeded = total - (userBalance || 0);

  const handleCheckout = async () => {
    if (paymentMethod === 'wallet' && !canAffordWallet) {
      setError('Insufficient wallet balance');
      return;
    }

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
        payment_method: paymentMethod,
        use_wallet: paymentMethod === 'wallet'
      });

      // Handle Redirect (Iyzico)
      if (response.data.paymentPageUrl) {
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
              <Divider style={{ margin: '12px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Title level={5} style={{ margin: 0 }}>Total</Title>
                <Title level={4} style={{ margin: 0, color: '#1890ff' }}>
                  {formatDualAmount(total)}
                </Title>
              </div>
            </div>
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

          {/* Checkout Button */}
          <Button
            type="primary"
            size="large"
            block
            icon={paymentMethod === 'wallet' ? <WalletOutlined /> : <CreditCardOutlined />}
            onClick={handleCheckout}
            disabled={paymentMethod === 'wallet' && !canAffordWallet}
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
            {paymentMethod === 'wallet' 
              ? `Pay ${formatCurrency(total, storageCurrency)} from Wallet`
              : paymentMethod === 'credit_card'
              ? `Pay ${formatCurrency(total, storageCurrency)} by Card`
              : 'Place Order'
            }
          </Button>

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
