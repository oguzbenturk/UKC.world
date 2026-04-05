import { create } from 'zustand';
import { CartItem, Product } from '../types';
import Decimal from 'decimal.js';

interface CartState {
  items: CartItem[];
  addItem: (product: Product, variantId?: number) => void;
  removeItem: (productId: number, variantId?: number) => void;
  updateQuantity: (productId: number, quantity: number, variantId?: number) => void;
  clearCart: () => void;
  getTotal: (currency: string) => string;
  itemCount: () => number;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],

  addItem: (product, variantId) =>
    set((state) => {
      const existing = state.items.find(
        (i) => i.product.id === product.id && i.variantId === variantId
      );
      if (existing) {
        return {
          items: state.items.map((i) =>
            i.product.id === product.id && i.variantId === variantId
              ? { ...i, quantity: i.quantity + 1 }
              : i
          ),
        };
      }
      return { items: [...state.items, { product, quantity: 1, variantId }] };
    }),

  removeItem: (productId, variantId) =>
    set((state) => ({
      items: state.items.filter(
        (i) => !(i.product.id === productId && i.variantId === variantId)
      ),
    })),

  updateQuantity: (productId, quantity, variantId) =>
    set((state) => ({
      items:
        quantity <= 0
          ? state.items.filter(
              (i) => !(i.product.id === productId && i.variantId === variantId)
            )
          : state.items.map((i) =>
              i.product.id === productId && i.variantId === variantId
                ? { ...i, quantity }
                : i
            ),
    })),

  clearCart: () => set({ items: [] }),

  getTotal: (_currency) => {
    const total = get().items.reduce(
      (acc, item) => acc.plus(new Decimal(item.product.price).times(item.quantity)),
      new Decimal(0)
    );
    return total.toFixed(2);
  },

  itemCount: () => get().items.reduce((acc, item) => acc + item.quantity, 0),
}));
