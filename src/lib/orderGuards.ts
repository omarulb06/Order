// ---------------------------------------------------------------------------
// Pure business-rule guards. Everything in this file is a side-effect-free
// function so it can be unit-tested without React Native or Firestore.
//
// These guards MUST be mirrored by the Firestore transaction logic in
// src/lib/firestore/orders.ts and by firestore.rules — a malicious client
// who bypasses the UI (direct REST, forged payloads, altered Zustand) is
// still rejected server-side.
//
// Field names mirror the Firestore document shape per src/types/database.ts
// (camelCase).
// ---------------------------------------------------------------------------

import type {
  FulfillmentType,
  OrderStatus,
  PaymentMethod,
  StoreSettings,
} from '@/types/database';
import type { CartLineLike } from './pricing';
import { assertStoreOpen } from './storeHours';

export { assertStoreOpen, isStoreAcceptingOrders } from './storeHours';

// ---------------------------------------------------------------------------
// 1. Order status state machine
// ---------------------------------------------------------------------------

/**
 * Legal status transitions for a live order.
 *
 *   pending ──► preparing ──► out_for_delivery ──► delivered
 *      │           │                 │
 *      └───────────┴─────────────────┴──────────► cancelled
 *
 * Terminal states (delivered / cancelled) accept no further transitions
 * — not even "no-op" self-transitions, so an attacker cannot resurrect
 * a cancelled order into delivered.
 */
export const LEGAL_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  pending:          ['preparing', 'cancelled'],
  preparing:        ['out_for_delivery', 'cancelled'],
  out_for_delivery: ['delivered',       'cancelled'],
  delivered:        [],
  cancelled:        [],
};

export function isLegalStatusTransition(
  from: OrderStatus,
  to: OrderStatus
): boolean {
  if (from === to) return false;
  return (LEGAL_TRANSITIONS[from] ?? []).includes(to);
}

export function assertLegalStatusTransition(
  from: OrderStatus,
  to: OrderStatus
): void {
  if (!isLegalStatusTransition(from, to)) {
    throw new OrderGuardError(
      `Illegal status transition: "${from}" → "${to}".`,
      'illegal_status_transition'
    );
  }
}

// ---------------------------------------------------------------------------
// 2. Payment-method / fulfillment-type gating
// ---------------------------------------------------------------------------

export function assertPaymentEnabled(
  settings: Pick<StoreSettings, 'paymentMethods'> | null | undefined,
  method: PaymentMethod | string
): void {
  const methods = (settings?.paymentMethods ?? {}) as Record<string, boolean>;
  if (!methods[method]) {
    throw new OrderGuardError(
      `Payment method "${method}" is disabled by the store.`,
      'payment_disabled'
    );
  }
}

export function assertFulfillmentEnabled(
  settings:
    | Pick<StoreSettings, 'isDeliveryEnabled' | 'isPickupEnabled'>
    | null
    | undefined,
  type: FulfillmentType
): void {
  if (type === 'delivery' && settings?.isDeliveryEnabled === false) {
    throw new OrderGuardError(
      'Delivery is currently disabled by the store.',
      'delivery_disabled'
    );
  }
  if (type === 'pickup' && settings?.isPickupEnabled === false) {
    throw new OrderGuardError(
      'Pickup is currently disabled by the store.',
      'pickup_disabled'
    );
  }
  if (type !== 'delivery' && type !== 'pickup') {
    throw new OrderGuardError(
      `Unknown fulfillment type: "${type}".`,
      'unknown_fulfillment'
    );
  }
}

// ---------------------------------------------------------------------------
// 3. Minimum-order enforcement (mirror of transaction check)
// ---------------------------------------------------------------------------

export function assertMinOrder(
  subtotal: number,
  settings: Pick<StoreSettings, 'minOrderAmount'> | null | undefined
): void {
  const minOrder = Number(settings?.minOrderAmount ?? 0);
  if (!Number.isFinite(subtotal) || subtotal < 0) {
    throw new OrderGuardError('Invalid subtotal.', 'invalid_subtotal');
  }
  if (subtotal < minOrder) {
    throw new OrderGuardError(
      `Minimum order is ${minOrder.toFixed(2)}; subtotal is ${subtotal.toFixed(2)}.`,
      'below_minimum'
    );
  }
}

// ---------------------------------------------------------------------------
// 4. Server-authoritative total check
// ---------------------------------------------------------------------------

/**
 * Recompute the expected total from the cart lines + delivery fee and
 * compare it to what the client is about to submit. The Firestore
 * transaction re-verifies this against the LIVE store_settings document.
 */
export function assertTotalMatchesCart(
  claimedTotal: number,
  lines: CartLineLike[],
  deliveryFee: number
): void {
  const sum = lines.reduce(
    (s, l) => s + l.quantity * (l.product.price ?? 0),
    0
  );
  const expected = round2(sum + Number(deliveryFee ?? 0));
  const actual   = round2(Number(claimedTotal));
  if (expected !== actual) {
    throw new OrderGuardError(
      `Total mismatch: client claimed ${actual.toFixed(2)}, cart implies ${expected.toFixed(2)}.`,
      'total_mismatch'
    );
  }
}

// ---------------------------------------------------------------------------
// 5. Quantity guards (mirror of Firestore transaction + security rule)
// ---------------------------------------------------------------------------

export const MAX_LINE_QUANTITY = 1000;

export function assertQuantity(qty: unknown): asserts qty is number {
  if (typeof qty !== 'number' || !Number.isFinite(qty)) {
    throw new OrderGuardError('Quantity must be a number.', 'invalid_quantity');
  }
  if (!Number.isInteger(qty)) {
    throw new OrderGuardError(
      `Quantity must be a whole number (got ${qty}).`,
      'invalid_quantity'
    );
  }
  if (qty < 1) {
    throw new OrderGuardError(
      `Quantity must be at least 1 (got ${qty}).`,
      'invalid_quantity'
    );
  }
  if (qty > MAX_LINE_QUANTITY) {
    throw new OrderGuardError(
      `Quantity may not exceed ${MAX_LINE_QUANTITY} (got ${qty}).`,
      'invalid_quantity'
    );
  }
}

export function assertAllLineQuantities(lines: CartLineLike[]): void {
  for (const line of lines) {
    assertQuantity(line.quantity);
  }
}

// ---------------------------------------------------------------------------
// 6. Composite pre-flight — run before every submit
// ---------------------------------------------------------------------------

export interface SubmitPreflightInput {
  settings:
    | Pick<
        StoreSettings,
        | 'paymentMethods'
        | 'isDeliveryEnabled'
        | 'isPickupEnabled'
        | 'minOrderAmount'
        | 'isStoreOpen'
        | 'businessHours'
      >
    | null
    | undefined;
  fulfillment: FulfillmentType;
  payment: PaymentMethod | string;
  lines: CartLineLike[];
  subtotal: number;
  total: number;
  deliveryFee: number;
}

export function assertSubmittable(input: SubmitPreflightInput): void {
  assertStoreOpen(input.settings);
  assertFulfillmentEnabled(input.settings, input.fulfillment);
  assertPaymentEnabled(input.settings, input.payment);
  assertAllLineQuantities(input.lines);
  assertMinOrder(input.subtotal, input.settings);
  assertTotalMatchesCart(input.total, input.lines, input.deliveryFee);
  if (input.lines.length === 0) {
    throw new OrderGuardError('Cart is empty.', 'empty_cart');
  }
}

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

export type OrderGuardCode =
  | 'illegal_status_transition'
  | 'payment_disabled'
  | 'delivery_disabled'
  | 'pickup_disabled'
  | 'unknown_fulfillment'
  | 'invalid_subtotal'
  | 'invalid_quantity'
  | 'below_minimum'
  | 'total_mismatch'
  | 'empty_cart';

export class OrderGuardError extends Error {
  code: OrderGuardCode;
  constructor(message: string, code: OrderGuardCode) {
    super(message);
    this.name = 'OrderGuardError';
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
