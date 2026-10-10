import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Product } from '@/types/database';

export interface CartLine {
  product: Pick<
    Product,
    'id' | 'name' | 'price' | 'imageUrl' | 'stockQuantity' | 'isAvailable'
  >;
  quantity: number;
}

interface CartState {
  lines: CartLine[];
  add: (product: CartLine['product'], quantity?: number) => void;
  remove: (productId: string) => void;
  setQuantity: (productId: string, quantity: number) => void;
  increment: (productId: string) => void;
  decrement: (productId: string) => void;
  clear: () => void;

  // derived
  itemCount: () => number;
  subtotal: () => number;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      lines: [],

      add: (product, quantity = 1) =>
        set((state) => {
          const existing = state.lines.find((l) => l.product.id === product.id);
          const cappedQty = (nextQty: number) =>
            product.stockQuantity > 0
              ? Math.min(nextQty, product.stockQuantity)
              : nextQty;
          if (existing) {
            return {
              lines: state.lines.map((l) =>
                l.product.id === product.id
                  ? { ...l, quantity: cappedQty(l.quantity + quantity) }
                  : l
              ),
            };
          }
          return {
            lines: [...state.lines, { product, quantity: cappedQty(quantity) }],
          };
        }),

      remove: (productId) =>
        set((state) => ({ lines: state.lines.filter((l) => l.product.id !== productId) })),

      setQuantity: (productId, quantity) =>
        set((state) => ({
          lines: state.lines
            .map((l) =>
              l.product.id === productId
                ? {
                    ...l,
                    quantity:
                      l.product.stockQuantity > 0
                        ? Math.min(quantity, l.product.stockQuantity)
                        : quantity,
                  }
                : l
            )
            .filter((l) => l.quantity > 0),
        })),

      increment: (productId) => {
        const line = get().lines.find((l) => l.product.id === productId);
        if (!line) return;
        get().setQuantity(productId, line.quantity + 1);
      },

      decrement: (productId) => {
        const line = get().lines.find((l) => l.product.id === productId);
        if (!line) return;
        get().setQuantity(productId, line.quantity - 1);
      },

      clear: () => set({ lines: [] }),

      itemCount: () => get().lines.reduce((n, l) => n + l.quantity, 0),

      subtotal: () =>
        get().lines.reduce((sum, l) => sum + l.quantity * (l.product.price ?? 0), 0),
    }),
    {
      name: 'order:cart',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ lines: s.lines }),
    }
  )
);
