// src/features/students/components/ShoppingCart.jsx
// Modern, mobile-friendly shopping cart drawer

import { useState, useEffect } from 'react';
import { Drawer, Button, Typography, Space, Divider, Tag, Tooltip, Image } from 'antd';
import {
  ShoppingCartOutlined,
  DeleteOutlined,
  HeartOutlined,
  CreditCardOutlined,
  WalletOutlined,
  MinusOutlined,
  PlusOutlined,
  CloseOutlined,
  SafetyCertificateOutlined
} from '@ant-design/icons';
import { useCart } from '@/shared/contexts/CartContext';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import CheckoutModal from './CheckoutModal';

const { Text, Title } = Typography;

const ShoppingCart = ({ visible, onClose, userBalance, onOrderSuccess, onRefreshBalance }) => {
  const { cart, removeFromCart, updateQuantity, getCartTotal, getCartCount, addToWishlist, refreshCartPrices } = useCart();
  const { formatCurrency, convertCurrency, businessCurrency, userCurrency } = useCurrency();
  const [checkoutModalVisible, setCheckoutModalVisible] = useState(false);

  // Refresh cart prices and wallet balance from backend when drawer opens
  useEffect(() => {
    if (visible && cart.length > 0) {
      refreshCartPrices();
    }
    if (visible && onRefreshBalance) {
      onRefreshBalance();
    }
  }, [visible]); // intentionally only depend on visible

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
  const canAfford = userBalance >= total;
  const amountNeeded = total - (userBalance || 0);

  const handleMoveToWishlist = (item) => {
    addToWishlist(item);
    removeFromCart(item.cartItemId || item.id);
  };

  const handleCheckout = () => {
    setCheckoutModalVisible(true);
  };

  const handleCheckoutSuccess = (order) => {
    setCheckoutModalVisible(false);
    onClose();
    if (onOrderSuccess) {
      onOrderSuccess(order);
    }
  };

  const handleQuantityChange = (cartItemId, delta, currentQty, maxQty) => {
    const newQty = currentQty + delta;
    if (newQty >= 1 && newQty <= maxQty) {
      updateQuantity(cartItemId, newQty);
    }
  };

  return (
    <Drawer
      title={null}
      placement="right"
      onClose={onClose}
      open={visible}
      width={Math.min(400, window.innerWidth)}
      styles={{
        header: { display: 'none' },
        body: { padding: 0, display: 'flex', flexDirection: 'column', height: '100%' }
      }}
      className="ukc-cart-drawer"
      rootClassName="dark"
    >
      {/* Custom Header */}
      <div style={{ 
        padding: '16px 20px', 
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'linear-gradient(180deg, #3a4a4f 0%, #2e3f44 60%, #263840 100%)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.35), 0 2px 8px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.07), inset 0 -1px 0 rgba(0,168,196,0.15)',
        position: 'sticky',
        top: 0,
        zIndex: 10
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <ShoppingCartOutlined style={{ fontSize: 22, color: '#00a8c4' }} />
          <div>
            <Title level={5} style={{ margin: 0, fontSize: 16, color: '#fff' }} className="font-duotone-bold-extended tracking-tight">Cart</Title>
            <Text style={{ fontSize: 12, color: '#9ca3af' }} className="font-duotone-regular">
              {itemCount} {itemCount === 1 ? 'item' : 'items'}
            </Text>
          </div>
        </div>
        <Button 
          type="text" 
          icon={<CloseOutlined style={{ fontSize: 16, color: '#fff' }} />} 
          onClick={onClose}
          className="hover:!bg-white/10"
          style={{ 
            borderRadius: 8, 
            width: 36, 
            height: 36,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        />
      </div>

      {/* Cart Items */}
      <div style={{ 
        flex: 1, 
        overflowY: 'auto', 
        padding: '16px 16px',
        background: '#0d1511',
        WebkitOverflowScrolling: 'touch'
      }}>
        {cart.length === 0 ? (
          <div style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            justifyContent: 'center',
            height: '100%',
            padding: '60px 20px'
          }}>
            <div style={{
              width: 120,
              height: 120,
              borderRadius: '50%',
              background: 'rgba(0,168,196,0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 24,
              border: '1px solid rgba(0,168,196,0.2)'
            }}>
              <ShoppingCartOutlined style={{ fontSize: 48, color: '#00a8c4' }} />
            </div>
            <Title level={4} style={{ marginBottom: 8, color: '#fff', textAlign: 'center' }} className="font-duotone-bold-extended">
              Your cart is empty
            </Title>
            <Text style={{ textAlign: 'center', maxWidth: 260, lineHeight: 1.6, color: '#9ca3af' }} className="font-duotone-regular">
              Explore our shop and find amazing gear for your next adventure!
            </Text>
            <Button
              onClick={onClose}
              size="large"
              className="font-duotone-bold bg-[#00a8c4] text-white border-none shadow-lg shadow-[#00a8c4]/20 hover:!opacity-90 active:scale-[0.98] transition-all"
              style={{
                marginTop: 28,
                borderRadius: 10,
                height: 44,
                paddingLeft: 32,
                paddingRight: 32,
                fontWeight: 700
              }}
            >
              Start Shopping
            </Button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {cart.map((item) => (
              <div 
                key={item.cartItemId || item.id}
                style={{ 
                  background: 'rgba(255,255,255,0.03)', 
                  borderRadius: 16, 
                  padding: 14,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                  border: '1px solid rgba(255,255,255,0.08)'
                }}
              >
                <div style={{ display: 'flex', gap: 14 }}>
                  {/* Product Image */}
                  <div style={{ 
                    width: 85, 
                    height: 85, 
                    borderRadius: 12, 
                    overflow: 'hidden',
                    flexShrink: 0,
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.05)'
                  }}>
                    {item.image_url ? (
                      <Image
                        src={item.image_url}
                        alt={item.name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        preview={false}
                      />
                    ) : (
                      <div style={{ 
                        width: '100%', 
                        height: '100%', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center' 
                      }}>
                        <ShoppingCartOutlined style={{ fontSize: 28, color: 'rgba(255,255,255,0.2)' }} />
                      </div>
                    )}
                  </div>

                  {/* Product Info */}
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        {item.brand && (
                          <Text style={{ 
                            fontSize: 11, 
                            color: '#9ca3af', 
                            textTransform: 'uppercase', 
                            letterSpacing: 0.5,
                            display: 'block',
                            marginBottom: 2
                          }} className="font-duotone-regular">
                            {item.brand}
                          </Text>
                        )}
                        <Text 
                          style={{ 
                            fontSize: 14, 
                            lineHeight: 1.3,
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            color: '#fff'
                          }}
                          className="font-duotone-bold"
                        >
                          {item.name}
                        </Text>
                        {/* Size and Color display */}
                        {(item.selectedSize || item.selectedColor) && (
                          <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                            {item.selectedSize && (
                              <Tag 
                                style={{ 
                                  fontSize: 11, 
                                  margin: 0, 
                                  padding: '1px 8px',
                                  borderRadius: 4,
                                  background: 'rgba(255,255,255,0.05)',
                                  border: '1px solid rgba(255,255,255,0.1)',
                                  color: '#d1d5db'
                                }}
                                className="font-duotone-regular"
                              >
                                Size: {item.selectedSize}
                              </Tag>
                            )}
                            {item.selectedColor && (
                              <Tag 
                                style={{ 
                                  fontSize: 11, 
                                  margin: 0, 
                                  padding: '1px 8px',
                                  borderRadius: 4,
                                  background: 'rgba(255,255,255,0.05)',
                                  border: '1px solid rgba(255,255,255,0.1)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  color: '#d1d5db'
                                }}
                                className="font-duotone-regular"
                              >
                                <span 
                                  style={{ 
                                    width: 10, 
                                    height: 10, 
                                    borderRadius: '50%', 
                                    background: item.selectedColor.toLowerCase(),
                                    border: '1px solid rgba(255,255,255,0.2)',
                                    flexShrink: 0
                                  }} 
                                />
                                {item.selectedColor}
                              </Tag>
                            )}
                          </div>
                        )}
                      </div>
                      <Tooltip title="Remove">
                        <Button
                          type="text"
                          size="small"
                          icon={<DeleteOutlined style={{ fontSize: 14 }} />}
                          onClick={() => removeFromCart(item.cartItemId || item.id)}
                          className="!text-[#ef4444] hover:!bg-[#ef4444]/20 !opacity-80 hover:!opacity-100 transition-all"
                          style={{ 
                            borderRadius: 8, 
                            flexShrink: 0,
                            width: 32,
                            height: 32
                          }}
                        />
                      </Tooltip>
                    </div>

                    {/* Price */}
                    <Text style={{ color: '#00a8c4', fontSize: 16, marginTop: 6 }} className="font-duotone-bold">
                      {formatDualAmount(item.price, item.currency || storageCurrency)}
                    </Text>

                    {/* Quantity Controls */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
                      <div style={{ 
                        display: 'inline-flex', 
                        alignItems: 'center', 
                        gap: 0,
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.05)',
                        borderRadius: 10,
                        padding: 3
                      }}>
                        <Button
                          type="text"
                          size="small"
                          icon={<MinusOutlined style={{ fontSize: 11 }} />}
                          onClick={() => handleQuantityChange(item.cartItemId || item.id, -1, item.quantity, item.stock_quantity)}
                          disabled={item.quantity <= 1}
                          className="!text-white disabled:!text-white/20 hover:!bg-white/10"
                          style={{ 
                            width: 30, 
                            height: 30, 
                            borderRadius: 8,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        />
                        <span style={{ 
                          minWidth: 36, 
                          textAlign: 'center', 
                          fontWeight: 600,
                          fontSize: 14,
                          color: '#fff' 
                        }} className="font-duotone-regular">
                          {item.quantity}
                        </span>
                        <Button
                          type="text"
                          size="small"
                          icon={<PlusOutlined style={{ fontSize: 11 }} />}
                          onClick={() => handleQuantityChange(item.cartItemId || item.id, 1, item.quantity, item.stock_quantity)}
                          disabled={item.quantity >= item.stock_quantity}
                          className="!text-white disabled:!text-white/20 hover:!bg-white/10"
                          style={{ 
                            width: 30, 
                            height: 30, 
                            borderRadius: 8,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        />
                      </div>
                      
                      <Tooltip title="Save for later">
                        <Button
                          type="text"
                          size="small"
                          icon={<HeartOutlined style={{ fontSize: 14 }} />}
                          onClick={() => handleMoveToWishlist(item)}
                          className="!text-white/60 hover:!text-white hover:!bg-white/10 transition-all"
                          style={{ borderRadius: 8, width: 32, height: 32 }}
                        />
                      </Tooltip>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer - Only show when cart has items */}
      {cart.length > 0 && (
        <div style={{ 
          padding: '16px 20px 20px', 
          borderTop: '1px solid rgba(255,255,255,0.08)',
          background: '#1a262b',
          boxShadow: '0 -4px 12px rgba(0,0,0,0.3)',
          position: 'relative',
          zIndex: 10
        }}>
          {/* Order Summary */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <Text style={{ fontSize: 13, color: '#9ca3af' }} className="font-duotone-regular">Subtotal ({itemCount} items)</Text>
              <Text style={{ fontSize: 14, color: '#fff' }} className="font-duotone-bold">{formatDualAmount(total)}</Text>
            </div>
            
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              padding: '10px 14px',
              background: canAfford ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
              borderRadius: 10,
              marginBottom: 10,
              border: `1px solid ${canAfford ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)'}`
            }}>
              <Space size={6}>
                <WalletOutlined style={{ color: canAfford ? '#10b981' : '#f59e0b', fontSize: 16 }} />
                <Text style={{ color: canAfford ? '#10b981' : '#f59e0b', fontSize: 13 }} className="font-duotone-bold">
                  Your Balance
                </Text>
              </Space>
              <Text style={{ color: canAfford ? '#10b981' : '#f59e0b', fontSize: 14 }} className="font-duotone-bold">
                {formatDualAmount(userBalance || 0)}
              </Text>
            </div>

            {!canAfford && (
              <div 
                style={{ 
                  width: '100%', 
                  textAlign: 'center', 
                  padding: '8px 12px',
                  borderRadius: 8,
                  margin: 0,
                  fontSize: 13,
                  background: 'rgba(245, 158, 11, 0.1)',
                  color: '#fbbf24',
                  border: '1px solid rgba(245, 158, 11, 0.2)'
                }}
                className="font-duotone-regular"
              >
                Wallet low – other payment options available
              </div>
            )}
          </div>

          <Divider style={{ margin: '14px 0', borderColor: 'rgba(255,255,255,0.08)' }} />

          {/* Total */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <Title level={5} style={{ margin: 0, fontSize: 15, color: '#fff' }} className="font-duotone-bold-extended">Total</Title>
            <Title level={4} style={{ margin: 0, color: '#00a8c4', fontSize: 20 }} className="font-duotone-bold">
              {formatDualAmount(total)}
            </Title>
          </div>

          {/* Checkout Button */}
          <Button
            type="primary"
            size="large"
            block
            icon={<CreditCardOutlined style={{ fontSize: 18 }} />}
            onClick={handleCheckout}
            className="!font-duotone-bold !text-white hover:!opacity-90 active:scale-[0.99] transition-all"
            style={{
              height: 52,
              borderRadius: 12,
              fontWeight: 600,
              fontSize: 16,
              background: '#00a8c4',
              border: 'none',
              boxShadow: '0 4px 12px rgba(0, 168, 196, 0.3)'
            }}
          >
            Proceed to Checkout
          </Button>

          {/* Security Note */}
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            gap: 8, 
            marginTop: 14 
          }}>
            <SafetyCertificateOutlined style={{ color: '#10b981', fontSize: 13 }} />
            <Text style={{ fontSize: 12, color: '#9ca3af' }} className="font-duotone-regular">
              Secure checkout • Instant delivery
            </Text>
          </div>
        </div>
      )}

      {/* Checkout Modal */}
      <CheckoutModal
        visible={checkoutModalVisible}
        onClose={() => setCheckoutModalVisible(false)}
        userBalance={userBalance}
        onSuccess={handleCheckoutSuccess}
      />
    </Drawer>
  );
};

export default ShoppingCart;
