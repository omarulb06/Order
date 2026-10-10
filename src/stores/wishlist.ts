// ---------------------------------------------------------------------------
// Wishlist (favorites) store.
//
//   * Guests: product ids persist locally in AsyncStorage.
//   * Signed-in users: ids also mirror to /profiles/{uid}/wishlist/{productId}
//     so the list follows them across devices. On login we merge
//     (union) remote + local and push the result back up.
//
// The Firestore mirror is best-effort: failures never block the local UX.
// ---------------------------------------------------------------------------

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';

import { db } from '@/lib/firebase';
import { paths } from '@/lib/firestore/paths';

interface WishlistState {
  ids: string[];
  isFav: (productId: string) => boolean;
  toggle: (productId: string) => void;
  /** Merge local ids with the caller's remote subcollection (on login). */
  syncFromRemote: (uid: string) => Promise<void>;
  /** Clear local state (on sign-out; remote copy is left intact). */
  clearLocal: () => void;
}

const wishlistCol = (uid: string) =>
  collection(db, `${paths.profile(uid)}/wishlist`);

export const useWishlistStore = create<WishlistState>()(
  persist(
    (set, get) => ({
      ids: [],

      isFav: (productId) => get().ids.includes(productId),

      toggle: (productId) => {
        const has = get().ids.includes(productId);
        set({ ids: has ? get().ids.filter((x) => x !== productId) : [...get().ids, productId] });

        // Best-effort remote mirror when signed in.
        const uid = currentUid();
        if (uid) {
          const ref = doc(wishlistCol(uid), productId);
          (has
            ? deleteDoc(ref)
            : setDoc(ref, { productId, addedAt: serverTimestamp() })
          ).catch(() => {});
        }
      },

      syncFromRemote: async (uid) => {
        try {
          const snap = await getDocs(wishlistCol(uid));
          const remote = snap.docs.map((d) => d.id);
          const merged = mergeWishlistIds(get().ids, remote);
          set({ ids: merged });
          // Push any local-only ids up so both stores converge.
          const remoteSet = new Set(remote);
          await Promise.all(
            merged
              .filter((id) => !remoteSet.has(id))
              .map((id) =>
                setDoc(doc(wishlistCol(uid), id), {
                  productId: id,
                  addedAt: serverTimestamp(),
                }).catch(() => {})
              )
          );
        } catch {
          // Offline or rules hiccup — keep the local list.
        }
      },

      clearLocal: () => set({ ids: [] }),
    }),
    {
      name: 'order:wishlist',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ ids: s.ids }),
    }
  )
);

/** Union of two id lists, preserving first-seen order. */
export function mergeWishlistIds(local: string[], remote: string[]): string[] {
  return [...new Set([...remote, ...local])];
}

// Late-bound to avoid a circular import with the auth store at module load.
let uidProvider: (() => string | null) | null = null;
export function bindWishlistAuth(provider: () => string | null): void {
  uidProvider = provider;
}
function currentUid(): string | null {
  try {
    return uidProvider?.() ?? null;
  } catch {
    return null;
  }
}
