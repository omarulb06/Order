import {
  computeOrderTotals,
  computeSubtotal,
  isPaymentEnabled,
  validateCartStock,
} from '@/lib/pricing';
import type { StoreSettings } from '@/types/database';

const settings: Pick<StoreSettings, 'deliveryFee' | 'minOrderAmount' | 'paymentMethods'> = {
  deliveryFee: 15,
  minOrderAmount: 30,
  paymentMethods: { cash: true, stripe: false, card: false, apple_pay: false, google_pay: false },
};

const bananas  = { id: 'b', price: 8,  stockQuantity: 100, isAvailable: true  };
const spinach  = { id: 's', price: 10, stockQuantity: 2,   isAvailable: true  };
const tomatoes = { id: 't', price: 11, stockQuantity: 0,   isAvailable: false };
const croissant= { id: 'c', price: 6,  stockQuantity: 0,   isAvailable: false };

describe('computeSubtotal', () => {
  it('is 0 for an empty cart', () => {
    expect(computeSubtotal([])).toBe(0);
  });

  it('sums quantity × unitPrice', () => {
    expect(
      computeSubtotal([
        { product: bananas, quantity: 2 }, // 16
        { product: spinach, quantity: 1 }, // 10
      ])
    ).toBe(26);
  });

  it('rounds to 2 decimals (floating-point safe)', () => {
    expect(
      computeSubtotal([
        { product: { id: 'x', price: 0.1 }, quantity: 2 }, // 0.2
        { product: { id: 'y', price: 0.1 }, quantity: 1 }, // 0.1
      ])
    ).toBe(0.3);
  });
});

describe('computeOrderTotals', () => {
  it('adds deliveryFee for delivery orders', () => {
    const totals = computeOrderTotals(
      [{ product: bananas, quantity: 2 }],
      settings,
      'delivery'
    );
    expect(totals.subtotal).toBe(16);
    expect(totals.deliveryFee).toBe(15);
    expect(totals.total).toBe(31);
  });

  it('zeroes deliveryFee for pickup orders', () => {
    const totals = computeOrderTotals(
      [{ product: bananas, quantity: 4 }],
      settings,
      'pickup'
    );
    expect(totals.subtotal).toBe(32);
    expect(totals.deliveryFee).toBe(0);
    expect(totals.total).toBe(32);
  });

  it('flags belowMinimum and reports amount to reach it', () => {
    const totals = computeOrderTotals(
      [{ product: bananas, quantity: 1 }], // subtotal 8, min 30
      settings,
      'delivery'
    );
    expect(totals.belowMinimum).toBe(true);
    expect(totals.amountToReachMinimum).toBe(22);
  });

  it('reports 0 amount-to-reach when the minimum is exactly met', () => {
    const totals = computeOrderTotals(
      [{ product: { id: 'x', price: 30 }, quantity: 1 }],
      settings,
      'pickup'
    );
    expect(totals.belowMinimum).toBe(false);
    expect(totals.amountToReachMinimum).toBe(0);
  });

  it('handles null/undefined settings gracefully', () => {
    const totals = computeOrderTotals(
      [{ product: bananas, quantity: 2 }],
      null,
      'delivery'
    );
    expect(totals.deliveryFee).toBe(0);
    expect(totals.total).toBe(16);
    expect(totals.belowMinimum).toBe(false);
  });
});

describe('validateCartStock', () => {
  it('passes a healthy cart', () => {
    expect(
      validateCartStock([
        { product: bananas, quantity: 2 },
        { product: spinach, quantity: 1 },
      ])
    ).toEqual([]);
  });

  it('rejects out-of-stock products', () => {
    const errs = validateCartStock([{ product: tomatoes, quantity: 1 }]);
    expect(errs).toHaveLength(1);
    expect(errs[0].reason).toBe('unavailable');
  });

  it('rejects unavailable (soft-hidden) products', () => {
    const errs = validateCartStock([{ product: croissant, quantity: 1 }]);
    expect(errs).toHaveLength(1);
    expect(errs[0].reason).toBe('unavailable');
  });

  it('rejects quantities above available stock', () => {
    const errs = validateCartStock([{ product: spinach, quantity: 5 }]);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatchObject({
      productId: 's',
      reason: 'insufficient_stock',
      requested: 5,
      available: 2,
    });
  });
});

describe('isPaymentEnabled', () => {
  it('matches the active method flags', () => {
    expect(isPaymentEnabled(settings, 'cash')).toBe(true);
    expect(isPaymentEnabled(settings, 'stripe')).toBe(false);
    expect(isPaymentEnabled(settings, 'apple_pay')).toBe(false);
  });

  it('returns false for unknown methods', () => {
    expect(isPaymentEnabled(settings, 'crypto')).toBe(false);
  });

  it('returns false when settings are missing', () => {
    expect(isPaymentEnabled(null, 'cash')).toBe(false);
    expect(isPaymentEnabled(undefined, 'stripe')).toBe(false);
  });
});
