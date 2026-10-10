/**
 * Pure business-rule guard tests — mirrors src/lib/orderGuards.ts
 *
 * Every guard here MUST also be enforced by the DB
 * (supabase/migrations/20260101000005_business_rules.sql). The point of
 * these tests is to make the client-side mirror unbypassable at the UI
 * layer; the DB tests in __tests__/integration/businessRules.test.ts
 * cover the server-side counterpart.
 */
import {
  LEGAL_TRANSITIONS,
  MAX_LINE_QUANTITY,
  OrderGuardError,
  assertAllLineQuantities,
  assertFulfillmentEnabled,
  assertLegalStatusTransition,
  assertMinOrder,
  assertPaymentEnabled,
  assertQuantity,
  assertSubmittable,
  assertTotalMatchesCart,
  isLegalStatusTransition,
} from '@/lib/orderGuards';
import type { OrderStatus, StoreSettings } from '@/types/database';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ALL_STATUSES: OrderStatus[] = [
  'pending',
  'preparing',
  'out_for_delivery',
  'delivered',
  'cancelled',
];

const baseSettings = (
  overrides?: Partial<StoreSettings>
): Partial<StoreSettings> => ({
  deliveryFee: 15,
  minOrderAmount: 30,
  isDeliveryEnabled: true,
  isPickupEnabled: true,
  paymentMethods: { cash: true, stripe: false, card: false, apple_pay: false, google_pay: false },
  ...overrides,
});

const line = (price: number, qty = 1, id = 'p') => ({
  product: { id, price, stockQuantity: 100, isAvailable: true },
  quantity: qty,
});

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

describe('State machine — isLegalStatusTransition', () => {
  it('exposes exactly the documented transitions', () => {
    expect(LEGAL_TRANSITIONS.pending).toEqual(['preparing', 'cancelled']);
    expect(LEGAL_TRANSITIONS.preparing).toEqual(['out_for_delivery', 'cancelled']);
    expect(LEGAL_TRANSITIONS.out_for_delivery).toEqual(['delivered', 'cancelled']);
    expect(LEGAL_TRANSITIONS.delivered).toEqual([]);
    expect(LEGAL_TRANSITIONS.cancelled).toEqual([]);
  });

  // Full matrix: 5 × 5 = 25 pairs, 7 legal, 18 illegal
  for (const from of ALL_STATUSES) {
    for (const to of ALL_STATUSES) {
      const legal = (LEGAL_TRANSITIONS[from] ?? []).includes(to);
      const label = `${from} → ${to}`;
      it(`${legal ? 'allows' : 'rejects'} ${label}`, () => {
        expect(isLegalStatusTransition(from, to)).toBe(legal);
      });
    }
  }

  it('rejects same-status "transitions" (no self-loops)', () => {
    for (const s of ALL_STATUSES) {
      expect(isLegalStatusTransition(s, s)).toBe(false);
    }
  });

  it('terminal state attacks — delivered → anything is rejected', () => {
    for (const to of ALL_STATUSES) {
      expect(isLegalStatusTransition('delivered', to)).toBe(false);
    }
  });

  it('terminal state attacks — cancelled → anything is rejected', () => {
    for (const to of ALL_STATUSES) {
      expect(isLegalStatusTransition('cancelled', to)).toBe(false);
    }
  });

  it('cannot resurrect a cancelled order into delivered', () => {
    expect(() => assertLegalStatusTransition('cancelled', 'delivered')).toThrow(
      OrderGuardError
    );
  });

  it('cannot skip stages (pending → delivered directly)', () => {
    expect(() => assertLegalStatusTransition('pending', 'delivered')).toThrow(
      /Illegal status transition/
    );
  });

  it('cannot go backwards (preparing → pending)', () => {
    expect(() => assertLegalStatusTransition('preparing', 'pending')).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Payment / fulfillment gating
// ---------------------------------------------------------------------------

describe('assertPaymentEnabled', () => {
  it('allows cash when cash=true', () => {
    expect(() => assertPaymentEnabled(baseSettings() as any, 'cash')).not.toThrow();
  });

  it('rejects stripe when stripe=false (default fixture)', () => {
    expect(() => assertPaymentEnabled(baseSettings() as any, 'stripe')).toThrow(
      /disabled/
    );
    expect(() => assertPaymentEnabled(baseSettings() as any, 'stripe')).toThrow(
      OrderGuardError
    );
  });

  it('allows a method after owner enables it', () => {
    const s = baseSettings({
      paymentMethods: { cash: true, stripe: true, card: true, apple_pay: false, google_pay: false },
    }) as any;
    expect(() => assertPaymentEnabled(s, 'stripe')).not.toThrow();
  });

  it('rejects an unknown payment method', () => {
    expect(() => assertPaymentEnabled(baseSettings() as any, 'bitcoin')).toThrow();
  });

  it('rejects when settings are null/undefined', () => {
    expect(() => assertPaymentEnabled(null, 'cash')).toThrow();
    expect(() => assertPaymentEnabled(undefined, 'cash')).toThrow();
  });

  it('attaches the "payment_disabled" error code', () => {
    try {
      assertPaymentEnabled(baseSettings() as any, 'stripe');
      fail('should have thrown');
    } catch (e: any) {
      expect(e.code).toBe('payment_disabled');
    }
  });
});

describe('assertFulfillmentEnabled', () => {
  it('allows delivery when enabled', () => {
    expect(() =>
      assertFulfillmentEnabled(baseSettings() as any, 'delivery')
    ).not.toThrow();
  });

  it('rejects delivery when disabled', () => {
    const s = baseSettings({ isDeliveryEnabled: false }) as any;
    expect(() => assertFulfillmentEnabled(s, 'delivery')).toThrow(
      /Delivery is currently disabled/
    );
  });

  it('rejects pickup when disabled', () => {
    const s = baseSettings({ isPickupEnabled: false }) as any;
    expect(() => assertFulfillmentEnabled(s, 'pickup')).toThrow(/Pickup/);
  });

  it('rejects an unknown fulfillment type', () => {
    expect(() =>
      assertFulfillmentEnabled(baseSettings() as any, 'teleport' as any)
    ).toThrow(/Unknown fulfillment/);
  });

  it('does not throw when settings are missing (defaults to enabled)', () => {
    expect(() => assertFulfillmentEnabled(null, 'delivery')).not.toThrow();
    expect(() => assertFulfillmentEnabled(undefined, 'pickup')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Minimum order
// ---------------------------------------------------------------------------

describe('assertMinOrder', () => {
  const s = baseSettings() as any; // min = 30

  it('passes when subtotal >= min', () => {
    expect(() => assertMinOrder(30, s)).not.toThrow();
    expect(() => assertMinOrder(100, s)).not.toThrow();
  });

  it('rejects when subtotal < min', () => {
    expect(() => assertMinOrder(29.99, s)).toThrow(/Minimum order/);
    expect(() => assertMinOrder(0, s)).toThrow(/Minimum order/);
  });

  it('rejects a negative subtotal', () => {
    expect(() => assertMinOrder(-5, s)).toThrow(/Invalid subtotal/);
  });

  it('rejects NaN / Infinity', () => {
    expect(() => assertMinOrder(Number.NaN, s)).toThrow();
    expect(() => assertMinOrder(Number.POSITIVE_INFINITY, s)).toThrow();
  });

  it('treats missing minOrderAmount as 0', () => {
    expect(() => assertMinOrder(0.01, null)).not.toThrow();
    expect(() =>
      assertMinOrder(0, baseSettings({ minOrderAmount: 0 }) as any)
    ).not.toThrow();
  });

  it('attaches the "below_minimum" error code', () => {
    try {
      assertMinOrder(1, s);
      fail('should have thrown');
    } catch (e: any) {
      expect(e.code).toBe('below_minimum');
    }
  });
});

// ---------------------------------------------------------------------------
// Total consistency (anti-tamper)
// ---------------------------------------------------------------------------

describe('assertTotalMatchesCart', () => {
  it('passes when claimed total = sum + fee', () => {
    expect(() =>
      assertTotalMatchesCart(55, [line(20, 2), line(5, 3)], 0)
    ).not.toThrow();
    expect(() =>
      assertTotalMatchesCart(55, [line(10, 4)], 15)
    ).not.toThrow();
  });

  it('rejects when client under-reports the total', () => {
    expect(() =>
      assertTotalMatchesCart(10, [line(20, 2)], 15)
    ).toThrow(/Total mismatch/);
  });

  it('rejects when client over-reports the total', () => {
    expect(() =>
      assertTotalMatchesCart(999, [line(20, 2)], 15)
    ).toThrow(/Total mismatch/);
  });

  it('is floating-point safe (0.1 × 3 + 0.1 fee)', () => {
    expect(() =>
      assertTotalMatchesCart(0.4, [line(0.1, 3)], 0.1)
    ).not.toThrow();
  });

  it('attaches the "total_mismatch" error code', () => {
    try {
      assertTotalMatchesCart(100, [line(10, 1)], 0);
      fail('should have thrown');
    } catch (e: any) {
      expect(e.code).toBe('total_mismatch');
    }
  });
});

// ---------------------------------------------------------------------------
// Composite submit pre-flight
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Quantity guards (edge case A)
// ---------------------------------------------------------------------------

describe('assertQuantity', () => {
  it.each([1, 2, 10, 999, MAX_LINE_QUANTITY])('accepts %d', (q) => {
    expect(() => assertQuantity(q)).not.toThrow();
  });

  it.each([
    ['zero', 0],
    ['negative', -1],
    ['negative large', -999],
    ['over max', MAX_LINE_QUANTITY + 1],
    ['way over max', 999_999],
  ])('rejects %s (%s)', (_label, q) => {
    expect(() => assertQuantity(q)).toThrow(OrderGuardError);
  });

  it.each([
    ['fractional', 1.5],
    ['tiny fractional', 1.0001],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
  ])('rejects non-integer %s (%s)', (_label, q) => {
    expect(() => assertQuantity(q as number)).toThrow(/whole number|must be a number/);
  });

  it.each([
    ['string', '3'],
    ['null', null],
    ['undefined', undefined],
    ['object', {}],
    ['array', [1]],
    ['boolean', true],
  ])('rejects non-number %s', (_label, q) => {
    expect(() => assertQuantity(q)).toThrow(/must be a number/);
  });

  it('attaches "invalid_quantity" error code', () => {
    try {
      assertQuantity(-1);
      fail('should have thrown');
    } catch (e: any) {
      expect(e.code).toBe('invalid_quantity');
    }
  });
});

describe('assertAllLineQuantities', () => {
  const good = { product: { id: 'p', price: 1, stockQuantity: 100, isAvailable: true }, quantity: 2 };
  const bad  = { product: { id: 'p', price: 1, stockQuantity: 100, isAvailable: true }, quantity: -1 };

  it('passes a healthy cart', () => {
    expect(() => assertAllLineQuantities([good, good])).not.toThrow();
  });

  it('rejects on first bad line', () => {
    expect(() => assertAllLineQuantities([good, bad, good])).toThrow(OrderGuardError);
  });

  it('empty list is allowed (empty-cart check elsewhere)', () => {
    expect(() => assertAllLineQuantities([])).not.toThrow();
  });
});

describe('assertSubmittable (composite)', () => {
  const goodInput = () => ({
    settings: baseSettings() as any,
    fulfillment: 'delivery' as const,
    payment: 'cash' as const,
    lines: [line(20, 2)], // 40 subtotal
    subtotal: 40,
    total: 55, // 40 + 15 delivery fee
    deliveryFee: 15,
  });

  it('accepts a well-formed submit', () => {
    expect(() => assertSubmittable(goodInput())).not.toThrow();
  });

  it('rejects when payment is disabled', () => {
    const i = goodInput();
    i.payment = 'stripe' as any;
    expect(() => assertSubmittable(i)).toThrow(/disabled/);
  });

  it('rejects when fulfillment is disabled', () => {
    const i = goodInput();
    i.settings = baseSettings({ isDeliveryEnabled: false }) as any;
    expect(() => assertSubmittable(i)).toThrow(/Delivery/);
  });

  it('rejects when below minimum', () => {
    const i = goodInput();
    i.lines = [line(10, 1)];
    i.subtotal = 10;
    i.total = 25;
    expect(() => assertSubmittable(i)).toThrow(/Minimum/);
  });

  it('rejects when the total has been tampered with', () => {
    const i = goodInput();
    i.total = 1; // claim $1
    expect(() => assertSubmittable(i)).toThrow(/Total mismatch/);
  });

  it('rejects an empty cart', () => {
    const i = goodInput();
    i.lines = [];
    i.subtotal = 0;
    i.total = 15;
    expect(() => assertSubmittable(i)).toThrow(); // below minimum first
  });

  it('rejects when any line quantity is bogus (fractional)', () => {
    const i = goodInput();
    (i.lines[0] as any).quantity = 1.5;
    expect(() => assertSubmittable(i)).toThrow(/whole number|must be a number/);
  });

  it('rejects when a line quantity exceeds the per-line cap', () => {
    const i = goodInput();
    i.lines = [{ ...i.lines[0], quantity: MAX_LINE_QUANTITY + 1 }];
    i.subtotal = (MAX_LINE_QUANTITY + 1) * 20;
    i.total = i.subtotal + 15;
    expect(() => assertSubmittable(i)).toThrow(/exceed/);
  });
});
