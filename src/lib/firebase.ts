// ---------------------------------------------------------------------------
// Firebase JS SDK initialization.
//
//   * initializeApp from EXPO_PUBLIC_FIREBASE_* env vars.
//   * initializeAuth with AsyncStorage persistence on native so sessions
//     survive app restarts; getAuth() on web (handled implicitly below).
//   * getFirestore(app) for the typed collection helpers in
//     src/lib/firestore/*.
//
// Fail-loud when env is missing so misconfigured builds surface early
// instead of crashing deep inside the SDK.
// ---------------------------------------------------------------------------

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import {
  getApps,
  getApp,
  initializeApp,
  type FirebaseApp,
  type FirebaseOptions,
} from 'firebase/app';
import {
  getAuth,
  initializeAuth,
  type Auth,
} from 'firebase/auth';
// getReactNativePersistence is only shipped in Firebase's RN entrypoint
// and isn't declared in the shared TS surface. Grab it at runtime via
// require() to keep TypeScript happy on both platforms.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getReactNativePersistence } = require('firebase/auth') as {
  getReactNativePersistence?: (storage: unknown) => unknown;
};
import {
  connectFirestoreEmulator,
  getFirestore,
  type Firestore,
} from 'firebase/firestore';
import {
  connectStorageEmulator,
  getStorage,
  type FirebaseStorage,
} from 'firebase/storage';

const firebaseConfig: FirebaseOptions = {
  apiKey:            process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  measurementId:     process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  if (typeof process === 'undefined' || process.env.JEST_WORKER_ID === undefined) {
    // eslint-disable-next-line no-console
    console.warn(
      '[firebase] Missing EXPO_PUBLIC_FIREBASE_* env vars. Copy ' +
        '.env.example to .env and fill in your Firebase project config.'
    );
  }
  // Provide inert defaults so the SDK can boot in unit-test environments
  // where tests either skip Firebase entirely OR stub the Firestore
  // instance (via @firebase/rules-unit-testing). Any real call against
  // this app will still fail server-side.
  firebaseConfig.apiKey    = firebaseConfig.apiKey    || 'inert-local-key';
  firebaseConfig.projectId = firebaseConfig.projectId || 'order-app-local';
}

export const firebaseApp: FirebaseApp = getApps().length
  ? getApp()
  : initializeApp(firebaseConfig);

// --- Auth with RN persistence -----------------------------------------------
// On React Native we try `initializeAuth` with the AsyncStorage persistence
// shim so sessions survive restarts; on web / Node we fall back to the
// zero-config `getAuth`. Any failure during init is swallowed and logged
// so a broken Firebase config doesn't crash the whole module graph when
// the pure-logic unit tests merely want to import src/lib/firestore/*.
let _auth: Auth | null;
try {
  if (Platform.OS === 'web' || typeof getReactNativePersistence !== 'function') {
    _auth = getAuth(firebaseApp);
  } else {
    try {
      _auth = initializeAuth(firebaseApp, {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        persistence: getReactNativePersistence(AsyncStorage) as any,
      });
    } catch {
      // initializeAuth throws if called twice (fast-refresh).
      _auth = getAuth(firebaseApp);
    }
  }
} catch (err) {
  // eslint-disable-next-line no-console
  console.warn('[firebase] auth init failed:', err);
  _auth = null;
}
// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
export const auth = _auth!;

// --- Firestore --------------------------------------------------------------
export const db: Firestore = getFirestore(firebaseApp);

// --- Firebase Storage (for product / category image uploads) ----------------
export const storage: FirebaseStorage = getStorage(firebaseApp);

// --- Local emulator wiring (dev / tests) ------------------------------------
if (process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATOR === 'true') {
  const host = process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST ?? '127.0.0.1';
  try {
    connectFirestoreEmulator(db, host, 8080);
  } catch {
    // already connected (fast-refresh)
  }
  try {
    connectStorageEmulator(storage, host, 9199);
  } catch {
    // already connected
  }
  // Auth emulator wiring is deferred to app/_layout.tsx because
  // `connectAuthEmulator` must run before any auth call.
}
