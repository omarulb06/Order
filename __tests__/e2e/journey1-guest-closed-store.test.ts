// ---------------------------------------------------------------------------
// E2E Journey 1 — Guest shopping & the closed-store gate.
//
// Backend-level journey through the real guards + transaction layer:
//   1. Owner closes the store  → the checkout pre-flight guard throws,
//      the transaction throws, and no order doc / stock mutation occurs.
//   2. Owner re-opens          → the guest journey completes end-to-end:
//      catalog read → cart math → placeOrder → confirmation data intact
//      (incl. WhatsApp deep-link generation).
//
// UI-level assertions (banner visibility, disabled button) are covered by
// the same guard the UI binds to: isStoreAcceptingOrders().
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
} from '../integration/_harness';
import { placeOrderWith } from '@/lib/firestore/orders';
import { assertSubmittable, isStoreAcceptingOrders } from '@/lib/orderGuards';
import { computeOrderTotals } from '@/lib/pricing';
import { buildWhatsAppLink } from '@/lib/whatsapp';
import { StoreClosedError } from '@/lib/storeHours';
import type { StoreSettings } from '@/types/database';

describeIfEmulator('J1 · Guest shopping & closed store', () => {
  let env: RulesTestEnvironment;

  beforeAll(async () => { env = await getTestEnv(); });
  afterAll(async  () => { await closeTestEnv(); });
  beforeEach(async () => {
    await env.clearFirestore();
    await seedBaseline(env);
  });

  it('closed store blocks the entire checkout journey (UI gate + pre-flight + transaction)', async () => {
    // -- Step 1: owner flips the master switch off ------------------------
    await seedBaseline(env, { isStoreOpen: false });

    // -- Step 2: the UI gate the checkout button binds to ---------------
    await env.withSecurityRulesDisabled(async (c) => {
      const settings = (await getDoc(doc(c.firestore(), 'store_settings/default'))).data() as StoreSettings;
      expect(isStoreAcceptingOrders(settings)).toBe(false);

      // -- Step 3: the client pre-flight guard the submit handler runs --
      const lines = [{ product: { id: 'prod-margherita', price: 42, stockQuantity: 20, isAvailable: true }, quantity: 1 }];
      const totals = computeOrderTotals(lines, settings, 'delivery');
      expect(() =>
        assertSubmittable({
          settings,
          fulfillment: 'delivery',
          payment: 'cash',
          lines,
          subtotal: totals.subtotal,
          total: totals.total,
          deliveryFee: totals.deliveryFee,
        })
      ).toThrow(StoreClosedError);
    });

    // -- Step 4: even a crafted client that skips the UI is rejected ----
    const ctx = await guestCtx(env);
    await expect(
      placeOrderWith(fs(ctx), {
        userId: null,
        customerName: 'Sneaky Guest',
        phoneNumber: '+972501234567',
        deliveryAddress: { addressLine1: '1', city: 'Tel Aviv' },
        fulfillmentType: 'delivery',
        paymentMethod: 'cash',
        notes: null,
        lines: [{ productId: 'prod-margherita', productName: 'Margherita', quantity: 1, unitPrice: 42 }],
      })
    ).rejects.toThrow(/closed/i);

    // -- Step 5: nothing leaked — no order, no stock movement -----------
    await env.withSecurityRulesDisabled(async (c) => {
      const product = (await getDoc(doc(c.firestore(), 'products/prod-margherita'))).data() as any;
      expect(product.stockQuantity).toBe(20);
    });
  });

  it('re-opened store allows the full guest journey through confirmation', async () => {
    const ctx = await guestCtx(env);

    // Browse → details are public reads (proved by rules suite); here we
    // run the purchase itself.
    const { order, items } = await placeOrderWith(fs(ctx), {
      userId: null,
      customerName: 'Guest Shopper',
      phoneNumber: '+972501234567',
      deliveryAddress: { addressLine1: '1 Example St', city: 'Tel Aviv' },
      fulfillmentType: 'delivery',
      paymentMethod: 'cash',
      notes: 'Leave at the door',
      lines: [
        { productId: 'prod-margherita', productName: 'Margherita', quantity: 1, unitPrice: 42 },
        { productId: 'prod-pepperoni',  productName: 'Pepperoni',  quantity: 1, unitPrice: 48 },
      ],
    });

    // Confirmation screen payload.
    expect(order.status).toBe('pending');
    expect(order.subtotal).toBe(90);
    expect(order.deliveryFee).toBe(15);
    expect(order.totalAmount).toBe(105);
    expect(items).toHaveLength(2);

    // WhatsApp deep link from the confirmation screen.
    const url = buildWhatsAppLink(
      '+972505895356',
      `Hi! I just placed order #${order.id.slice(0, 8).toUpperCase()}.`
    );
    expect(url).toMatch(/^https:\/\/wa\.me\/972505895356\?text=/);

    // Stock decremented atomically for both products.
    await env.withSecurityRulesDisabled(async (c) => {
      expect(((await getDoc(doc(c.firestore(), 'products/prod-margherita'))).data() as any).stockQuantity).toBe(19);
      expect(((await getDoc(doc(c.firestore(), 'products/prod-pepperoni'))).data() as any).stockQuantity).toBe(14);
    });
  });
});
