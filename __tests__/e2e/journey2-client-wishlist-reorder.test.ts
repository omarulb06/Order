// ---------------------------------------------------------------------------
// E2E Journey 2 — Logged-in client: wishlist, auto-filled checkout,
// order history visibility, one-tap re-order, and a 5-star review.
// ---------------------------------------------------------------------------

import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import {
  clientCtx,
  closeTestEnv,
  describeIfEmulator,
  fs,
  getTestEnv,
  seedBaseline,
} from '../integration/_harness';
import { placeOrderWith } from '@/lib/firestore/orders';
import { submitProductReviewWith } from '@/lib/firestore/products';
import { buildReorderPlan } from '@/lib/reorder';
import { mergeWishlistIds } from '@/stores/wishlist';
import { buildCheckoutFormFromProfile } from '@/lib/profileForm';
import type { Product, Profile } from '@/types/database';

describeIfEmulator('J2 · Client wishlist & re-order', () => {
  let env: RulesTestEnvironment;

  beforeAll(async () => { env = await getTestEnv(); });
  afterAll(async  () => { await closeTestEnv(); });
  beforeEach(async () => {
    await env.clearFirestore();
    await seedBaseline(env);
  });

  it('full client journey: wishlist → checkout → history → re-order → review', async () => {
    const ctx = await clientCtx(env, 'client-uid');

    // -- Step 1: wishlist heart toggle (local + remote mirror) ----------
    const localIds = ['prod-margherita'];
    await setDoc(
      doc(ctx.firestore(), 'profiles/client-uid/wishlist/prod-pepperoni'),
      { productId: 'prod-pepperoni', addedAt: serverTimestamp() }
    );
    const remoteSnap = await getDocs(
      collection(ctx.firestore(), 'profiles/client-uid/wishlist')
    );
    const merged = mergeWishlistIds(localIds, remoteSnap.docs.map((d) => d.id));
    expect(merged.sort()).toEqual(['prod-margherita', 'prod-pepperoni']);

    // -- Step 2: checkout form auto-fills from the profile --------------
    const profile: Profile = {
      id: 'client-uid',
      email: 'client@test.local',
      role: 'client',
      fullName: 'Cara Client',
      phoneNumber: '+972501110003',
      address: { addressLine1: '10 Rothschild Blvd', city: 'Tel Aviv', country: 'IL' },
      createdAt: '2026-01-01T00:00:00Z',
    };
    const form = buildCheckoutFormFromProfile(profile);
    expect(form.full_name).toBe('Cara Client');
    expect(form.phone_number).toBe('+972501110003');
    expect(form.city).toBe('Tel Aviv');

    // -- Step 3: place the order as the signed-in user ------------------
    const { order } = await placeOrderWith(fs(ctx), {
      userId: 'client-uid',
      customerName: form.full_name,
      phoneNumber: form.phone_number,
      deliveryAddress: {
        addressLine1: form.address_line1,
        city: form.city,
        country: form.country,
      },
      fulfillmentType: 'delivery',
      paymentMethod: 'cash',
      notes: null,
      lines: [
        { productId: 'prod-margherita', productName: 'Margherita', quantity: 2, unitPrice: 42 },
        { productId: 'prod-oos',        productName: 'OutOfStock', quantity: 0, unitPrice: 10 } as any,
      ].filter((l) => l.quantity > 0), // UI never sends qty 0; mirrors cart filtering
    });
    expect(order.userId).toBe('client-uid');

    // -- Step 4: history — the client can read their own order back -----
    const historySnap = await getDoc(doc(ctx.firestore(), `orders/${order.id}`));
    expect(historySnap.exists()).toBe(true);

    // -- Step 5: re-order — filters what is no longer available ---------
    await env.withSecurityRulesDisabled(async (c) => {
      // Make one product unavailable + another low on stock.
      const { updateDoc } = await import('firebase/firestore');
      await updateDoc(doc(c.firestore(), 'products/prod-margherita'), { stockQuantity: 1 });
    });
    const productsById = new Map<string, Product>();
    await env.withSecurityRulesDisabled(async (c) => {
      const snap = await getDocs(collection(c.firestore(), 'products'));
      snap.docs.forEach((d) => productsById.set(d.id, { id: d.id, ...(d.data() as any) }));
    });

    const plan = buildReorderPlan(order.items, productsById);
    expect(plan.added).toHaveLength(1);
    expect(plan.added[0].quantity).toBe(1); // capped from 2 → live stock 1
    expect(plan.skipped).toHaveLength(0);

    // -- Step 6: leave a 5-star review → aggregate updates --------------
    await submitProductReviewWith(fs(ctx), {
      productId: 'prod-margherita',
      userId: 'client-uid',
      userName: 'Cara Client',
      rating: 5,
      comment: 'Perfect as always.',
    });
    await env.withSecurityRulesDisabled(async (c) => {
      const p = (await getDoc(doc(c.firestore(), 'products/prod-margherita'))).data() as any;
      expect(p.reviewCount).toBe(1);
      expect(p.averageRating).toBe(5);
    });
  });
});
