// ---------------------------------------------------------------------------
// placeOrder() transaction — business rules that MUST survive the migration.
// Mirrors the Supabase trigger assertions from the pre-migration suite.
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
import { OrderGuardError } from '@/lib/orderGuards';

const base = {
  userId: null,
  customerName: 'Test User',
  phoneNumber: '+972501234567',
  deliveryAddress: {
    addressLine1: '1 Example St',
    city: 'Tel Aviv',
    country: 'IL',
  },
  fulfillmentType: 'delivery' as const,
  paymentMethod: 'cash' as const,
  notes: null,
};

describeIfEmulator('placeOrder transaction', () => {
  let env: RulesTestEnvironment;

  beforeAll(async () => {
    env = await getTestEnv();
  });
  afterAll(async () => {
    await closeTestEnv();
  });
  beforeEach(async () => {
    await env.clearFirestore();
    await seedBaseline(env);
  });

  it('places a valid order, decrements stock, forces status=pending', async () => {
    const ctx = await guestCtx(env);
    const { order } = await placeOrderWith(fs(ctx), {
      ...base,
      lines: [{ productId: 'prod-margherita', productName: 'Margherita', quantity: 1, unitPrice: 42 }],
    });
    expect(order.status).toBe('pending');
    expect(order.totalAmount).toBe(57); // 42 + 15 delivery
    expect(order.subtotal).toBe(42);
    expect(order.deliveryFee).toBe(15);

    // Verify stock decrement via admin context (bypass rules).
    await env.withSecurityRulesDisabled(async (c) => {
      const snap = await getDoc(doc(c.firestore(), 'products/prod-margherita'));
      expect((snap.data() as any).stockQuantity).toBe(19);
    });
  });

  it('rejects below-minimum subtotal', async () => {
    const ctx = await guestCtx(env);
    await expect(
      placeOrderWith(fs(ctx), {
        ...base,
        lines: [{ productId: 'prod-tiny', productName: 'Tiny Pie', quantity: 1, unitPrice: 5 }], // 5 < min 30
      })
    ).rejects.toThrow(/[Mm]inimum order/);
  });

  it('rejects unavailable product', async () => {
    const ctx = await guestCtx(env);
    await expect(
      placeOrderWith(fs(ctx), {
        ...base,
        lines: [{ productId: 'prod-unavail', productName: 'Hidden', quantity: 1, unitPrice: 10 }],
      })
    ).rejects.toBeInstanceOf(OrderGuardError);
  });

  it('rejects insufficient stock', async () => {
    const ctx = await guestCtx(env);
    await expect(
      placeOrderWith(fs(ctx), {
        ...base,
        lines: [{ productId: 'prod-tiny', productName: 'Tiny Pie', quantity: 999, unitPrice: 5 }],
      })
    ).rejects.toThrow(/[Ii]nsufficient stock/);
  });

  it('rejects out-of-stock product', async () => {
    const ctx = await guestCtx(env);
    await expect(
      placeOrderWith(fs(ctx), {
        ...base,
        lines: [{ productId: 'prod-oos', productName: 'OutOfStock', quantity: 1, unitPrice: 10 }],
      })
    ).rejects.toThrow(/[Ii]nsufficient stock|not available/);
  });

  it('rejects quantity < 1 and quantity > 1000', async () => {
    const ctx = await guestCtx(env);
    await expect(
      placeOrderWith(fs(ctx), {
        ...base,
        lines: [{ productId: 'prod-margherita', productName: 'Margherita', quantity: 0, unitPrice: 42 }],
      })
    ).rejects.toThrow(/at least 1/);
    await expect(
      placeOrderWith(fs(ctx), {
        ...base,
        lines: [{ productId: 'prod-margherita', productName: 'Margherita', quantity: 1001, unitPrice: 42 }],
      })
    ).rejects.toThrow(/may not exceed 1000/);
  });

  it('rejects non-E.164 phone', async () => {
    const ctx = await guestCtx(env);
    await expect(
      placeOrderWith(fs(ctx), {
        ...base,
        phoneNumber: '0501234567', // local; must be E.164 at this layer
        lines: [{ productId: 'prod-margherita', productName: 'Margherita', quantity: 1, unitPrice: 42 }],
      })
    ).rejects.toThrow(/E\.164/);
  });

  it('rejects when store disables fulfillment type after cart was built', async () => {
    await seedBaseline(env, { isDeliveryEnabled: false });
    const ctx = await guestCtx(env);
    await expect(
      placeOrderWith(fs(ctx), {
        ...base,
        lines: [{ productId: 'prod-margherita', productName: 'Margherita', quantity: 1, unitPrice: 42 }],
      })
    ).rejects.toThrow(/[Dd]elivery is currently disabled/);
  });

  it('rejects when payment method is disabled', async () => {
    await seedBaseline(env, { paymentMethods: { cash: false, stripe: true } });
    const ctx = await guestCtx(env);
    await expect(
      placeOrderWith(fs(ctx), {
        ...base,
        paymentMethod: 'cash',
        lines: [{ productId: 'prod-margherita', productName: 'Margherita', quantity: 1, unitPrice: 42 }],
      })
    ).rejects.toThrow(/disabled by the store/);
  });

  it('pickup carries zero delivery fee regardless of settings', async () => {
    const ctx = await guestCtx(env);
    const { order } = await placeOrderWith(fs(ctx), {
      ...base,
      fulfillmentType: 'pickup',
      deliveryAddress: null,
      lines: [{ productId: 'prod-margherita', productName: 'Margherita', quantity: 1, unitPrice: 42 }],
    });
    expect(order.deliveryFee).toBe(0);
    expect(order.totalAmount).toBe(42);
  });
});
