// ---------------------------------------------------------------------------
// C. Text Field Sanitization & Malicious Payloads.
//
// We do NOT html-escape the user's inputs at write time (that would corrupt
// legitimate data and is a UI-layer concern). Instead the system is
// JSON-safe end-to-end:
//
//   * Firestore stores the raw bytes
//   * The React Native UI only ever renders strings through <Text> which
//     does not interpret HTML / JS
//   * The export path (CSV, if any) will escape at serialization time
//
// What this suite guarantees from the business-rule side is:
//
//   * `customerName`, `notes`, phone, and the address blob all respect
//     their LENGTH limits even when callers try to smuggle gigantic
//     payloads (DoS surface).
//   * The round-trip preserves the exact bytes the caller submitted (no
//     silent coercion / stripping that would mask a stored-XSS attempt
//     during a later audit).
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

const base = {
  userId: null,
  phoneNumber: '+972501234567',
  deliveryAddress: { addressLine1: '1', city: 'Tel Aviv' },
  fulfillmentType: 'delivery' as const,
  paymentMethod: 'cash' as const,
  lines: [{ productId: 'prod-margherita', productName: 'Margherita', quantity: 1, unitPrice: 42 }],
};

describeIfEmulator('text sanitization', () => {
  let env: RulesTestEnvironment;

  beforeAll(async () => { env = await getTestEnv(); });
  afterAll(async  () => { await closeTestEnv(); });
  beforeEach(async () => {
    await env.clearFirestore();
    await seedBaseline(env);
  });

  it('round-trips HTML / SQL / XSS payloads verbatim (no silent coercion)', async () => {
    const ctx = await guestCtx(env);
    const nasty = `<script>alert(1)</script>'); DROP TABLE orders;--`;
    const { order } = await placeOrderWith(fs(ctx), {
      ...base,
      customerName: nasty,
      notes: nasty,
    });

    await env.withSecurityRulesDisabled(async (c) => {
      const data = (await getDoc(doc(c.firestore(), `orders/${order.id}`))).data() as any;
      expect(data.customerName).toBe(nasty);
      expect(data.notes).toBe(nasty);
    });
  });

  it('rejects customerName longer than 200 characters', async () => {
    const ctx = await guestCtx(env);
    const bigName = 'a'.repeat(201);
    await expect(
      placeOrderWith(fs(ctx), { ...base, customerName: bigName, notes: null })
    ).rejects.toThrow(/customer name/i);
  });

  it('rejects notes longer than 2000 characters', async () => {
    const ctx = await guestCtx(env);
    const bigNotes = 'n'.repeat(2001);
    await expect(
      placeOrderWith(fs(ctx), { ...base, customerName: 'Bob', notes: bigNotes })
    ).rejects.toThrow(/notes/i);
  });

  it('rejects a mega-sized address blob (anti-DoS)', async () => {
    const ctx = await guestCtx(env);
    const big = 'x'.repeat(9000);
    await expect(
      placeOrderWith(fs(ctx), {
        ...base,
        customerName: 'Bob',
        notes: null,
        deliveryAddress: { addressLine1: big, city: 'TLV' },
      })
    ).rejects.toThrow(/address/i);
  });
});
