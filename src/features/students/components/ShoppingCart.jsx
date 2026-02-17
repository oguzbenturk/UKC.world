// src/features/students/components/ShoppingCart.jsx
// Modern, mobile-friendly shopping cart drawer

import { useState } from 'react';
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

const ShoppingCart = ({ visible, onClose, userBalance, onOrderSuccess }) => {
  const { cart, removeFromCart, updateQuantity, getCartTotal, getCartCount, addToWishlist } = useCart();
  const { formatCurrency, convertCurrency, businessCurrency, userCurrency } = useCurrency();
  const [checkoutModalVisible, setCheckoutModalVisible] = useState(false);

  const storageCurrency = businessCurrency || 'EUR';
  const showDualCurrency = storageCurrency !== userCurrency && convertCurrency;

  const formatDualAmount = (amount, baseCurrency = storageCurrency) => {
    if (!showDualCurrency) return formatCurrency(amount, baseCurrency);
    const converted = convertCurrency(amount, baseCurrency, userCurrency);
    return `${formatCurrency(amount, baseCurrency)} / ${formatCurrency(converted, userCurrency)}`;
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
      className="cart-drawer"
    >
      {/* Custom Header */}
      <div style={{ 
        padding: '16px 20px', 
        borderBottom: '1px solid #f0f0f0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: '#fff',
        position: 'sticky',
        top: 0,
        zIndex: 10
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <ShoppingCartOutlined style={{ fontSize: 22, color: '#111827' }} />
          <div>
            <Title level={5} style={{ margin: 0, fontSize: 16 }}>Cart</Title>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {itemCount} {itemCount === 1 ? 'item' : 'items'}
            </Text>
          </div>
        </div>
        <Button 
          type="text" 
          icon={<CloseOutlined style={{ fontSize: 16 }} />} 
          onClick={onClose}
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
        background: '#f8f9fb',
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
              background: 'linear-gradient(135deg, #f0f2f5 0%, #e8e8e8 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 24
            }}>
              <ShoppingCartOutlined style={{ fontSize: 48, color: '#bfbfbf' }} />
            </div>
            <Title level={4} style={{ marginBottom: 8, color: '#595959', textAlign: 'center' }}>
              Your cart is empty
            </Title>
            <Text type="secondary" style={{ textAlign: 'center', maxWidth: 260, lineHeight: 1.6 }}>
              Explore our shop and find amazing gear for your next adventure!
            </Text>
            <Button 
              type="primary" 
              onClick={onClose} 
              size="large"
              style={{ 
                marginTop: 28, 
                borderRadius: 10,
                height: 44,
                paddingLeft: 32,
                paddingRight: 32,
                fontWeight: 500
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
                  background: '#fff', 
                  borderRadius: 16, 
                  padding: 14,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                  border: '1px solid #f0f0f0'
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
                    background: '#f5f5f5'
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
                        <ShoppingCartOutlined style={{ fontSize: 28, color: '#d9d9d9' }} />
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
                            color: '#8c8c8c', 
                            textTransform: 'uppercase', 
                            letterSpacing: 0.5,
                            display: 'block',
                            marginBottom: 2
                          }}>
                            {item.brand}
                          </Text>
                        )}
                        <Text 
                          strong
                          style={{ 
                            fontSize: 14, 
                            lineHeight: 1.3,
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden'
                          }}
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
                                  background: '#f5f5f5',
                                  border: '1px solid #e8e8e8'
                                }}
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
                                  background: '#f5f5f5',
                                  border: '1px solid #e8e8e8',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 4
                                }}
                              >
                                <span 
                                  style={{ 
                                    width: 10, 
                                    height: 10, 
                                    borderRadius: '50%', 
                                    background: item.selectedColor.toLowerCase(),
                                    border: '1px solid #d9d9d9',
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
                          danger
                          icon={<DeleteOutlined style={{ fontSize: 14 }} />}
                          onClick={() => removeFromCart(item.cartItemId || item.id)}
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
                    <Text strong style={{ color: '#1890ff', fontSize: 16, marginTop: 6 }}>
                      {formatDualAmount(item.price, item.currency || storageCurrency)}
                    </Text>

                    {/* Quantity Controls */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
                      <div style={{ 
                        display: 'inline-flex', 
                        alignItems: 'center', 
                        gap: 0,
                        background: '#f5f5f5',
                        borderRadius: 10,
                        padding: 3
                      }}>
                        <Button
                          type="text"
                          size="small"
                          icon={<MinusOutlined style={{ fontSize: 11 }} />}
                          onClick={() => handleQuantityChange(item.cartItemId || item.id, -1, item.quantity, item.stock_quantity)}
                          disabled={item.quantity <= 1}
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
                          fontSize: 14 
                        }}>
                          {item.quantity}
                        </span>
                        <Button
                          type="text"
                          size="small"
                          icon={<PlusOutlined style={{ fontSize: 11 }} />}
                          onClick={() => handleQuantityChange(item.cartItemId || item.id, 1, item.quantity, item.stock_quantity)}
                          disabled={item.quantity >= item.stock_quantity}
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
                          style={{ borderRadius: 8, color: '#8c8c8c', width: 32, height: 32 }}
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
          borderTop: '1px solid #f0f0f0',
          background: '#fff',
          boxShadow: '0 -4px 12px rgba(0,0,0,0.03)'
        }}>
          {/* Order Summary */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <Text type="secondary" style={{ fontSize: 13 }}>Subtotal ({itemCount} items)</Text>
              <Text strong style={{ fontSize: 14 }}>{formatDualAmount(total)}</Text>
            </div>
            
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              padding: '10px 14px',
              background: canAfford ? '#f6ffed' : '#fff2f0',
              borderRadius: 10,
              marginBottom: 10,
              border: `1px solid ${canAfford ? '#b7eb8f' : '#ffccc7'}`
            }}>
              <Space size={6}>
                <WalletOutlined style={{ color: canAfford ? '#52c41a' : '#faad14', fontSize: 16 }} />
                <Text style={{ color: canAfford ? '#389e0d' : '#d48806', fontSize: 13 }}>
                  Your Balance
                </Text>
              </Space>
              <Text strong style={{ color: canAfford ? '#389e0d' : '#d48806', fontSize: 14 }}>
                {formatDualAmount(userBalance || 0)}
              </Text>
            </div>

            {!canAfford && (
              <Tag 
                color="warning" 
                style={{ 
                  width: '100%', 
                  textAlign: 'center', 
                  padding: '8px 12px',
                  borderRadius: 8,
                  margin: 0,
                  fontSize: 13
                }}
              >
                Wallet low – other payment options available
              </Tag>
            )}
          </div>

          <Divider style={{ margin: '14px 0' }} />

          {/* Total */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <Title level={5} style={{ margin: 0, fontSize: 15 }}>Total</Title>
            <Title level={4} style={{ margin: 0, color: '#1890ff', fontSize: 20 }}>
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
            style={{
              height: 52,
              borderRadius: 12,
              fontWeight: 600,
              fontSize: 16,
              background: '#3B82F6',
              border: 'none',
              boxShadow: '0 2px 8px rgba(59, 130, 246, 0.3)'
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
            <SafetyCertificateOutlined style={{ color: '#52c41a', fontSize: 13 }} />
            <Text type="secondary" style={{ fontSize: 12 }}>
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
