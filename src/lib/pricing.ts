// ---------------------------------------------------------------------------
// Pure cart / pricing helpers.
//
// Extracted from the checkout screen so they're trivially unit-testable and
// safe to call from both client (React Native) and server (Node test
// runner) code — zero imports from `react-native` or any native module.
//
// NOTE: field names here mirror the Firestore document shape
// (`deliveryFee`, `minOrderAmount`, `paymentMethods`, `isAvailable`,
// `stockQuantity`) per src/types/database.ts.
// ---------------------------------------------------------------------------

import type { FulfillmentType, StoreSettings } from '@/types/database';

export interface CartLineLike {
  product: {
    id: string;
    price: number;
    stockQuantity?: number;
    isAvailable?: boolean;
  };
  quantity: number;
}

export interface OrderTotals {
  subtotal: number;       // sum of quantity × unitPrice
  deliveryFee: number;    // 0 for pickup, settings.deliveryFee otherwise
  total: number;          // subtotal + deliveryFee
  belowMinimum: boolean;  // true if subtotal < minOrderAmount
  amountToReachMinimum: number; // minOrderAmount - subtotal (0 if met)
}

/**
 * Compute the subtotal of a cart. Zero-safe (empty cart → 0).
 */
export function computeSubtotal(lines: CartLineLike[]): number {
  return round2(
    lines.reduce((sum, l) => sum + l.quantity * (l.product.price ?? 0), 0)
  );
}

/**
 * Compute the full order totals given the cart, store settings, and the
 * user's chosen fulfillment method. Pickup orders always carry zero
 * delivery fee regardless of what the settings say.
 */
export function computeOrderTotals(
  lines: CartLineLike[],
  settings: Pick<StoreSettings, 'deliveryFee' | 'minOrderAmount'> | null | undefined,
  fulfillment: FulfillmentType
): OrderTotals {
  const subtotal = computeSubtotal(lines);
  const deliveryFee =
    fulfillment === 'delivery' ? round2(Number(settings?.deliveryFee ?? 0)) : 0;
  const minOrder = round2(Number(settings?.minOrderAmount ?? 0));
  const belowMinimum = subtotal < minOrder;
  const amountToReachMinimum = round2(Math.max(0, minOrder - subtotal));

  return {
    subtotal,
    deliveryFee,
    total: round2(subtotal + deliveryFee),
    belowMinimum,
    amountToReachMinimum,
  };
}

/**
 * Reject a cart that references any out-of-stock or unavailable product.
 * Returned list contains one error per offending line.
 */
export interface StockViolation {
  productId: string;
  reason: 'unavailable' | 'out_of_stock' | 'insufficient_stock';
  requested: number;
  available: number;
}

export function validateCartStock(lines: CartLineLike[]): StockViolation[] {
  const violations: StockViolation[] = [];
  for (const line of lines) {
    const available = line.product.stockQuantity ?? Number.POSITIVE_INFINITY;
    if (line.product.isAvailable === false) {
      violations.push({
        productId: line.product.id,
        reason: 'unavailable',
        requested: line.quantity,
        available,
      });
      continue;
    }
    if (available === 0) {
      violations.push({
        productId: line.product.id,
        reason: 'out_of_stock',
        requested: line.quantity,
        available: 0,
      });
      continue;
    }
    if (line.quantity > available) {
      violations.push({
        productId: line.product.id,
        reason: 'insufficient_stock',
        requested: line.quantity,
        available,
      });
    }
  }
  return violations;
}

/**
 * Return true iff the given payment method key is enabled on the store.
 */
export function isPaymentEnabled(
  settings: Pick<StoreSettings, 'paymentMethods'> | null | undefined,
  method: string
): boolean {
  const methods = settings?.paymentMethods ?? {};
  return !!(methods as Record<string, boolean>)[method];
}

function round2(n: number): number {
  // Avoid floating-point noise in money math (0.1 + 0.2 → 0.3).
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
