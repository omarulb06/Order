// ---------------------------------------------------------------------------
// A. Quantity Limits & Negative Quantities.
// Verifies that quantity on an order line MUST be an integer in [1, 1000].
// Fractional / negative / NaN / string values are rejected inside the
// transaction (so a crafted REST client can't bypass the UI either).
// ---------------------------------------------------------------------------

import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import {
  closeTestEnv,
  describeIfEmulator,
  fs,
  getTestEnv,
  guestCtx,
  seedBaseline,
} from './_harness';
import { placeOrderWith } from '@/lib/firestore/orders';

const base = {
  userId: null,
  customerName: 'QA',
  phoneNumber: '+972501234567',
  deliveryAddress: { addressLine1: '1', city: 'Tel Aviv' },
  fulfillmentType: 'delivery' as const,
  paymentMethod: 'cash' as const,
  notes: null,
};

describeIfEmulator('quantity enforcement', () => {
  let env: RulesTestEnvironment;

  beforeAll(async () => { env = await getTestEnv(); });
  afterAll(async  () => { await closeTestEnv(); });
  beforeEach(async () => {
    await env.clearFirestore();
    await seedBaseline(env);
  });

  it('rejects quantity = 0', async () => {
    const ctx = await guestCtx(env);
    await expect(
      placeOrderWith(fs(ctx), {
        ...base,
        lines: [{ productId: 'prod-margherita', productName: 'Margherita', quantity: 0, unitPrice: 42 }],
      })
    ).rejects.toThrow(/at least 1/);
  });

  it('rejects negative quantity', async () => {
    const ctx = await guestCtx(env);
    await expect(
      placeOrderWith(fs(ctx), {
        ...base,
        lines: [{ productId: 'prod-margherita', productName: 'Margherita', quantity: -5, unitPrice: 42 }],
      })
    ).rejects.toThrow(/at least 1/);
  });

  it('rejects fractional quantity', async () => {
    const ctx = await guestCtx(env);
    await expect(
      placeOrderWith(fs(ctx), {
        ...base,
        lines: [{ productId: 'prod-margherita', productName: 'Margherita', quantity: 1.5, unitPrice: 42 }],
      })
    ).rejects.toThrow(/whole number/);
  });

  it('rejects NaN / Infinity', async () => {
    const ctx = await guestCtx(env);
    await expect(
      placeOrderWith(fs(ctx), {
        ...base,
        lines: [{ productId: 'prod-margherita', productName: 'Margherita', quantity: Number.NaN, unitPrice: 42 }],
      })
    ).rejects.toThrow(/whole number/);
    await expect(
      placeOrderWith(fs(ctx), {
        ...base,
        lines: [{ productId: 'prod-margherita', productName: 'Margherita', quantity: Number.POSITIVE_INFINITY, unitPrice: 42 }],
      })
    ).rejects.toThrow(/whole number/);
  });

  it('rejects quantity > 1000', async () => {
    const ctx = await guestCtx(env);
    await expect(
      placeOrderWith(fs(ctx), {
        ...base,
        lines: [{ productId: 'prod-margherita', productName: 'Margherita', quantity: 1001, unitPrice: 42 }],
      })
    ).rejects.toThrow(/may not exceed 1000/);
  });

  it('accepts quantity = 1 and quantity = 1000 (boundary)', async () => {
    const ctx = await guestCtx(env);
    // seed enough stock for 1000 by raising it through admin
    await env.withSecurityRulesDisabled(async (c) => {
      const { updateDoc, doc: d } = await import('firebase/firestore');
      await updateDoc(d(c.firestore(), 'products/prod-margherita'), { stockQuantity: 1500 });
    });
    await expect(
      placeOrderWith(fs(ctx), {
        ...base,
        lines: [{ productId: 'prod-margherita', productName: 'Margherita', quantity: 1, unitPrice: 42 }],
      })
    ).resolves.toBeDefined();
    await expect(
      placeOrderWith(fs(ctx), {
        ...base,
        lines: [{ productId: 'prod-margherita', productName: 'Margherita', quantity: 1000, unitPrice: 42 }],
      })
    ).resolves.toBeDefined();
  });
});
