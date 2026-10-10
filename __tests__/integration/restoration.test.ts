// ---------------------------------------------------------------------------
// Stock restoration on cancellation (B. edge test).
// updateOrderStatus(order, 'cancelled') MUST atomically refund every item's
// quantity back to products.stockQuantity.
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
import { placeOrderWith, updateOrderStatusWith } from '@/lib/firestore/orders';

describeIfEmulator('stock restoration on cancellation', () => {
  let env: RulesTestEnvironment;

  beforeAll(async () => { env = await getTestEnv(); });
  afterAll(async  () => { await closeTestEnv(); });
  beforeEach(async () => {
    await env.clearFirestore();
    await seedBaseline(env);
  });

  it('cancelling a pending order refunds all stock', async () => {
    const ctx = await guestCtx(env);
    const { order } = await placeOrderWith(fs(ctx), {
      userId: null,
      customerName: 'Cancel Me',
      phoneNumber: '+972501234567',
      deliveryAddress: { addressLine1: '1', city: 'Tel Aviv' },
      fulfillmentType: 'delivery',
      paymentMethod: 'cash',
      notes: null,
      lines: [
        { productId: 'prod-margherita', productName: 'Margherita', quantity: 3, unitPrice: 42 },
        { productId: 'prod-pepperoni',  productName: 'Pepperoni',  quantity: 2, unitPrice: 48 },
      ],
    });

    // sanity: stock dropped
    await env.withSecurityRulesDisabled(async (c) => {
      expect(((await getDoc(doc(c.firestore(), 'products/prod-margherita'))).data() as any).stockQuantity).toBe(17);
      expect(((await getDoc(doc(c.firestore(), 'products/prod-pepperoni'))).data()  as any).stockQuantity).toBe(13);
    });

    // cancel via admin firestore (bypasses rules; isolates the transaction)
    await env.withSecurityRulesDisabled(async (c) => {
      await updateOrderStatusWith(fs(c), order.id, 'cancelled');
    });

    await env.withSecurityRulesDisabled(async (c) => {
      expect(((await getDoc(doc(c.firestore(), 'products/prod-margherita'))).data() as any).stockQuantity).toBe(20);
      expect(((await getDoc(doc(c.firestore(), 'products/prod-pepperoni'))).data()  as any).stockQuantity).toBe(15);
      expect(((await getDoc(doc(c.firestore(), `orders/${order.id}`))).data() as any).status).toBe('cancelled');
    });
  });

  it('does not refund twice if cancellation is attempted on an already-cancelled order', async () => {
    const ctx = await guestCtx(env);
    const { order } = await placeOrderWith(fs(ctx), {
      userId: null,
      customerName: 'Idempotent',
      phoneNumber: '+972501234567',
      deliveryAddress: { addressLine1: '1', city: 'Tel Aviv' },
      fulfillmentType: 'delivery',
      paymentMethod: 'cash',
      notes: null,
      lines: [{ productId: 'prod-margherita', productName: 'Margherita', quantity: 2, unitPrice: 42 }],
    });

    await env.withSecurityRulesDisabled(async (c) => {
      await updateOrderStatusWith(fs(c), order.id, 'cancelled');
    });

    // second cancel should throw (illegal transition cancelled->cancelled)
    await env.withSecurityRulesDisabled(async (c) => {
      await expect(updateOrderStatusWith(fs(c), order.id, 'cancelled'))
        .rejects.toThrow(/[Ii]llegal/);
    });

    // Stock is still only refunded once.
    await env.withSecurityRulesDisabled(async (c) => {
      expect(((await getDoc(doc(c.firestore(), 'products/prod-margherita'))).data() as any).stockQuantity).toBe(20);
    });
  });
});
