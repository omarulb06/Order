// ---------------------------------------------------------------------------
// E2E Journey 3 — Owner operations: store toggle, fee update, order
// advancement through the state machine (with WhatsApp formatting), and
// cancellation stock refunds.
// ---------------------------------------------------------------------------

import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import {
  closeTestEnv,
  describeIfEmulator,
  fs,
  getTestEnv,
  guestCtx,
  ownerCtx,
  seedBaseline,
} from '../integration/_harness';
import {
  placeOrderWith,
  updateOrderStatusWith,
} from '@/lib/firestore/orders';
import { buildStatusMessage, buildWhatsAppLink } from '@/lib/whatsapp';
import type { Order } from '@/types/database';

describeIfEmulator('J3 · Owner operations', () => {
  let env: RulesTestEnvironment;

  beforeAll(async () => { env = await getTestEnv(); });
  afterAll(async  () => { await closeTestEnv(); });
  beforeEach(async () => {
    await env.clearFirestore();
    await seedBaseline(env);
  });

  it('store toggle + fee update + full status lifecycle + cancel refund', async () => {
    const owner = await ownerCtx(env);
    const guest = await guestCtx(env);

    // -- Step 1: owner closes the store; new orders are blocked ---------
    await env.withSecurityRulesDisabled(async (c) => {
      await updateDoc(doc(c.firestore(), 'store_settings/default'), { isStoreOpen: false });
    });
    await expect(
      placeOrderWith(fs(guest), {
        userId: null, customerName: 'Blocked', phoneNumber: '+972501234567',
        deliveryAddress: { addressLine1: '1', city: 'Tel Aviv' },
        fulfillmentType: 'delivery', paymentMethod: 'cash', notes: null,
        lines: [{ productId: 'prod-margherita', productName: 'Margherita', quantity: 1, unitPrice: 42 }],
      })
    ).rejects.toThrow(/closed/i);

    // -- Step 2: owner re-opens and raises the delivery fee -------------
    await env.withSecurityRulesDisabled(async (c) => {
      await updateDoc(doc(c.firestore(), 'store_settings/default'), {
        isStoreOpen: true,
        deliveryFee: 20,
      });
    });

    // -- Step 3: a fresh order arrives (uses the NEW fee — anti-stale) --
    const { order } = await placeOrderWith(fs(guest), {
      userId: null, customerName: 'Dana', phoneNumber: '+972501110100',
      deliveryAddress: { addressLine1: '1', city: 'Tel Aviv' },
      fulfillmentType: 'delivery', paymentMethod: 'cash', notes: null,
      lines: [{ productId: 'prod-margherita', productName: 'Margherita', quantity: 2, unitPrice: 42 }],
    });
    expect(order.deliveryFee).toBe(20);
    expect(order.totalAmount).toBe(104);

    // -- Step 4: owner advances pending → preparing → out_for_delivery --
    await updateOrderStatusWith(fs(owner), order.id, 'preparing');
    await updateOrderStatusWith(fs(owner), order.id, 'out_for_delivery');

    // WhatsApp dispatch formatting at each step (owner taps the button).
    const asOrder = (status: Order['status']): Order => ({ ...order, status });
    expect(buildStatusMessage(asOrder('preparing'), 'preparing')).toContain('being prepared');
    expect(buildStatusMessage(asOrder('out_for_delivery'), 'out_for_delivery')).toContain('out for delivery');
    expect(buildWhatsAppLink(order.phoneNumber, 'x')).toContain('wa.me/972501110100');

    // -- Step 5: illegal transition is refused (skip delivered → pending)
    await expect(
      updateOrderStatusWith(fs(owner), order.id, 'pending')
    ).rejects.toThrow(/[Ii]llegal/);

    // -- Step 6: owner cancels → stock refunded atomically --------------
    await env.withSecurityRulesDisabled(async (c) => {
      expect(((await getDoc(doc(c.firestore(), 'products/prod-margherita'))).data() as any).stockQuantity).toBe(18);
    });
    await updateOrderStatusWith(fs(owner), order.id, 'cancelled');
    await env.withSecurityRulesDisabled(async (c) => {
      expect(((await getDoc(doc(c.firestore(), 'products/prod-margherita'))).data() as any).stockQuantity).toBe(20);
      const finalOrder = (await getDoc(doc(c.firestore(), `orders/${order.id}`))).data() as any;
      expect(finalOrder.status).toBe('cancelled');
    });

    // -- Step 7: terminal state — nothing can resurrect it --------------
    await expect(
      updateOrderStatusWith(fs(owner), order.id, 'delivered')
    ).rejects.toThrow(/[Ii]llegal/);
  });
});
