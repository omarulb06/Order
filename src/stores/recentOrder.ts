// ---------------------------------------------------------------------------
// Session-scoped cache of the most recently placed order.
//
// Guests can no longer SELECT their own orders through the API (that
// policy allowed enumeration of every guest order; see migration
// 20260101000006_hardening.sql). To keep the confirmation screen working
// for guests, the client-side flow is:
//
//   1. checkout.tsx generates a UUID with expo-crypto before INSERT
//   2. insert runs WITHOUT relying on RETURNING data
//   3. the full Order + OrderItem[] payload (which we already have in
//      local state) is written to this store
//   4. order-confirmation.tsx reads from here first, falling back to a
//      DB fetch only if the Zustand slot is empty AND the user is
//      authenticated.
//
// AsyncStorage persists it so a guest can swipe-away the app, come back,
// and still see their last order's details within the same install.
// ---------------------------------------------------------------------------

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Order, OrderItem } from '@/types/database';

interface RecentOrderState {
  order: Order | null;
  items: OrderItem[];
  setLastOrder: (order: Order, items: OrderItem[]) => void;
  updateStatus: (orderId: string, status: Order['status']) => void;
  clear: () => void;
}

export const useRecentOrderStore = create<RecentOrderState>()(
  persist(
    (set, get) => ({
      order: null,
      items: [],
      setLastOrder: (order, items) => set({ order, items }),
      updateStatus: (orderId, status) => {
        const o = get().order;
        if (o && o.id === orderId) set({ order: { ...o, status } });
      },
      clear: () => set({ order: null, items: [] }),
    }),
    {
      name: 'order:recent',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ order: s.order, items: s.items }),
    }
  )
);
