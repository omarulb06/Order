// ---------------------------------------------------------------------------
// Guest vs logged-in checkout parity:
//
//   * A guest (unauthenticated) can place an order with userId == null.
//   * A signed-in client can place an order carrying userId == auth.uid.
//   * A signed-in client CANNOT create an order claiming someone else's
//     userId (rules reject the write).
//   * The guest's own order is readable by its exact doc id when accessed
//     via the client-side recentOrder cache (that path is covered by the
//     unit tests); here we verify the SERVER-side rule that guests cannot
//     read orders directly at all.
// ---------------------------------------------------------------------------

import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { addDoc, collection, doc, getDoc, Timestamp } from 'firebase/firestore';
import {
  clientCtx,
  closeTestEnv,
  describeIfEmulator,
  fs,
  getTestEnv,
  guestCtx,
  seedBaseline,
} from './_harness';
import { placeOrderWith } from '@/lib/firestore/orders';

const sharedLine = { productId: 'prod-margherita', productName: 'Margherita', quantity: 1, unitPrice: 42 };

describeIfEmulator('guest vs logged-in checkout', () => {
  let env: RulesTestEnvironment;

  beforeAll(async () => { env = await getTestEnv(); });
  afterAll(async  () => { await closeTestEnv(); });
  beforeEach(async () => {
    await env.clearFirestore();
    await seedBaseline(env);
  });

  it('guest can place an order (userId=null)', async () => {
    const ctx = await guestCtx(env);
    const { order } = await placeOrderWith(fs(ctx), {
      userId: null,
      customerName: 'Guest',
      phoneNumber: '+972501234567',
      deliveryAddress: { addressLine1: '1', city: 'Tel Aviv' },
      fulfillmentType: 'delivery',
      paymentMethod: 'cash',
      notes: null,
      lines: [sharedLine],
    });
    expect(order.userId).toBeNull();
    expect(order.status).toBe('pending');
  });

  it('signed-in client places an order carrying their own uid', async () => {
    const ctx = await clientCtx(env, 'client-uid');
    const { order } = await placeOrderWith(fs(ctx), {
      userId: 'client-uid',
      customerName: 'Cara',
      phoneNumber: '+972501110003',
      deliveryAddress: { addressLine1: '1', city: 'Tel Aviv' },
      fulfillmentType: 'delivery',
      paymentMethod: 'cash',
      notes: null,
      lines: [sharedLine],
    });
    expect(order.userId).toBe('client-uid');

    // Owner (via admin bypass) and the client themselves can read it back.
    const asClient = await clientCtx(env, 'client-uid');
    await assertSucceeds(getDoc(doc(asClient.firestore(), `orders/${order.id}`)));
  });

  it('client CANNOT create an order claiming another uid', async () => {
    const ctx = await clientCtx(env, 'client-uid');
    await assertFails(
      addDoc(collection(ctx.firestore(), 'orders'), {
        userId: 'owner-uid', // ← someone else's uid
        customerName: 'Impostor',
        phoneNumber: '+972501234567',
        deliveryAddress: null,
        fulfillmentType: 'pickup',
        paymentMethod: 'cash',
        status: 'pending',
        subtotal: 42, deliveryFee: 0, totalAmount: 42,
        items: [{ productId: 'prod-margherita', productName: 'Margherita', quantity: 1, unitPrice: 42, subtotal: 42 }],
        notes: null,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      })
    );
  });

  it('a guest cannot read any order directly (even their own)', async () => {
    // Place a guest order via admin bypass to isolate the read check.
    await env.withSecurityRulesDisabled(async (c) => {
      const { setDoc, doc: d, Timestamp: T } = await import('firebase/firestore');
      await setDoc(d(c.firestore(), 'orders/guest-order'), {
        userId: null,
        customerName: 'G',
        phoneNumber: '+972501234567',
        deliveryAddress: null,
        fulfillmentType: 'pickup',
        paymentMethod: 'cash',
        status: 'pending',
        subtotal: 42, deliveryFee: 0, totalAmount: 42,
        items: [{ productId: 'p', productName: 'p', quantity: 1, unitPrice: 42, subtotal: 42 }],
        notes: null,
        createdAt: T.now(),
        updatedAt: T.now(),
      });
    });

    const asGuest = await guestCtx(env);
    await assertFails(getDoc(doc(asGuest.firestore(), 'orders/guest-order')));
  });
});
