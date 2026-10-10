// -----------------------------------------------------------------------------
// Firestore schema types.
//
// Collections (per Firebase migration spec):
//   /profiles/{uid}
//   /categories/{categoryId}
//   /products/{productId}
//   /store_settings/default        (singleton document)
//   /orders/{orderId}              (items are embedded, no sub-collection)
// -----------------------------------------------------------------------------

export type UserRole = 'client' | 'admin' | 'owner';

export type OrderStatus =
  | 'pending'
  | 'preparing'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled';

export type FulfillmentType = 'delivery' | 'pickup';

/**
 * Firebase migration spec requires `'cash' | 'stripe'`. The settings map
 * can also carry `apple_pay` / `google_pay` booleans; those methods route
 * through Stripe at submit time so the stored `paymentMethod` is still
 * either 'cash' or 'stripe'.
 */
export type PaymentMethod = 'cash' | 'stripe';

export interface Address {
  addressLine1: string;
  addressLine2?: string;
  streetName?: string;
  city: string;
  state?: string;
  postalCode?: string;
  country?: string;
  notes?: string;
}

/**
 * Firestore document at `/profiles/{uid}`. `id` is the Firestore doc id
 * (= Firebase Auth uid); it's attached when the SDK deserializes the doc
 * and does NOT live inside the stored data.
 */
export interface Profile {
  id: string;
  email: string | null;
  role: UserRole;
  fullName: string | null;
  phoneNumber: string | null;
  address: Address | null;
  createdAt: string; // ISO 8601; converter normalizes Timestamp → string
  updatedAt?: string;
}

export interface Category {
  id: string;
  name: string;
  imageUrl: string | null;
  sortOrder: number;
  createdAt: string;
}

export interface Product {
  id: string;
  categoryId: string | null;
  name: string;
  description: string | null;
  price: number;
  stockQuantity: number;
  /** Primary thumbnail URL. Mirrors images[0] when the gallery is set. */
  imageUrl: string | null;
  /** Full image gallery for the product details carousel. */
  images: string[];
  /** Running average of all review ratings (0..5). 0 when no reviews. */
  averageRating: number;
  /** Total number of reviews in the reviews subcollection. */
  reviewCount: number;
  isAvailable: boolean;
  createdAt: string;
  updatedAt?: string;
}

/**
 * Document at `products/{productId}/reviews/{reviewId}`.
 */
export interface Review {
  id: string;
  userId: string;
  userName: string;
  rating: number;          // integer 1..5 (enforced by rules + guards)
  comment: string | null;
  createdAt: string;
}

/**
 * Singleton document at `/store_settings/default`. The map keys in
 * `paymentMethods` match PaymentMethod + the alias methods ('card',
 * 'apple_pay', 'google_pay') that the UI exposes as Stripe sub-options.
 */
export interface StoreSettings {
  id: string;
  deliveryFee: number;
  minOrderAmount: number;
  isDeliveryEnabled: boolean;
  isPickupEnabled: boolean;
  /** Master open/closed override controlled by the owner. */
  isStoreOpen: boolean;
  /** Weekly operating hours; `active: false` means closed that day. */
  businessHours: BusinessHours;
  requiredCheckoutFields: string[];
  paymentMethods: Record<string, boolean>;
  createdAt: string;
  updatedAt?: string;
}

export type DayKey =
  | 'sunday'
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday';

/** "HH:MM" 24h strings. `close` earlier than `open` means overnight. */
export interface DayHours {
  open: string;
  close: string;
  active: boolean;
}

export type BusinessHours = Record<DayKey, DayHours>;

/**
 * Items are embedded in the parent order per the Firebase migration spec.
 */
export interface OrderItem {
  productId: string | null;
  productName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number; // quantity × unitPrice, kept for display without math
}

export interface Order {
  id: string;
  userId: string | null;

  customerName: string;
  phoneNumber: string;
  deliveryAddress: Address | null;

  fulfillmentType: FulfillmentType;
  paymentMethod: PaymentMethod;
  status: OrderStatus;

  subtotal: number;
  deliveryFee: number;
  totalAmount: number;

  items: OrderItem[];

  notes: string | null;
  createdAt: string;
  updatedAt?: string;
}
