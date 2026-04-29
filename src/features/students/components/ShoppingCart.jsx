// src/features/students/components/ShoppingCart.jsx
// Compact, light-themed shopping cart drawer (sits below navbar)

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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
import { useAuth } from '@/shared/hooks/useAuth';
import { useAuthModal } from '@/shared/contexts/AuthModalContext';
import CheckoutModal from './CheckoutModal';

const { Text, Title } = Typography;

const NAVBAR_H = 64; // matches Navbar h-16

const ShoppingCart = ({ visible, onClose, userBalance, onOrderSuccess, onRefreshBalance }) => {
  const { t } = useTranslation(['student']);
  const { cart, removeFromCart, updateQuantity, getCartTotal, getCartCount, addToWishlist, refreshCartPrices } = useCart();
  const { formatCurrency, convertCurrency, businessCurrency, userCurrency } = useCurrency();
  const { isAuthenticated } = useAuth();
  const { openAuthModal } = useAuthModal();
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
    return `${eurFormatted} / ${formatCurrency(converted, userCurrency)}`;
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
    if (!isAuthenticated) {
      onClose();
      openAuthModal({
        title: t('student:cart.signInTitle'),
        message: t('student:cart.signInMessage'),
      });
      return;
    }
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
      width={Math.min(380, window.innerWidth)}
      styles={{
        header: { display: 'none' },
        body: { padding: 0, display: 'flex', flexDirection: 'column', height: '100%' },
        wrapper: { boxShadow: '-4px 0 16px rgba(0,0,0,0.06)' },
      }}
      rootStyle={{ top: NAVBAR_H, height: `calc(100vh - ${NAVBAR_H}px)` }}
      className="ukc-cart-drawer"
    >
      {/* Header */}
      <div style={{
        padding: '14px 18px',
        borderBottom: '1px solid #e5e7eb',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: '#fff',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ShoppingCartOutlined style={{ fontSize: 18, color: '#0ea5e9' }} />
          <div>
            <Title level={5} style={{ margin: 0, fontSize: 15, color: '#0f172a' }} className="font-duotone-bold-extended tracking-tight">{t('student:cart.title')}</Title>
            <Text style={{ fontSize: 11, color: '#94a3b8' }} className="font-duotone-regular">
              {t('student:cart.itemCount', { count: itemCount })}
            </Text>
          </div>
        </div>
        <Button
          type="text"
          icon={<CloseOutlined style={{ fontSize: 14, color: '#64748b' }} />}
          onClick={onClose}
          className="hover:!bg-slate-100"
          style={{ borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        />
      </div>

      {/* Cart Items */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '12px 14px',
        background: '#f8fafc',
        WebkitOverflowScrolling: 'touch',
      }}>
        {cart.length === 0 ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            padding: '48px 20px',
          }}>
            <div style={{
              width: 88,
              height: 88,
              borderRadius: '50%',
              background: '#f0f9ff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 18,
              border: '1px solid #e0f2fe',
            }}>
              <ShoppingCartOutlined style={{ fontSize: 36, color: '#0ea5e9' }} />
            </div>
            <Title level={5} style={{ marginBottom: 6, color: '#0f172a', textAlign: 'center' }} className="font-duotone-bold-extended">
              {t('student:cart.emptyTitle')}
            </Title>
            <Text style={{ textAlign: 'center', maxWidth: 220, lineHeight: 1.5, fontSize: 13, color: '#94a3b8' }} className="font-duotone-regular">
              {t('student:cart.emptyBody')}
            </Text>
            <Button
              onClick={onClose}
              size="middle"
              className="font-duotone-bold"
              style={{
                marginTop: 20,
                borderRadius: 8,
                height: 38,
                paddingLeft: 24,
                paddingRight: 24,
                fontWeight: 600,
                background: '#0ea5e9',
                color: '#fff',
                border: 'none',
              }}
            >
              {t('student:cart.startShopping')}
            </Button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {cart.map((item) => (
              <div
                key={item.cartItemId || item.id}
                style={{
                  background: '#fff',
                  borderRadius: 10,
                  padding: 12,
                  border: '1px solid #e2e8f0',
                }}
              >
                <div style={{ display: 'flex', gap: 10 }}>
                  {/* Product Image */}
                  <div style={{
                    width: 68,
                    height: 68,
                    borderRadius: 8,
                    overflow: 'hidden',
                    flexShrink: 0,
                    background: '#f1f5f9',
                    border: '1px solid #e2e8f0',
                  }}>
                    {item.image_url ? (
                      <Image
                        src={item.image_url}
                        alt={item.name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        preview={false}
                      />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <ShoppingCartOutlined style={{ fontSize: 22, color: '#cbd5e1' }} />
                      </div>
                    )}
                  </div>

                  {/* Product Info */}
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        {item.brand && (
                          <Text style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 1 }} className="font-duotone-regular">
                            {item.brand}
                          </Text>
                        )}
                        <Text
                          style={{
                            fontSize: 13,
                            lineHeight: 1.3,
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            color: '#0f172a',
                          }}
                          className="font-duotone-bold"
                        >
                          {item.name}
                        </Text>
                        {(item.selectedSize || item.selectedColor) && (
                          <div style={{ display: 'flex', gap: 4, marginTop: 3, flexWrap: 'wrap' }}>
                            {item.selectedSize && (
                              <Tag
                                style={{
                                  fontSize: 10,
                                  margin: 0,
                                  padding: '0 6px',
                                  borderRadius: 4,
                                  background: '#f1f5f9',
                                  border: '1px solid #e2e8f0',
                                  color: '#475569',
                                  lineHeight: '18px',
                                }}
                                className="font-duotone-regular"
                              >
                                {item.selectedSize}
                              </Tag>
                            )}
                            {item.selectedColor && (
                              <Tag
                                style={{
                                  fontSize: 10,
                                  margin: 0,
                                  padding: '0 6px',
                                  borderRadius: 4,
                                  background: '#f1f5f9',
                                  border: '1px solid #e2e8f0',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 3,
                                  color: '#475569',
                                  lineHeight: '18px',
                                }}
                                className="font-duotone-regular"
                              >
                                <span
                                  style={{
                                    width: 8,
                                    height: 8,
                                    borderRadius: '50%',
                                    background: item.selectedColor.toLowerCase(),
                                    border: '1px solid #cbd5e1',
                                    flexShrink: 0,
                                  }}
                                />
                                {item.selectedColor}
                              </Tag>
                            )}
                          </div>
                        )}
                      </div>
                      <Tooltip title={t('student:cart.removeTooltip')}>
                        <Button
                          type="text"
                          size="small"
                          icon={<DeleteOutlined style={{ fontSize: 13 }} />}
                          onClick={() => removeFromCart(item.cartItemId || item.id)}
                          className="!text-slate-400 hover:!text-red-500 hover:!bg-red-50 transition-all"
                          style={{ borderRadius: 6, flexShrink: 0, width: 28, height: 28 }}
                        />
                      </Tooltip>
                    </div>

                    {/* Price + Qty row */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                      <Text style={{ color: '#0ea5e9', fontSize: 14 }} className="font-duotone-bold">
                        {formatDualAmount(item.price, item.currency || storageCurrency)}
                      </Text>
                      <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 0,
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: 8,
                        padding: 2,
                      }}>
                        <Button
                          type="text"
                          size="small"
                          icon={<MinusOutlined style={{ fontSize: 10 }} />}
                          onClick={() => handleQuantityChange(item.cartItemId || item.id, -1, item.quantity, item.stock_quantity)}
                          disabled={item.quantity <= 1}
                          className="!text-slate-500 disabled:!text-slate-300 hover:!bg-slate-100"
                          style={{ width: 26, height: 26, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        />
                        <span style={{ minWidth: 28, textAlign: 'center', fontWeight: 600, fontSize: 13, color: '#0f172a' }} className="font-duotone-regular">
                          {item.quantity}
                        </span>
                        <Button
                          type="text"
                          size="small"
                          icon={<PlusOutlined style={{ fontSize: 10 }} />}
                          onClick={() => handleQuantityChange(item.cartItemId || item.id, 1, item.quantity, item.stock_quantity)}
                          disabled={item.quantity >= item.stock_quantity}
                          className="!text-slate-500 disabled:!text-slate-300 hover:!bg-slate-100"
                          style={{ width: 26, height: 26, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {cart.length > 0 && (
        <div style={{
          padding: '14px 18px 18px',
          borderTop: '1px solid #e5e7eb',
          background: '#fff',
        }}>
          {/* Wallet row */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '8px 12px',
            background: canAfford ? '#f0fdf4' : '#fffbeb',
            borderRadius: 8,
            marginBottom: 10,
            border: `1px solid ${canAfford ? '#bbf7d0' : '#fde68a'}`,
          }}>
            <Space size={6}>
              <WalletOutlined style={{ color: canAfford ? '#16a34a' : '#d97706', fontSize: 14 }} />
              <Text style={{ color: canAfford ? '#16a34a' : '#d97706', fontSize: 12 }} className="font-duotone-bold">
                {t('student:cart.walletLabel')}
              </Text>
            </Space>
            <Text style={{ color: canAfford ? '#16a34a' : '#d97706', fontSize: 13 }} className="font-duotone-bold">
              {formatDualAmount(userBalance || 0)}
            </Text>
          </div>

          {!canAfford && (
            <div
              style={{
                textAlign: 'center',
                padding: '6px 10px',
                borderRadius: 6,
                marginBottom: 10,
                fontSize: 11,
                background: '#fffbeb',
                color: '#b45309',
                border: '1px solid #fde68a',
              }}
              className="font-duotone-regular"
            >
              {t('student:cart.walletLow')}
            </div>
          )}

          {/* Total */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={{ fontSize: 13, color: '#64748b' }} className="font-duotone-regular">{t('student:cart.total', { count: itemCount })}</Text>
            <Title level={5} style={{ margin: 0, color: '#0f172a', fontSize: 18 }} className="font-duotone-bold">
              {formatDualAmount(total)}
            </Title>
          </div>

          {/* Checkout Button */}
          <Button
            type="primary"
            size="large"
            block
            icon={<CreditCardOutlined style={{ fontSize: 16 }} />}
            onClick={handleCheckout}
            className="!font-duotone-bold hover:!opacity-90 active:scale-[0.99] transition-all"
            style={{
              height: 44,
              borderRadius: 10,
              fontWeight: 600,
              fontSize: 14,
              background: '#0ea5e9',
              border: 'none',
              color: '#fff',
            }}
          >
            {t('student:cart.proceedToCheckout')}
          </Button>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10 }}>
            <SafetyCertificateOutlined style={{ color: '#16a34a', fontSize: 11 }} />
            <Text style={{ fontSize: 11, color: '#94a3b8' }} className="font-duotone-regular">
              {t('student:cart.secureCheckout')}
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
