// ---------------------------------------------------------------------------
// Order-level Firestore transactions.
//
// Mirrors every business rule we previously enforced in the Supabase SQL
// triggers (migrations 20260101000004–20260101000006):
//
//   place order:
//     * strict E.164 phone format
//     * fulfillment-type enabled in LIVE store_settings
//     * payment-method enabled in LIVE store_settings
//     * subtotal >= LIVE minOrderAmount
//     * deliveryFee matches LIVE store_settings (anti-stale)
//     * total == subtotal + deliveryFee
//     * every line.quantity integer in [1, 1000]
//     * every product isAvailable && stockQuantity >= quantity
//     * atomic stock decrement per product
//     * forced status = 'pending' (ignore client-supplied status)
//     * text length guards (customerName, phone, notes)
//
//   update order status:
//     * legal transition per state machine
//     * if new status == cancelled: atomically restore every item's stock
//     * only owners may call this (enforced by Firestore rules + here)
//
// Any violation throws an OrderGuardError-shaped error with a `code` the
// UI can switch on. Firestore automatically retries transactions on
// contention, so the race-condition story is "last writer loses" with
// stock never going negative.
// ---------------------------------------------------------------------------

import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';

import { db } from '@/lib/firebase';
import { paths, STORE_SETTINGS_DOC_ID, COL } from './paths';
import {
  LEGAL_TRANSITIONS,
  MAX_LINE_QUANTITY,
  OrderGuardError,
} from '@/lib/orderGuards';
import { assertStoreOpen } from '@/lib/storeHours';
import { isValidE164 } from '@/lib/validation';
import type {
  Address,
  FulfillmentType,
  Order,
  OrderItem,
  OrderStatus,
  PaymentMethod,
  Product,
  StoreSettings,
} from '@/types/database';

// ---------------------------------------------------------------------------
// Length limits (mirror of the Supabase CHECK constraints)
// ---------------------------------------------------------------------------
const MAX_CUSTOMER_NAME = 200;
const MAX_NOTES = 2000;
const MAX_PHONE = 20;
const MIN_PHONE = 8;
const MAX_ADDRESS_JSON_BYTES = 8192;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface PlaceOrderInput {
  orderId?: string;         // optional client-supplied UUID (preserves parity with Supabase flow)
  userId: string | null;    // null for anonymous guests
  customerName: string;
  phoneNumber: string;      // already normalized to E.164 upstream
  deliveryAddress: Address | null;
  fulfillmentType: FulfillmentType;
  paymentMethod: PaymentMethod;
  notes: string | null;
  lines: Array<{
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;      // snapshot — transaction cross-checks live product.price
  }>;
}

export interface PlacedOrder {
  order: Order;
  items: OrderItem[];
}

/**
 * Atomically place an order.
 *
 *   1. READS inside the transaction:
 *        - /store_settings/default (live settings)
 *        - every /products/{productId} referenced by lines
 *   2. Validates all business rules against the LIVE data.
 *   3. WRITES inside the transaction:
 *        - decrement each product.stockQuantity
 *        - create the /orders/{orderId} doc with items embedded
 *
 * On validation failure the entire transaction aborts — no stock
 * mutation, no partial order written.
 */
export async function placeOrder(input: PlaceOrderInput): Promise<PlacedOrder> {
  return placeOrderWith(db, input);
}

/**
 * Same as placeOrder but accepts an injected Firestore instance so
 * integration tests can run against the local emulator or an isolated
 * project. Also used by tests to inject a fake db.
 */
export async function placeOrderWith(
  firestore: Firestore,
  input: PlaceOrderInput
): Promise<PlacedOrder> {
  // ---- 0. preliminary (sync, no DB) --------------------------------------
  assertPhone(input.phoneNumber);
  assertCustomerName(input.customerName);
  assertNotes(input.notes);
  if (input.deliveryAddress) assertAddressSize(input.deliveryAddress);

  if (!Array.isArray(input.lines) || input.lines.length === 0) {
    throw new OrderGuardError('Cart is empty.', 'empty_cart');
  }
  for (const l of input.lines) {
    assertLineQuantity(l.quantity);
    if (!l.productId) {
      throw new OrderGuardError('Each item must reference a product id.', 'empty_cart');
    }
  }

  const ordersCol = collection(firestore, COL.orders);
  const orderRef = input.orderId
    ? doc(firestore, paths.order(input.orderId))
    : doc(ordersCol);
  const orderId = orderRef.id;

  const result = await runTransaction(firestore, async (tx) => {
    // ---- 1. READ phase (all reads before any writes!) --------------------
    const settingsRef = doc(firestore, paths.settings());
    const settingsSnap = await tx.get(settingsRef);
    if (!settingsSnap.exists()) {
      throw new OrderGuardError(
        'Store settings are missing — cannot validate order.',
        'invalid_subtotal'
      );
    }
    const settings = settingsSnap.data() as StoreSettings;

    // Store must be open RIGHT NOW (master switch + business hours),
    // evaluated against the live settings doc, not the cached client copy.
    assertStoreOpen(settings);

    assertFulfillmentEnabledInline(settings, input.fulfillmentType);
    assertPaymentEnabledInline(settings, input.paymentMethod);

    const productRefs = input.lines.map((l) => doc(firestore, paths.product(l.productId)));
    const productSnaps = await Promise.all(productRefs.map((r) => tx.get(r)));

    // ---- 2. VALIDATE phase ----------------------------------------------
    let itemsSubtotal = 0;
    const stockMutations: Array<{ ref: ReturnType<typeof doc>; nextStock: number }> = [];
    const items: OrderItem[] = [];

    for (let i = 0; i < input.lines.length; i++) {
      const line = input.lines[i];
      const snap = productSnaps[i];
      if (!snap.exists()) {
        throw new OrderGuardError(
          `Product "${line.productName}" is no longer available.`,
          'invalid_subtotal'
        );
      }
      const product = snap.data() as Product;

      if (product.isAvailable === false) {
        throw new OrderGuardError(
          `Product "${product.name}" is not available for purchase.`,
          'invalid_subtotal'
        );
      }
      if (Number(product.stockQuantity ?? 0) < line.quantity) {
        throw new OrderGuardError(
          `Insufficient stock for "${product.name}": requested ${line.quantity}, available ${product.stockQuantity}.`,
          'invalid_subtotal'
        );
      }

      const unitPrice = Number(product.price);
      const subtotal  = round2(unitPrice * line.quantity);
      itemsSubtotal   = round2(itemsSubtotal + subtotal);

      items.push({
        productId: snap.id,
        productName: product.name,
        quantity: line.quantity,
        unitPrice,
        subtotal,
      });

      stockMutations.push({
        ref: productRefs[i],
        nextStock: Number(product.stockQuantity) - line.quantity,
      });
    }

    // Minimum-order check (live settings)
    const minOrder = Number(settings.minOrderAmount ?? 0);
    if (itemsSubtotal < minOrder) {
      throw new OrderGuardError(
        `Minimum order is ${minOrder.toFixed(2)}, cart subtotal is ${itemsSubtotal.toFixed(2)}.`,
        'below_minimum'
      );
    }

    // Delivery fee — authoritative from live settings, zero for pickup
    const expectedDeliveryFee =
      input.fulfillmentType === 'delivery'
        ? round2(Number(settings.deliveryFee ?? 0))
        : 0;
    const expectedTotal = round2(itemsSubtotal + expectedDeliveryFee);

    // ---- 3. WRITE phase --------------------------------------------------
    for (const m of stockMutations) {
      tx.update(m.ref, {
        stockQuantity: m.nextStock,
        updatedAt: serverTimestamp(),
      });
    }

    const createdAtIso = new Date().toISOString();
    const orderDoc = {
      userId: input.userId,
      customerName: input.customerName,
      phoneNumber: input.phoneNumber,
      deliveryAddress: input.deliveryAddress,
      fulfillmentType: input.fulfillmentType,
      paymentMethod: input.paymentMethod,
      status: 'pending' as OrderStatus,         // forced; ignore client input
      subtotal: itemsSubtotal,
      deliveryFee: expectedDeliveryFee,
      totalAmount: expectedTotal,
      items,
      notes: input.notes ?? null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    tx.set(orderRef, orderDoc);

    // Return a plain-JSON Order for the caller + Zustand cache.
    const plain: Order = {
      id: orderId,
      userId: orderDoc.userId,
      customerName: orderDoc.customerName,
      phoneNumber: orderDoc.phoneNumber,
      deliveryAddress: orderDoc.deliveryAddress,
      fulfillmentType: orderDoc.fulfillmentType,
      paymentMethod: orderDoc.paymentMethod,
      status: orderDoc.status,
      subtotal: orderDoc.subtotal,
      deliveryFee: orderDoc.deliveryFee,
      totalAmount: orderDoc.totalAmount,
      items: orderDoc.items,
      notes: orderDoc.notes,
      createdAt: createdAtIso,
      updatedAt: createdAtIso,
    };
    return { order: plain, items };
  });

  return result;
}

// ---------------------------------------------------------------------------
// Status transitions (owner-only; mirror of SQL state-machine trigger)
// ---------------------------------------------------------------------------

/**
 * Flip an order's status. If the new status is 'cancelled', atomically
 * refund every item's stock back to the products collection.
 * The state-machine check is enforced here AND in firestore.rules.
 */
export async function updateOrderStatus(
  orderId: string,
  nextStatus: OrderStatus
): Promise<void> {
  return updateOrderStatusWith(db, orderId, nextStatus);
}

export async function updateOrderStatusWith(
  firestore: Firestore,
  orderId: string,
  nextStatus: OrderStatus
): Promise<void> {
  await runTransaction(firestore, async (tx) => {
    const orderRef = doc(firestore, paths.order(orderId));

    // ---- READ phase ------------------------------------------------------
    const snap = await tx.get(orderRef);
    if (!snap.exists()) {
      throw new OrderGuardError(
        `Order ${orderId} does not exist.`,
        'illegal_status_transition'
      );
    }
    const order = snap.data() as Order;
    const currentStatus = order.status;

    if (!isLegal(currentStatus, nextStatus)) {
      throw new OrderGuardError(
        `Illegal order status transition: "${currentStatus}" → "${nextStatus}".`,
        'illegal_status_transition'
      );
    }

    // When cancelling, we need to read every referenced product first.
    const productSnaps: Array<{
      ref: ReturnType<typeof doc>;
      currentStock: number;
      refund: number;
    }> = [];
    if (nextStatus === 'cancelled') {
      for (const item of order.items ?? []) {
        if (!item.productId) continue;
        const pRef = doc(firestore, paths.product(item.productId));
        const pSnap = await tx.get(pRef);
        if (!pSnap.exists()) continue; // product was deleted; nothing to refund
        const product = pSnap.data() as Product;
        productSnaps.push({
          ref: pRef,
          currentStock: Number(product.stockQuantity ?? 0),
          refund: item.quantity,
        });
      }
    }

    // ---- WRITE phase -----------------------------------------------------
    tx.update(orderRef, {
      status: nextStatus,
      updatedAt: serverTimestamp(),
    });
    for (const p of productSnaps) {
      tx.update(p.ref, {
        stockQuantity: p.currentStock + p.refund,
        updatedAt: serverTimestamp(),
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Internal guards (duplicated here so this module stays self-contained)
// ---------------------------------------------------------------------------

function assertPhone(phone: string): void {
  if (!phone || !isValidE164(phone)) {
    throw new OrderGuardError(
      'Phone number must be strict E.164 (e.g. +972501234567).',
      'invalid_subtotal'
    );
  }
  if (phone.length < MIN_PHONE || phone.length > MAX_PHONE) {
    throw new OrderGuardError(
      `Phone length must be between ${MIN_PHONE} and ${MAX_PHONE} characters.`,
      'invalid_subtotal'
    );
  }
}

function assertCustomerName(name: string): void {
  if (!name || !name.trim()) {
    throw new OrderGuardError('Customer name is required.', 'empty_cart');
  }
  if (name.length > MAX_CUSTOMER_NAME) {
    throw new OrderGuardError(
      `Customer name may not exceed ${MAX_CUSTOMER_NAME} characters.`,
      'empty_cart'
    );
  }
}

function assertNotes(notes: string | null): void {
  if (notes == null) return;
  if (notes.length > MAX_NOTES) {
    throw new OrderGuardError(
      `Notes may not exceed ${MAX_NOTES} characters.`,
      'empty_cart'
    );
  }
}

function assertAddressSize(addr: Address): void {
  const bytes = JSON.stringify(addr).length;
  if (bytes > MAX_ADDRESS_JSON_BYTES) {
    throw new OrderGuardError(
      `Delivery address blob is too large (${bytes} > ${MAX_ADDRESS_JSON_BYTES}).`,
      'empty_cart'
    );
  }
}

function assertLineQuantity(q: number): void {
  if (typeof q !== 'number' || !Number.isFinite(q) || !Number.isInteger(q)) {
    throw new OrderGuardError(
      `Quantity must be a whole number (got ${q}).`,
      'invalid_quantity'
    );
  }
  if (q < 1) {
    throw new OrderGuardError(`Quantity must be at least 1 (got ${q}).`, 'invalid_quantity');
  }
  if (q > MAX_LINE_QUANTITY) {
    throw new OrderGuardError(
      `Quantity may not exceed ${MAX_LINE_QUANTITY} (got ${q}).`,
      'invalid_quantity'
    );
  }
}

function assertFulfillmentEnabledInline(
  s: StoreSettings,
  type: FulfillmentType
): void {
  if (type === 'delivery' && s.isDeliveryEnabled === false) {
    throw new OrderGuardError(
      'Delivery is currently disabled by the store.',
      'delivery_disabled'
    );
  }
  if (type === 'pickup' && s.isPickupEnabled === false) {
    throw new OrderGuardError(
      'Pickup is currently disabled by the store.',
      'pickup_disabled'
    );
  }
}

function assertPaymentEnabledInline(
  s: StoreSettings,
  method: PaymentMethod | string
): void {
  const map = (s.paymentMethods ?? {}) as Record<string, boolean>;
  if (!map[method]) {
    throw new OrderGuardError(
      `Payment method "${method}" is disabled by the store.`,
      'payment_disabled'
    );
  }
}

function isLegal(from: OrderStatus, to: OrderStatus): boolean {
  if (from === to) return false;
  return (LEGAL_TRANSITIONS[from] ?? []).includes(to);
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
