#!/usr/bin/env tsx
/* eslint-disable no-console */
// ---------------------------------------------------------------------------
// One-time bootstrap for the LIVE `store-ordering-app` project.
//
// What it writes:
//   * /store_settings/default
//   * 3 categories + 8 products (same fixtures as the emulator seed)
//   * 3 Auth users + matching /profiles/{uid} docs:
//       owner@test.local / password123 → role = owner
//       admin@test.local / password123 → role = admin
//       client@test.local / password123 → role = client
//   * 4 sample orders across the lifecycle (pending → delivered)
//
// Auth mechanism: Application Default Credentials created by `firebase login`.
// The Admin SDK picks them up automatically, so no service-account JSON is
// required on the developer machine.
//
// Usage:
//   cd C:\Order
//   npx firebase login            # one-time, uses your Google account
//   npm run seed:live
// ---------------------------------------------------------------------------

import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  applicationDefault,
  getApps,
  initializeApp,
} from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

// ---- load project id from .env (fallback: .firebaserc default) -----------
const envPath = resolve(__dirname, '..', '.env');
if (existsSync(envPath)) loadDotenv({ path: envPath });

const projectId =
  process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'store-ordering-app';

if (!projectId) {
  console.error('[seed-live] EXPO_PUBLIC_FIREBASE_PROJECT_ID is missing from .env');
  process.exit(1);
}

// Refuse to run if the caller accidentally pointed this at the emulator.
if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  console.error(
    '[seed-live] Refusing to run while FIRESTORE/AUTH emulator hosts are set. ' +
      'Unset those env vars before seeding the live project.'
  );
  process.exit(1);
}

// ---- init Admin SDK via ADC -----------------------------------------------
if (!getApps().length) {
  initializeApp({
    credential: applicationDefault(),
    projectId,
  });
}

const db   = getFirestore();
const auth = getAuth();

// ---- fixtures (kept in lock-step with scripts/seed-firebase.ts) -----------
const ALWAYS_OPEN = { open: '00:00', close: '00:00', active: true };

const SETTINGS = {
  deliveryFee: 15,
  minOrderAmount: 30,
  isDeliveryEnabled: true,
  isPickupEnabled: true,
  isStoreOpen: true,
  // 24/7 by default (open == close means "open all day"). The owner can
  // narrow these in the Settings tab; the closed-store E2E flows use the
  // isStoreOpen master switch.
  businessHours: {
    sunday:    { ...ALWAYS_OPEN },
    monday:    { ...ALWAYS_OPEN },
    tuesday:   { ...ALWAYS_OPEN },
    wednesday: { ...ALWAYS_OPEN },
    thursday:  { ...ALWAYS_OPEN },
    friday:    { ...ALWAYS_OPEN },
    saturday:  { ...ALWAYS_OPEN },
  },
  requiredCheckoutFields: ['full_name', 'phone_number', 'address_line1', 'city'],
  paymentMethods: { cash: true, stripe: true },
};

const CATEGORIES = [
  { id: 'cat-pizza',   name: 'Pizza',   sortOrder: 1 },
  { id: 'cat-burgers', name: 'Burgers', sortOrder: 2 },
  { id: 'cat-drinks',  name: 'Drinks',  sortOrder: 3 },
];

const img = (seed: string) => `https://picsum.photos/seed/${seed}/800/800`;

const PRODUCTS = [
  { id: 'prod-margherita', categoryId: 'cat-pizza',   name: 'Margherita',       description: 'Classic Neapolitan-style pizza with San Marzano tomato sauce, fresh fior di latte mozzarella, basil leaves, and a drizzle of cold-pressed olive oil. Baked at 450°C in a stone oven for a blistered, airy crust.', price: 42, stockQuantity: 20, imageUrl: img('pizza-margherita-1'), images: [img('pizza-margherita-1'), img('pizza-margherita-2'), img('pizza-margherita-3')], isAvailable: true  },
  { id: 'prod-pepperoni',  categoryId: 'cat-pizza',   name: 'Pepperoni',        description: 'Loaded with spicy cup-and-char pepperoni over mozzarella and our signature tomato sauce.', price: 48, stockQuantity: 15, imageUrl: img('pizza-pepperoni-1'), images: [img('pizza-pepperoni-1'), img('pizza-pepperoni-2')], isAvailable: true  },
  { id: 'prod-quattro',    categoryId: 'cat-pizza',   name: 'Quattro Formaggi', description: 'Four cheese blend: mozzarella, gorgonzola, fontina, and parmesan.', price: 55, stockQuantity: 10, imageUrl: img('pizza-quattro-1'), images: [img('pizza-quattro-1'), img('pizza-quattro-2')], isAvailable: true  },
  { id: 'prod-classic',    categoryId: 'cat-burgers', name: 'Classic Burger',   description: '200g grass-fed beef patty, cheddar, lettuce, tomato, red onion, pickles, and house sauce on a toasted brioche bun. Served with a side of your choice.', price: 38, stockQuantity: 25, imageUrl: img('burger-classic-1'), images: [img('burger-classic-1'), img('burger-classic-2'), img('burger-classic-3')], isAvailable: true  },
  { id: 'prod-chicken',    categoryId: 'cat-burgers', name: 'Chicken Burger',   description: 'Crispy buttermilk-fried chicken thigh, slaw, and chipotle mayo.', price: 36, stockQuantity: 20, imageUrl: img('burger-chicken-1'), images: [img('burger-chicken-1'), img('burger-chicken-2')], isAvailable: true  },
  { id: 'prod-cola',       categoryId: 'cat-drinks',  name: 'Cola 330ml',       description: 'Chilled soft drink.',         price:  8, stockQuantity: 50, imageUrl: img('drink-cola-1'), images: [img('drink-cola-1')], isAvailable: true  },
  { id: 'prod-water',      categoryId: 'cat-drinks',  name: 'Mineral Water',    description: 'Still water 500ml.',          price:  6, stockQuantity: 50, imageUrl: img('drink-water-1'), images: [img('drink-water-1')], isAvailable: true  },
  { id: 'prod-oos',        categoryId: 'cat-drinks',  name: 'Fresh OJ',         description: 'Freshly squeezed orange juice.', price: 14, stockQuantity:  0, imageUrl: img('drink-oj-1'), images: [img('drink-oj-1')], isAvailable: false },
];

const REVIEWS = [
  { id: 'rev-marg-1',    productId: 'prod-margherita', userId: 'client-uid', userName: 'Cara Client', rating: 5, comment: 'Best margherita in town — the crust is incredible.' },
  { id: 'rev-marg-2',    productId: 'prod-margherita', userId: 'admin-uid',  userName: 'Adam Admin',  rating: 4, comment: 'Great flavor, arrived still hot.' },
  { id: 'rev-classic-1', productId: 'prod-classic',    userId: 'client-uid', userName: 'Cara Client', rating: 4, comment: 'Solid burger, generous portion.' },
];

const PROFILES = [
  { uid: 'owner-uid',  email: 'owner@test.local',  password: 'password123', role: 'owner'  as const, fullName: 'Olga Owner',  phoneNumber: '+972501110001' },
  { uid: 'admin-uid',  email: 'admin@test.local',  password: 'password123', role: 'admin'  as const, fullName: 'Adam Admin',  phoneNumber: '+972501110002' },
  { uid: 'client-uid', email: 'client@test.local', password: 'password123', role: 'client' as const, fullName: 'Cara Client', phoneNumber: '+972501110003' },
];

const ORDERS = [
  { id: 'order-pending',    userId: null,         customerName: 'Guest 1',     phoneNumber: '+972501110100', fulfillmentType: 'delivery' as const, paymentMethod: 'cash'   as const, status: 'pending'          as const, lines: [{ productId: 'prod-margherita', quantity: 1 }] },
  { id: 'order-preparing',  userId: 'client-uid', customerName: 'Cara Client', phoneNumber: '+972501110003', fulfillmentType: 'delivery' as const, paymentMethod: 'stripe' as const, status: 'preparing'        as const, lines: [{ productId: 'prod-classic',    quantity: 1 }] },
  { id: 'order-onroute',    userId: null,         customerName: 'Guest 2',     phoneNumber: '+972501110101', fulfillmentType: 'delivery' as const, paymentMethod: 'cash'   as const, status: 'out_for_delivery' as const, lines: [{ productId: 'prod-pepperoni',  quantity: 1 }] },
  { id: 'order-delivered',  userId: 'client-uid', customerName: 'Cara Client', phoneNumber: '+972501110003', fulfillmentType: 'pickup'   as const, paymentMethod: 'cash'   as const, status: 'delivered'        as const, lines: [{ productId: 'prod-cola',       quantity: 4 }] },
];

// ---- writers ----------------------------------------------------------------
async function upsertAuthUser(p: (typeof PROFILES)[number]): Promise<void> {
  try {
    await auth.getUser(p.uid);
    await auth.updateUser(p.uid, {
      email: p.email,
      emailVerified: true,
      password: p.password,
      displayName: p.fullName,
    });
  } catch {
    await auth.createUser({
      uid: p.uid,
      email: p.email,
      emailVerified: true,
      password: p.password,
      displayName: p.fullName,
    });
  }
}

async function main(): Promise<void> {
  console.log(`[seed-live] project=${projectId}`);

  const now = Timestamp.now();
  const batch = db.batch();

  batch.set(db.collection('store_settings').doc('default'), {
    ...SETTINGS,
    createdAt: now,
    updatedAt: now,
  });

  for (const c of CATEGORIES) {
    batch.set(db.collection('categories').doc(c.id), {
      name: c.name,
      sortOrder: c.sortOrder,
      imageUrl: null,
      createdAt: now,
    });
  }

  // Aggregate ratings per product so the stored average always matches the
  // reviews subcollection.
  const ratingsByProduct = new Map<string, number[]>();
  for (const r of REVIEWS) {
    const list = ratingsByProduct.get(r.productId) ?? [];
    list.push(r.rating);
    ratingsByProduct.set(r.productId, list);
  }

  for (const p of PRODUCTS) {
    const ratings = ratingsByProduct.get(p.id) ?? [];
    const reviewCount = ratings.length;
    const averageRating =
      reviewCount === 0
        ? 0
        : Math.round(((ratings.reduce((s, r) => s + r, 0) / reviewCount) + Number.EPSILON) * 100) / 100;

    batch.set(db.collection('products').doc(p.id), {
      categoryId: p.categoryId,
      name: p.name,
      description: p.description,
      price: p.price,
      stockQuantity: p.stockQuantity,
      imageUrl: p.imageUrl,
      images: p.images,
      averageRating,
      reviewCount,
      isAvailable: p.isAvailable,
      createdAt: now,
      updatedAt: now,
    });
  }

  for (const r of REVIEWS) {
    batch.set(
      db.collection('products').doc(r.productId).collection('reviews').doc(r.id),
      {
        userId: r.userId,
        userName: r.userName,
        rating: r.rating,
        comment: r.comment,
        createdAt: now,
      }
    );
  }

  const productsById = new Map(PRODUCTS.map((p) => [p.id, p]));
  for (const o of ORDERS) {
    const items = o.lines.map((l) => {
      const p = productsById.get(l.productId)!;
      return {
        productId: p.id,
        productName: p.name,
        quantity: l.quantity,
        unitPrice: p.price,
        subtotal: Math.round((l.quantity * p.price + Number.EPSILON) * 100) / 100,
      };
    });
    const subtotal = Math.round((items.reduce((s, it) => s + it.subtotal, 0) + Number.EPSILON) * 100) / 100;
    const deliveryFee = o.fulfillmentType === 'delivery' ? SETTINGS.deliveryFee : 0;
    const totalAmount = Math.round((subtotal + deliveryFee + Number.EPSILON) * 100) / 100;

    batch.set(db.collection('orders').doc(o.id), {
      userId: o.userId,
      customerName: o.customerName,
      phoneNumber: o.phoneNumber,
      deliveryAddress:
        o.fulfillmentType === 'delivery'
          ? { addressLine1: '1 Example St', city: 'Tel Aviv', country: 'IL' }
          : null,
      fulfillmentType: o.fulfillmentType,
      paymentMethod: o.paymentMethod,
      status: o.status,
      subtotal,
      deliveryFee,
      totalAmount,
      items,
      notes: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  await batch.commit();
  console.log('[seed-live] wrote settings, categories, products, reviews, orders');

  for (const p of PROFILES) {
    await upsertAuthUser(p);
    await db.collection('profiles').doc(p.uid).set(
      {
        email: p.email,
        role: p.role,
        fullName: p.fullName,
        phoneNumber: p.phoneNumber,
        address: null,
        updatedAt: Timestamp.now(),
        createdAt: now,
      },
      { merge: false }
    );
    console.log(`[seed-live] user ${p.email} (${p.role}) ready`);
  }

  console.log('[seed-live] done.');
}

main().catch((err) => {
  console.error('[seed-live] failed:', err?.message ?? err);
  console.error(
    '\nHint: run `npx firebase login` first, then `npx firebase login:ci` is NOT required — ' +
      'this script uses Application Default Credentials from that login.'
  );
  process.exit(1);
});
