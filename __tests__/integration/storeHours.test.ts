// ---------------------------------------------------------------------------
// Store open/closed gate — the placeOrder transaction must refuse orders
// when the LIVE settings doc says the store is closed, regardless of what
// the client's cached settings said when the cart was built.
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
  customerName: 'Hours Tester',
  phoneNumber: '+972501234567',
  deliveryAddress: { addressLine1: '1', city: 'Tel Aviv' },
  fulfillmentType: 'delivery' as const,
  paymentMethod: 'cash' as const,
  notes: null,
  lines: [{ productId: 'prod-margherita', productName: 'Margherita', quantity: 1, unitPrice: 42 }],
};

const closedAllWeek = {
  sunday:    { open: '08:00', close: '22:00', active: false },
  monday:    { open: '08:00', close: '22:00', active: false },
  tuesday:   { open: '08:00', close: '22:00', active: false },
  wednesday: { open: '08:00', close: '22:00', active: false },
  thursday:  { open: '08:00', close: '22:00', active: false },
  friday:    { open: '08:00', close: '22:00', active: false },
  saturday:  { open: '08:00', close: '22:00', active: false },
};

const openAllWeek = Object.fromEntries(
  Object.entries(closedAllWeek).map(([k, v]) => [k, { ...v, open: '00:00', close: '00:00', active: true }])
);

describeIfEmulator('store hours gate (placeOrder)', () => {
  let env: RulesTestEnvironment;

  beforeAll(async () => { env = await getTestEnv(); });
  afterAll(async  () => { await closeTestEnv(); });
  beforeEach(async () => {
    await env.clearFirestore();
    await seedBaseline(env);
  });

  it('rejects when isStoreOpen = false (master switch)', async () => {
    await seedBaseline(env, { isStoreOpen: false });
    const ctx = await guestCtx(env);
    await expect(placeOrderWith(fs(ctx), base)).rejects.toThrow(/closed/i);
  });

  it('rejects when every day is inactive (outside operating hours)', async () => {
    await seedBaseline(env, { isStoreOpen: true, businessHours: closedAllWeek });
    const ctx = await guestCtx(env);
    await expect(placeOrderWith(fs(ctx), base)).rejects.toThrow(/business hours/i);
  });

  it('accepts when the store is open 24/7', async () => {
    await seedBaseline(env, { isStoreOpen: true, businessHours: openAllWeek });
    const ctx = await guestCtx(env);
    await expect(placeOrderWith(fs(ctx), base)).resolves.toBeDefined();
  });

  it('owner re-opening the store immediately unblocks checkout (live read)', async () => {
    await seedBaseline(env, { isStoreOpen: false });
    const ctx = await guestCtx(env);
    await expect(placeOrderWith(fs(ctx), base)).rejects.toThrow(/closed/i);

    await seedBaseline(env, { isStoreOpen: true, businessHours: openAllWeek });
    await expect(placeOrderWith(fs(ctx), base)).resolves.toBeDefined();
  });
});
