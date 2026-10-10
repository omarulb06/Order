#!/usr/bin/env tsx
/* eslint-disable no-console */
// ---------------------------------------------------------------------------
// Deterministic seed for the local Firebase emulator (Firestore + Auth).
//
// Seeds the exact QA fixtures the integration suite expects:
//
//   /store_settings/default   { deliveryFee: 15, minOrderAmount: 30, ... }
//   /categories/*             3 categories (sortOrder 1..3)
//   /products/*               8 products
//   /profiles/*               3 test profiles (owner, admin, client)
//   /orders/*                 4 seed orders (pending, preparing, delivered,
//                              out_for_delivery) all referencing seeded
//                              products so the stock numbers add up.
//
// Usage:
//   # start the emulator in one terminal:
//   npm run emulators
//   # then run the seed in another:
//   npm run seed:test
//
// Environment variables honoured:
//   FIRESTORE_EMULATOR_HOST   defaults to 127.0.0.1:8080
//   FIREBASE_AUTH_EMULATOR_HOST defaults to 127.0.0.1:9099
//   GCLOUD_PROJECT            defaults to order-app-local  (matches .firebaserc)
// ---------------------------------------------------------------------------

import { initializeApp, cert, type AppOptions } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

process.env.FIRESTORE_EMULATOR_HOST     ||= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
process.env.GCLOUD_PROJECT              ||= 'order-app-local';

const projectId = process.env.GCLOUD_PROJECT;

const options: AppOptions = { projectId };
// Admin SDK against the emulator doesn't require real credentials.
initializeApp(options);

const db   = getFirestore();
const auth = getAuth();

type SeedProduct = {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  price: number;
  stockQuantity: number;
  imageUrl: string | null;
  images: string[];
  isAvailable: boolean;
};

type SeedReview = {
  id: string;
  productId: string;
  userId: string;
  userName: string;
  rating: number;
  comment: string | null;
};

type SeedCategory = { id: string; name: string; sortOrder: number; imageUrl: string | null };

type SeedProfile = {
  uid: string;
  email: string;
  password: string;
  role: 'owner' | 'admin' | 'client';
  fullName: string;
  phoneNumber: string;
};

type SeedOrderInput = {
  id: string;
  userId: string | null;
  customerName: string;
  phoneNumber: string;
  fulfillmentType: 'delivery' | 'pickup';
  paymentMethod: 'cash' | 'stripe';
  status: 'pending' | 'preparing' | 'out_for_delivery' | 'delivered';
  lines: Array<{ productId: string; quantity: number }>;
};

// --- fixtures ---------------------------------------------------------------

const ALWAYS_OPEN = { open: '00:00', close: '00:00', active: true };

const SETTINGS = {
  deliveryFee: 15,
  minOrderAmount: 30,
  isDeliveryEnabled: true,
  isPickupEnabled: true,
  isStoreOpen: true,
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

const CATEGORIES: SeedCategory[] = [
  { id: 'cat-pizza', name: 'Pizza',   sortOrder: 1, imageUrl: null },
  { id: 'cat-burgers', name: 'Burgers', sortOrder: 2, imageUrl: null },
  { id: 'cat-drinks',  name: 'Drinks',  sortOrder: 3, imageUrl: null },
];

const img = (seed: string) => `https://picsum.photos/seed/${seed}/800/800`;

const PRODUCTS: SeedProduct[] = [
  { id: 'prod-margherita', categoryId: 'cat-pizza',   name: 'Margherita',        description: 'Classic Neapolitan-style pizza with San Marzano tomato sauce, fresh fior di latte mozzarella, basil leaves, and a drizzle of cold-pressed olive oil. Baked at 450°C in a stone oven for a blistered, airy crust.', price: 42, stockQuantity: 20, imageUrl: img('pizza-margherita-1'), images: [img('pizza-margherita-1'), img('pizza-margherita-2'), img('pizza-margherita-3')], isAvailable: true },
  { id: 'prod-pepperoni',  categoryId: 'cat-pizza',   name: 'Pepperoni',         description: 'Loaded with spicy cup-and-char pepperoni over mozzarella and our signature tomato sauce.', price: 48, stockQuantity: 15, imageUrl: img('pizza-pepperoni-1'), images: [img('pizza-pepperoni-1'), img('pizza-pepperoni-2')], isAvailable: true },
  { id: 'prod-quattro',    categoryId: 'cat-pizza',   name: 'Quattro Formaggi',  description: 'Four cheese blend: mozzarella, gorgonzola, fontina, and parmesan.', price: 55, stockQuantity: 10, imageUrl: img('pizza-quattro-1'), images: [img('pizza-quattro-1'), img('pizza-quattro-2')], isAvailable: true },
  { id: 'prod-classic',    categoryId: 'cat-burgers', name: 'Classic Burger',    description: '200g grass-fed beef patty, cheddar, lettuce, tomato, red onion, pickles, and house sauce on a toasted brioche bun. Served with a side of your choice.', price: 38, stockQuantity: 25, imageUrl: img('burger-classic-1'), images: [img('burger-classic-1'), img('burger-classic-2'), img('burger-classic-3')], isAvailable: true },
  { id: 'prod-chicken',    categoryId: 'cat-burgers', name: 'Chicken Burger',    description: 'Crispy buttermilk-fried chicken thigh, slaw, and chipotle mayo.', price: 36, stockQuantity: 20, imageUrl: img('burger-chicken-1'), images: [img('burger-chicken-1'), img('burger-chicken-2')], isAvailable: true },
  { id: 'prod-cola',       categoryId: 'cat-drinks',  name: 'Cola 330ml',        description: 'Chilled soft drink.',          price:  8, stockQuantity: 50, imageUrl: img('drink-cola-1'), images: [img('drink-cola-1')], isAvailable: true },
  { id: 'prod-water',      categoryId: 'cat-drinks',  name: 'Mineral Water',     description: 'Still water 500ml.',           price:  6, stockQuantity: 50, imageUrl: img('drink-water-1'), images: [img('drink-water-1')], isAvailable: true },
  { id: 'prod-oos',        categoryId: 'cat-drinks',  name: 'Fresh OJ',          description: 'Freshly squeezed orange juice.', price: 14, stockQuantity:  0, imageUrl: img('drink-oj-1'), images: [img('drink-oj-1')], isAvailable: false },
];

const REVIEWS: SeedReview[] = [
  { id: 'rev-marg-1', productId: 'prod-margherita', userId: 'client-uid', userName: 'Cara Client',  rating: 5, comment: 'Best margherita in town — the crust is incredible.' },
  { id: 'rev-marg-2', productId: 'prod-margherita', userId: 'admin-uid',  userName: 'Adam Admin',   rating: 4, comment: 'Great flavor, arrived still hot.' },
  { id: 'rev-classic-1', productId: 'prod-classic', userId: 'client-uid', userName: 'Cara Client',  rating: 4, comment: 'Solid burger, generous portion.' },
];

const PROFILES: SeedProfile[] = [
  { uid: 'owner-uid',  email: 'owner@test.local',  password: 'password123', role: 'owner',  fullName: 'Olga Owner',   phoneNumber: '+972501110001' },
  { uid: 'admin-uid',  email: 'admin@test.local',  password: 'password123', role: 'admin',  fullName: 'Adam Admin',   phoneNumber: '+972501110002' },
  { uid: 'client-uid', email: 'client@test.local', password: 'password123', role: 'client', fullName: 'Cara Client',  phoneNumber: '+972501110003' },
];

const ORDERS: SeedOrderInput[] = [
  { id: 'order-pending',    userId: null,         customerName: 'Guest 1',    phoneNumber: '+972501110100', fulfillmentType: 'delivery', paymentMethod: 'cash',   status: 'pending',          lines: [{ productId: 'prod-margherita', quantity: 1 }] },
  { id: 'order-preparing',  userId: 'client-uid', customerName: 'Cara Client',phoneNumber: '+972501110003', fulfillmentType: 'delivery', paymentMethod: 'stripe', status: 'preparing',        lines: [{ productId: 'prod-classic', quantity: 1 }] },
  { id: 'order-onroute',    userId: null,         customerName: 'Guest 2',    phoneNumber: '+972501110101', fulfillmentType: 'delivery', paymentMethod: 'cash',   status: 'out_for_delivery', lines: [{ productId: 'prod-pepperoni', quantity: 1 }] },
  { id: 'order-delivered',  userId: 'client-uid', customerName: 'Cara Client',phoneNumber: '+972501110003', fulfillmentType: 'pickup',   paymentMethod: 'cash',   status: 'delivered',        lines: [{ productId: 'prod-cola', quantity: 4 }] },
];

// --- helpers ----------------------------------------------------------------

const SETTINGS_DOC_ID = 'default';

async function wipeCollection(name: string): Promise<void> {
  const snap = await db.collection(name).get();
  const batch = db.batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  if (snap.size > 0) await batch.commit();
}

async function wipeAuth(): Promise<void> {
  // Cheap: list up to 1000 users and delete those we're about to recreate.
  for (const p of PROFILES) {
    try {
      await auth.deleteUser(p.uid);
    } catch {
      // ignore "not found"
    }
  }
}

async function seedSettings(): Promise<void> {
  await db.collection('store_settings').doc(SETTINGS_DOC_ID).set({
    ...SETTINGS,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
}

async function seedCategories(): Promise<void> {
  for (const c of CATEGORIES) {
    await db.collection('categories').doc(c.id).set({
      name: c.name,
      sortOrder: c.sortOrder,
      imageUrl: c.imageUrl,
      createdAt: Timestamp.now(),
    });
  }
}

async function seedProducts(): Promise<void> {
  // Ratings per product, used to compute the stored aggregate so it always
  // matches the reviews subcollection.
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

    await db.collection('products').doc(p.id).set({
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
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
  }
}

async function seedReviews(): Promise<void> {
  for (const r of REVIEWS) {
    await db
      .collection('products')
      .doc(r.productId)
      .collection('reviews')
      .doc(r.id)
      .set({
        userId: r.userId,
        userName: r.userName,
        rating: r.rating,
        comment: r.comment,
        createdAt: Timestamp.now(),
      });
  }
}

async function seedProfiles(): Promise<void> {
  for (const p of PROFILES) {
    await auth.createUser({
      uid: p.uid,
      email: p.email,
      emailVerified: true,
      password: p.password,
      displayName: p.fullName,
    });
    await db.collection('profiles').doc(p.uid).set({
      email: p.email,
      role: p.role,
      fullName: p.fullName,
      phoneNumber: p.phoneNumber,
      address: null,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
  }
}

async function seedOrders(): Promise<void> {
  const productsById = new Map(PRODUCTS.map((p) => [p.id, p]));
  for (const o of ORDERS) {
    const items = o.lines.map((l) => {
      const p = productsById.get(l.productId)!;
      return {
        productId: p.id,
        productName: p.name,
        quantity: l.quantity,
        unitPrice: p.price,
        subtotal: round2(l.quantity * p.price),
      };
    });
    const subtotal = round2(items.reduce((s, it) => s + it.subtotal, 0));
    const deliveryFee = o.fulfillmentType === 'delivery' ? SETTINGS.deliveryFee : 0;
    const totalAmount = round2(subtotal + deliveryFee);
    await db.collection('orders').doc(o.id).set({
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
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
  }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// --- main -------------------------------------------------------------------

async function main(): Promise<void> {
  console.log(`[seed] project=${projectId}`);
  console.log(`[seed] firestore=${process.env.FIRESTORE_EMULATOR_HOST}`);
  console.log(`[seed] auth=${process.env.FIREBASE_AUTH_EMULATOR_HOST}`);

  console.log('[seed] wiping existing data…');
  await Promise.all([
    wipeCollection('orders'),
    wipeCollection('categories'),
    wipeCollection('profiles'),
    wipeCollection('store_settings'),
  ]);
  // Products carry a reviews subcollection — wipe both levels.
  const productSnap = await db.collection('products').get();
  for (const p of productSnap.docs) {
    const revSnap = await p.ref.collection('reviews').get();
    await Promise.all(revSnap.docs.map((r) => r.ref.delete()));
    await p.ref.delete();
  }
  await wipeAuth();

  console.log('[seed] writing fresh fixtures…');
  await seedSettings();
  await seedCategories();
  await seedProducts();
  await seedReviews();
  await seedProfiles();
  await seedOrders();

  console.log('[seed] done.');
  process.exit(0);
}

main().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
