// ---------------------------------------------------------------------------
// Firebase Auth-backed Zustand store.
//
//   * email/password sign-in for Owner & Admin accounts
//   * Google credential sign-in for Client accounts
//   * anonymous sign-in for guest checkout flow (optional)
//   * live profile subscription on /profiles/{uid}
//   * role gating helpers (isOwner, isAdmin, isStaff, isGuest)
//
// Clients CANNOT self-elevate their role — the firestore.rules file
// enforces that `role == 'client'` on profile create and `role` is
// unchanged on self-update.
// ---------------------------------------------------------------------------

import { create } from 'zustand';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInAnonymously,
  signInWithCredential,
  signInWithEmailAndPassword,
  signInWithPhoneNumber,
  signOut as firebaseSignOut,
  type ApplicationVerifier,
  type ConfirmationResult,
  type User,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore';

import { auth, db } from '@/lib/firebase';
import { paths } from '@/lib/firestore/paths';
import { profileConverter } from '@/lib/firestore/converters';
import { bindWishlistAuth, useWishlistStore } from '@/stores/wishlist';
import type { Profile, UserRole } from '@/types/database';

interface AuthState {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  initialized: boolean;

  init: () => () => void;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  signInWithGoogleIdToken: (idToken: string, accessToken?: string) => Promise<void>;
  signInAnonymously: () => Promise<void>;
  // Phone OTP (two-step):
  //  1. startPhoneSignIn(E164phone, recaptchaVerifier) → sends the SMS
  //  2. confirmPhoneOtp(code) → finalizes the sign-in
  startPhoneSignIn: (phoneE164: string, verifier: ApplicationVerifier) => Promise<void>;
  confirmPhoneOtp: (code: string) => Promise<void>;
  cancelPhoneSignIn: () => void;
  isPhoneOtpPending: () => boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateProfile: (patch: Partial<Omit<Profile, 'id' | 'role'>>) => Promise<void>;

  role: () => UserRole | 'guest';
  isGuest: () => boolean;
  isOwner: () => boolean;
  isAdmin: () => boolean;
  isStaff: () => boolean;
}

let profileUnsub: Unsubscribe | null = null;
let pendingPhoneConfirmation: ConfirmationResult | null = null;

// Let the wishlist store resolve the signed-in uid lazily (avoids a
// circular store import at module load).
bindWishlistAuth(() => useAuthStore.getState().user?.uid ?? null);

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  loading: false,
  initialized: false,

  init: () => {
    set({ loading: true });

    const authUnsub = onAuthStateChanged(auth, async (nextUser) => {
      set({ user: nextUser });

      // Tear down any previous profile listener.
      if (profileUnsub) {
        profileUnsub();
        profileUnsub = null;
      }

      if (!nextUser) {
        set({ profile: null, initialized: true, loading: false });
        useWishlistStore.getState().clearLocal();
        return;
      }

      // Ensure the profile doc exists (first-ever login for this uid).
      await ensureProfileDoc(nextUser);

      // Merge the wishlist mirror (best-effort).
      if (!nextUser.isAnonymous) {
        useWishlistStore.getState().syncFromRemote(nextUser.uid).catch(() => {});
      }

      // Subscribe for live role changes (e.g. owner promotes someone to admin).
      const ref = doc(db, paths.profile(nextUser.uid)).withConverter(profileConverter);
      profileUnsub = onSnapshot(
        ref,
        (snap) => {
          const p = snap.exists() ? snap.data() : null;
          set({ profile: p, initialized: true, loading: false });
        },
        (err) => {
          // eslint-disable-next-line no-console
          console.warn('[auth] profile subscription failed', err);
          set({ initialized: true, loading: false });
        }
      );
    });

    return () => {
      authUnsub();
      if (profileUnsub) {
        profileUnsub();
        profileUnsub = null;
      }
    };
  },

  signInWithEmail: async (email, password) => {
    set({ loading: true });
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } finally {
      set({ loading: false });
    }
  },

  signUpWithEmail: async (email, password) => {
    set({ loading: true });
    try {
      await createUserWithEmailAndPassword(auth, email, password);
    } finally {
      set({ loading: false });
    }
  },

  signInWithGoogleIdToken: async (idToken, accessToken) => {
    set({ loading: true });
    try {
      const credential = GoogleAuthProvider.credential(idToken, accessToken);
      await signInWithCredential(auth, credential);
    } finally {
      set({ loading: false });
    }
  },

  signInAnonymously: async () => {
    set({ loading: true });
    try {
      await signInAnonymously(auth);
    } finally {
      set({ loading: false });
    }
  },

  startPhoneSignIn: async (phoneE164, verifier) => {
    set({ loading: true });
    try {
      // Fire the SMS. Retain the confirmation handle so confirmPhoneOtp
      // can finish the sign-in.
      pendingPhoneConfirmation = await signInWithPhoneNumber(
        auth,
        phoneE164,
        verifier
      );
    } finally {
      set({ loading: false });
    }
  },

  confirmPhoneOtp: async (code) => {
    if (!pendingPhoneConfirmation) {
      throw new Error(
        'No phone sign-in in progress. Request a new OTP code first.'
      );
    }
    set({ loading: true });
    try {
      await pendingPhoneConfirmation.confirm(code);
      pendingPhoneConfirmation = null;
    } finally {
      set({ loading: false });
    }
  },

  cancelPhoneSignIn: () => {
    pendingPhoneConfirmation = null;
  },

  isPhoneOtpPending: () => pendingPhoneConfirmation !== null,

  signOut: async () => {
    await firebaseSignOut(auth);
    set({ user: null, profile: null });
  },

  refreshProfile: async () => {
    const u = get().user;
    if (!u) {
      set({ profile: null });
      return;
    }
    const snap = await getDoc(
      doc(db, paths.profile(u.uid)).withConverter(profileConverter)
    );
    set({ profile: snap.exists() ? snap.data() : null });
  },

  updateProfile: async (patch) => {
    const u = get().user;
    if (!u) throw new Error('Not signed in.');
    // SECURITY: never let callers touch `role` from this path — rules will
    // reject it anyway, but strip here for defense in depth.
    const safe: any = { ...patch };
    delete safe.role;
    safe.updatedAt = serverTimestamp();
    await updateDoc(doc(db, paths.profile(u.uid)), safe);
    await get().refreshProfile();
  },

  role: () => (get().profile?.role ?? (get().user ? 'client' : 'guest')) as UserRole | 'guest',
  isGuest: () => !get().user,
  isOwner: () => get().profile?.role === 'owner',
  isAdmin: () => get().profile?.role === 'admin',
  isStaff: () => {
    const r = get().profile?.role;
    return r === 'owner' || r === 'admin';
  },
}));

/**
 * First-login profile bootstrap. Idempotent — safe to call on every
 * sign-in. Enforces `role: 'client'` on the client side; firestore.rules
 * additionally rejects any other value.
 */
async function ensureProfileDoc(user: User): Promise<void> {
  const ref = doc(db, paths.profile(user.uid));
  const snap = await getDoc(ref);
  if (snap.exists()) return;

  // Firestore accepts FieldValue (serverTimestamp) for Timestamp fields —
  // the TS Profile type is normalized to ISO strings only AFTER the
  // converter reads it back, so we cast on write.
  const seed = {
    email: user.email ?? null,
    role: 'client' as const,
    fullName: user.displayName ?? null,
    phoneNumber: user.phoneNumber ?? null,
    address: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  await setDoc(ref, seed);
}
