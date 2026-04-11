import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { message } from '@/shared/utils/antdStatic';
import apiClient from '@/shared/services/apiClient';

const CartContext = createContext();

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within CartProvider');
  }
  return context;
};

export const CartProvider = ({ children }) => {
  const [cart, setCart] = useState([]);
  const [wishlist, setWishlist] = useState([]);

  // Load cart and wishlist from localStorage on mount
  useEffect(() => {
    const savedCart = localStorage.getItem('plannivo_cart');
    const savedWishlist = localStorage.getItem('plannivo_wishlist');
    
    if (savedCart) {
      try {
        setCart(JSON.parse(savedCart));
      } catch (error) {
        console.error('Failed to load cart:', error);
      }
    }
    
    if (savedWishlist) {
      try {
        setWishlist(JSON.parse(savedWishlist));
      } catch (error) {
        console.error('Failed to load wishlist:', error);
      }
    }
  }, []);

  // Save cart to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('plannivo_cart', JSON.stringify(cart));
  }, [cart]);

  // Save wishlist to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('plannivo_wishlist', JSON.stringify(wishlist));
  }, [wishlist]);

  const addToCart = (product, quantity = 1, options = {}) => {
    const { selectedSize, selectedColor, selectedVariant } = options;
    
    // Create a unique cart item ID based on product + size + color
    const cartItemId = `${product.id}-${selectedSize || 'default'}-${selectedColor || 'default'}`;
    
    setCart(prevCart => {
      const existingItem = prevCart.find(item => item.cartItemId === cartItemId);
      
      if (existingItem) {
        // Update quantity if item already in cart with same size/color
        return prevCart.map(item =>
          item.cartItemId === cartItemId
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      } else {
        // Add new item to cart with size/color info
        return [...prevCart, { 
          ...product, 
          cartItemId,
          quantity,
          selectedSize: selectedSize || null,
          selectedColor: selectedColor || null,
          selectedVariant: selectedVariant || null
        }];
      }
    });
    
    message.success(`${product.name} added to cart!`);
  };

  const removeFromCart = (cartItemId) => {
    setCart(prevCart => prevCart.filter(item => item.cartItemId !== cartItemId));
    message.success('Item removed from cart');
  };

  const updateQuantity = (cartItemId, quantity) => {
    if (quantity <= 0) {
      removeFromCart(cartItemId);
      return;
    }

    setCart(prevCart =>
      prevCart.map(item =>
        item.cartItemId === cartItemId ? { ...item, quantity } : item
      )
    );
  };

  const clearCart = () => {
    setCart([]);
    message.info('Cart cleared');
  };

  // Listen for cross-component cart clear (e.g. after successful Iyzico payment redirect)
  useEffect(() => {
    const handler = () => setCart([]);
    window.addEventListener('shop:cartClear', handler);
    return () => window.removeEventListener('shop:cartClear', handler);
  }, []);

  const addToWishlist = (product) => {
    setWishlist(prevWishlist => {
      if (prevWishlist.find(item => item.id === product.id)) {
        message.info('Already in your wishlist');
        return prevWishlist;
      }
      message.success(`${product.name} added to wishlist!`);
      return [...prevWishlist, product];
    });
  };

  const removeFromWishlist = (productId) => {
    setWishlist(prevWishlist => prevWishlist.filter(item => item.id !== productId));
    message.success('Removed from wishlist');
  };

  const isInWishlist = (productId) => {
    return wishlist.some(item => item.id === productId);
  };

  const moveWishlistToCart = (productId) => {
    const product = wishlist.find(item => item.id === productId);
    if (product) {
      addToCart(product);
      removeFromWishlist(productId);
    }
  };

  const getCartTotal = () => {
    return cart.reduce((total, item) => total + (item.price * item.quantity), 0);
  };

  const getCartCount = () => {
    return cart.reduce((count, item) => count + item.quantity, 0);
  };

  /**
   * Refresh cart prices from the backend.
   * Call when the cart drawer opens to catch any price changes since items were added.
   * Returns the number of items whose prices changed.
   */
  const refreshCartPrices = useCallback(async () => {
    if (cart.length === 0) return 0;
    
    try {
      // Get unique product IDs from cart
      const productIds = [...new Set(cart.map(item => item.id))];
      
      // Fetch current prices (use the products endpoint)
      const responses = await Promise.all(
        productIds.map(id => apiClient.get(`/products/${id}`).catch(() => null))
      );
      
      const priceMap = {};
      responses.forEach(res => {
        if (res?.data) {
          const product = res.data.product || res.data;
          if (product?.id && product?.price !== undefined) {
            priceMap[product.id] = parseFloat(product.price);
          }
        }
      });
      
      if (Object.keys(priceMap).length === 0) return 0;
      
      let changedCount = 0;
      setCart(prevCart => {
        const updatedCart = prevCart.map(item => {
          const currentPrice = priceMap[item.id];
          if (currentPrice !== undefined && Math.abs(currentPrice - item.price) > 0.001) {
            changedCount++;
            return { ...item, price: currentPrice };
          }
          return item;
        });
        return changedCount > 0 ? updatedCart : prevCart;
      });
      
      if (changedCount > 0) {
        message.info(`${changedCount} item${changedCount > 1 ? 's have' : ' has'} updated prices.`);
      }
      
      return changedCount;
    } catch (err) {
      console.error('Failed to refresh cart prices:', err);
      return 0;
    }
  }, [cart]);

  const value = useMemo(() => ({
    cart,
    wishlist,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    addToWishlist,
    removeFromWishlist,
    isInWishlist,
    moveWishlistToCart,
    getCartTotal,
    getCartCount,
    refreshCartPrices,
  }), [
    cart, wishlist,
    addToCart, removeFromCart, updateQuantity, clearCart,
    addToWishlist, removeFromWishlist, isInWishlist, moveWishlistToCart,
    getCartTotal, getCartCount, refreshCartPrices,
  ]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};
