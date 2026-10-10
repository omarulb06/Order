// ---------------------------------------------------------------------------
// Firebase emulator test harness.
//
// All integration suites import `maybeTestEnv()` and gracefully skip when
// the Firestore / Auth emulators are not running. Boot them manually with:
//
//   npm run emulators
//   FIREBASE_EMULATOR_RUNNING=1 npm run test:integration
//
// On Windows PowerShell:
//
//   $env:FIREBASE_EMULATOR_RUNNING=1; npm run test:integration
//
// Each suite also seeds its own fixtures via helpers in this file, so you
// do NOT need to pre-run `npm run seed:test` first — but doing so still
// works, the suites wipe + reseed what they need.
// ---------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  initializeTestEnvironment,
  type RulesTestContext,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import type { Firestore } from 'firebase/firestore';

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'order-app-local';
const HOST = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');

export function isEmulatorEnabled(): boolean {
  return process.env.FIREBASE_EMULATOR_RUNNING === '1';
}

/**
 * Describe-block guard. Call like:
 *   const d = describeIfEmulator();
 *   d('order placement', () => { ... });
 */
export const describeIfEmulator = isEmulatorEnabled() ? describe : describe.skip;

let envPromise: Promise<RulesTestEnvironment> | null = null;

export async function getTestEnv(): Promise<RulesTestEnvironment> {
  if (envPromise) return envPromise;
  const rules = readFileSync(resolve(__dirname, '..', '..', 'firestore.rules'), 'utf8');
  envPromise = initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: HOST[0],
      port: Number(HOST[1]),
      rules,
    },
  });
  return envPromise;
}

export async function closeTestEnv(): Promise<void> {
  if (!envPromise) return;
  const env = await envPromise;
  await env.cleanup();
  envPromise = null;
}

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

/**
 * Context helpers:
 *  - guestCtx:     unauthenticated
 *  - clientCtx:    signed-in with role=client
 *  - ownerCtx:     signed-in with role=owner
 */
export async function guestCtx(env: RulesTestEnvironment): Promise<RulesTestContext> {
  return env.unauthenticatedContext();
}
export async function clientCtx(
  env: RulesTestEnvironment,
  uid = 'client-uid'
): Promise<RulesTestContext> {
  return env.authenticatedContext(uid);
}
export async function ownerCtx(
  env: RulesTestEnvironment,
  uid = 'owner-uid'
): Promise<RulesTestContext> {
  return env.authenticatedContext(uid);
}

/**
 * Seed deterministic fixtures through the admin (rules-bypassing) context.
 * Pass `settingsPatch` to override the default store settings for a
 * particular test (e.g. flipping stripe off).
 */
export async function seedBaseline(
  env: RulesTestEnvironment,
  settingsPatch: Record<string, any> = {}
): Promise<void> {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const admin = ctx.firestore();
    const { doc, setDoc, Timestamp, deleteDoc, getDocs, collection } = await import('firebase/firestore');

    // Wipe the collections we're about to re-seed.
    for (const name of ['orders', 'products', 'categories', 'profiles', 'store_settings']) {
      const snap = await getDocs(collection(admin, name));
      await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
    }

    // Store settings
    await setDoc(doc(admin, 'store_settings/default'), {
      deliveryFee: 15,
      minOrderAmount: 30,
      isDeliveryEnabled: true,
      isPickupEnabled: true,
      isStoreOpen: true,
      businessHours: null,   // null → no time restriction in tests unless a suite overrides it
      requiredCheckoutFields: ['full_name', 'phone_number', 'address_line1', 'city'],
      paymentMethods: { cash: true, stripe: true },
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      ...settingsPatch,
    });

    // Categories
    await setDoc(doc(admin, 'categories/cat-pizza'), {
      name: 'Pizza', sortOrder: 1, imageUrl: null, createdAt: Timestamp.now(),
    });

    // Products
    const products = [
      { id: 'prod-margherita', price: 42, stockQuantity: 20, name: 'Margherita' },
      { id: 'prod-pepperoni',  price: 48, stockQuantity: 15, name: 'Pepperoni'  },
      { id: 'prod-tiny',       price:  5, stockQuantity:  3, name: 'Tiny Pie'   },
      { id: 'prod-unavail',    price: 10, stockQuantity:  5, name: 'Hidden',    isAvailable: false },
      { id: 'prod-oos',        price: 10, stockQuantity:  0, name: 'OutOfStock' },
    ];
    for (const p of products) {
      await setDoc(doc(admin, `products/${p.id}`), {
        categoryId: 'cat-pizza',
        name: p.name,
        description: 'desc',
        price: p.price,
        stockQuantity: p.stockQuantity,
        imageUrl: null,
        isAvailable: (p as any).isAvailable ?? true,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
    }

    // Profiles
    await setDoc(doc(admin, 'profiles/owner-uid'), {
      email: 'owner@test.local', role: 'owner',  fullName: 'Olga Owner',
      phoneNumber: '+972501110001', address: null,
      createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
    });
    await setDoc(doc(admin, 'profiles/admin-uid'), {
      email: 'admin@test.local', role: 'admin',  fullName: 'Adam Admin',
      phoneNumber: '+972501110002', address: null,
      createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
    });
    await setDoc(doc(admin, 'profiles/client-uid'), {
      email: 'client@test.local', role: 'client', fullName: 'Cara Client',
      phoneNumber: '+972501110003', address: null,
      createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
    });
  });
}

/**
 * Fetch a RulesTestContext's Firestore cast to the standard SDK Firestore
 * type. The rules-unit-testing SDK returns the real `firebase/firestore`
 * Firestore but typed as its own.
 */
export function fs(ctx: RulesTestContext): Firestore {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ctx.firestore() as unknown as Firestore;
}
