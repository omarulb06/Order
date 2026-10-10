// ---------------------------------------------------------------------------
// Concurrency / race-condition tests.
//
//  * Oversell protection: two guests simultaneously ordering the last unit
//    of a product must NOT both succeed.
//  * Stale delivery fee: the Owner raises the delivery fee between cart
//    build and submit — the transaction uses the LIVE fee, not the cached
//    cart fee.
// ---------------------------------------------------------------------------

import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc } from 'firebase/firestore';
import {
  closeTestEnv,
  describeIfEmulator,
  fs,
  getTestEnv,
  guestCtx,
  seedBaseline,
} from './_harness';
import { placeOrderWith } from '@/lib/firestore/orders';

describeIfEmulator('race conditions', () => {
  let env: RulesTestEnvironment;

  beforeAll(async () => { env = await getTestEnv(); });
  afterAll(async  () => { await closeTestEnv(); });
  beforeEach(async () => {
    await env.clearFirestore();
    await seedBaseline(env);
  });

  it('two concurrent orders cannot both drain the last 3 of a product', async () => {
    const ctx = await guestCtx(env);
    // prod-tiny has stockQuantity=3, price=5 — but min order is 30 so the
    // order has to carry something else to clear the minimum. Use margherita
    // for the ballast + 2 tiny; a second concurrent order asks for 2 tiny
    // again — one of them MUST fail.
    const buildReq = () =>
      placeOrderWith(fs(ctx), {
        userId: null,
        customerName: 'Racer',
        phoneNumber: '+972501234567',
        deliveryAddress: { addressLine1: '1', city: 'Tel Aviv' },
        fulfillmentType: 'delivery',
        paymentMethod: 'cash',
        notes: null,
        lines: [
          { productId: 'prod-margherita', productName: 'Margherita', quantity: 1, unitPrice: 42 },
          { productId: 'prod-tiny',       productName: 'Tiny Pie',   quantity: 2, unitPrice: 5  },
        ],
      });

    const results = await Promise.allSettled([buildReq(), buildReq()]);
    const successes = results.filter((r) => r.status === 'fulfilled').length;
    const failures  = results.filter((r) => r.status === 'rejected').length;

    // At most one wins because tiny only has 3 units and each ask is 2.
    expect(successes).toBe(1);
    expect(failures).toBe(1);

    // Final stock: 1 (3 - 2) for tiny, 19 (20 - 1) for margherita.
    await env.withSecurityRulesDisabled(async (c) => {
      expect(((await getDoc(doc(c.firestore(), 'products/prod-tiny'))).data() as any).stockQuantity).toBe(1);
      expect(((await getDoc(doc(c.firestore(), 'products/prod-margherita'))).data() as any).stockQuantity).toBe(19);
    });
  });

  it('live store_settings wins over a stale client-side delivery fee (D. staleFee)', async () => {
    const ctx = await guestCtx(env);

    // Owner mid-session raises deliveryFee from 15 to 25.
    await env.withSecurityRulesDisabled(async (c) => {
      const { updateDoc } = await import('firebase/firestore');
      await updateDoc(doc(c.firestore(), 'store_settings/default'), { deliveryFee: 25 });
    });

    const { order } = await placeOrderWith(fs(ctx), {
      userId: null,
      customerName: 'Stale Fee',
      phoneNumber: '+972501234567',
      deliveryAddress: { addressLine1: '1', city: 'Tel Aviv' },
      fulfillmentType: 'delivery',
      paymentMethod: 'cash',
      notes: null,
      lines: [{ productId: 'prod-margherita', productName: 'Margherita', quantity: 1, unitPrice: 42 }],
    });

    // Transaction must have used the LIVE 25, not the pre-session 15.
    expect(order.deliveryFee).toBe(25);
    expect(order.totalAmount).toBe(67);
  });
});
