// ---------------------------------------------------------------------------
// Live store-settings subscription.
//
// The singleton doc at /store_settings/default is readable by every
// caller (incl. guests) so the Shop screen can render minOrderAmount,
// deliveryFee, enabled payment methods, etc. Only an Owner may write.
// ---------------------------------------------------------------------------

import { create } from 'zustand';
import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from '@/lib/firebase';
import { paths, STORE_SETTINGS_DOC_ID } from '@/lib/firestore/paths';
import { storeSettingsConverter } from '@/lib/firestore/converters';
import { defaultBusinessHours } from '@/lib/storeHours';
import type { StoreSettings } from '@/types/database';

interface SettingsState {
  settings: StoreSettings | null;
  loading: boolean;
  error: string | null;
  unsub: Unsubscribe | null;

  subscribe: () => Unsubscribe;
  load: () => Promise<void>;
  save: (patch: Partial<StoreSettings>) => Promise<void>;
}

const defaultSettings: Omit<StoreSettings, 'id' | 'createdAt'> = {
  deliveryFee: 0,
  minOrderAmount: 0,
  isDeliveryEnabled: true,
  isPickupEnabled: true,
  isStoreOpen: true,
  businessHours: defaultBusinessHours(),
  requiredCheckoutFields: ['full_name', 'phone_number', 'address_line1', 'city'],
  paymentMethods: { cash: true, stripe: false },
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: null,
  loading: false,
  error: null,
  unsub: null,

  subscribe: () => {
    const existing = get().unsub;
    if (existing) return existing;
    set({ loading: true });
    const ref = doc(db, paths.settings()).withConverter(storeSettingsConverter);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          set({ settings: snap.data(), loading: false, error: null });
        } else {
          set({
            settings: {
              id: STORE_SETTINGS_DOC_ID,
              createdAt: new Date().toISOString(),
              ...defaultSettings,
            } as StoreSettings,
            loading: false,
          });
        }
      },
      (err) => set({ loading: false, error: err.message })
    );
    set({ unsub });
    return unsub;
  },

  load: async () => {
    set({ loading: true, error: null });
    const ref = doc(db, paths.settings()).withConverter(storeSettingsConverter);
    const snap = await getDoc(ref);
    set({
      loading: false,
      settings: snap.exists()
        ? snap.data()
        : ({
            id: STORE_SETTINGS_DOC_ID,
            createdAt: new Date().toISOString(),
            ...defaultSettings,
          } as StoreSettings),
    });
  },

  save: async (patch) => {
    const current = get().settings;
    if (!current) throw new Error('Settings not loaded yet.');

    set({ loading: true, error: null });
    try {
      const payload: Record<string, any> = {
        deliveryFee: patch.deliveryFee ?? current.deliveryFee,
        minOrderAmount: patch.minOrderAmount ?? current.minOrderAmount,
        isDeliveryEnabled: patch.isDeliveryEnabled ?? current.isDeliveryEnabled,
        isPickupEnabled: patch.isPickupEnabled ?? current.isPickupEnabled,
        isStoreOpen: patch.isStoreOpen ?? current.isStoreOpen,
        businessHours: patch.businessHours ?? current.businessHours,
        requiredCheckoutFields:
          patch.requiredCheckoutFields ?? current.requiredCheckoutFields,
        paymentMethods: patch.paymentMethods ?? current.paymentMethods,
        updatedAt: serverTimestamp(),
      };

      const ref = doc(db, paths.settings());
      const snap = await getDoc(ref);
      if (snap.exists()) {
        await updateDoc(ref, payload);
      } else {
        payload.createdAt = serverTimestamp();
        await setDoc(ref, payload);
      }
    } catch (err: any) {
      set({ loading: false, error: err?.message ?? 'Unknown error' });
      throw err;
    }
    set({ loading: false });
  },
}));
