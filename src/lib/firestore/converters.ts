// ---------------------------------------------------------------------------
// Firestore <-> TypeScript converters.
//
// Timestamps are normalized to ISO 8601 strings on READ so the rest of
// the app operates on plain JSON-serializable values (works out of the
// box with Zustand's AsyncStorage persistence). On WRITE we accept
// ISO strings and let Firestore cast — or we use serverTimestamp() for
// createdAt / updatedAt.
// ---------------------------------------------------------------------------

import type {
  DocumentData,
  FirestoreDataConverter,
  QueryDocumentSnapshot,
  Timestamp,
} from 'firebase/firestore';

import type {
  Category,
  Order,
  Product,
  Profile,
  Review,
  StoreSettings,
} from '@/types/database';
import { defaultBusinessHours, isValidDayHours, DAY_KEYS } from '@/lib/storeHours';

function toISO(v: unknown): string {
  if (!v) return '';
  if (typeof v === 'string') return v;
  if (typeof (v as Timestamp)?.toDate === 'function') {
    return (v as Timestamp).toDate().toISOString();
  }
  if (v instanceof Date) return v.toISOString();
  return '';
}

function stripId<T extends { id?: string }>(data: T): Omit<T, 'id'> {
  const copy: any = { ...data };
  delete copy.id;
  return copy;
}

// ---- Profile ---------------------------------------------------------------
export const profileConverter: FirestoreDataConverter<Profile> = {
  toFirestore(p: Profile): DocumentData {
    return stripId({
      ...p,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt ?? new Date().toISOString(),
    });
  },
  fromFirestore(snap: QueryDocumentSnapshot): Profile {
    const d = snap.data();
    return {
      id: snap.id,
      email: d.email ?? null,
      role: (d.role ?? 'client') as Profile['role'],
      fullName: d.fullName ?? null,
      phoneNumber: d.phoneNumber ?? null,
      address: d.address ?? null,
      createdAt: toISO(d.createdAt),
      updatedAt: d.updatedAt ? toISO(d.updatedAt) : undefined,
    };
  },
};

// ---- Category --------------------------------------------------------------
export const categoryConverter: FirestoreDataConverter<Category> = {
  toFirestore(c: Category): DocumentData {
    return stripId(c);
  },
  fromFirestore(snap: QueryDocumentSnapshot): Category {
    const d = snap.data();
    return {
      id: snap.id,
      name: d.name ?? '',
      imageUrl: d.imageUrl ?? null,
      sortOrder: Number(d.sortOrder ?? 0),
      createdAt: toISO(d.createdAt),
    };
  },
};

// ---- Product ---------------------------------------------------------------
export const productConverter: FirestoreDataConverter<Product> = {
  toFirestore(p: Product): DocumentData {
    return stripId(p);
  },
  fromFirestore(snap: QueryDocumentSnapshot): Product {
    const d = snap.data();
    const imageUrl: string | null = d.imageUrl ?? null;
    const images: string[] = Array.isArray(d.images)
      ? d.images.filter((u): u is string => typeof u === 'string' && u.length > 0)
      : imageUrl
        ? [imageUrl]
        : [];
    return {
      id: snap.id,
      categoryId: d.categoryId ?? null,
      name: d.name ?? '',
      description: d.description ?? null,
      price: Number(d.price ?? 0),
      stockQuantity: Number(d.stockQuantity ?? 0),
      imageUrl,
      images,
      averageRating: Number(d.averageRating ?? 0),
      reviewCount: Number(d.reviewCount ?? 0),
      isAvailable: d.isAvailable !== false,
      createdAt: toISO(d.createdAt),
      updatedAt: d.updatedAt ? toISO(d.updatedAt) : undefined,
    };
  },
};

// ---- Review ----------------------------------------------------------------
export const reviewConverter: FirestoreDataConverter<Review> = {
  toFirestore(r: Review): DocumentData {
    return stripId(r);
  },
  fromFirestore(snap: QueryDocumentSnapshot): Review {
    const d = snap.data();
    return {
      id: snap.id,
      userId: d.userId ?? '',
      userName: d.userName ?? '',
      rating: Number(d.rating ?? 0),
      comment: d.comment ?? null,
      createdAt: toISO(d.createdAt),
    };
  },
};

// ---- StoreSettings ---------------------------------------------------------
export const storeSettingsConverter: FirestoreDataConverter<StoreSettings> = {
  toFirestore(s: StoreSettings): DocumentData {
    return stripId(s);
  },
  fromFirestore(snap: QueryDocumentSnapshot): StoreSettings {
    const d = snap.data();
    const defaults = defaultBusinessHours();
    const rawHours = (d.businessHours ?? {}) as Record<string, any>;
    const businessHours = { ...defaults };
    for (const key of DAY_KEYS) {
      const candidate = rawHours[key];
      if (candidate && isValidDayHours(candidate)) {
        businessHours[key] = {
          open: candidate.open,
          close: candidate.close,
          active: candidate.active !== false,
        };
      }
    }
    return {
      id: snap.id,
      deliveryFee: Number(d.deliveryFee ?? 0),
      minOrderAmount: Number(d.minOrderAmount ?? 0),
      isDeliveryEnabled: d.isDeliveryEnabled !== false,
      isPickupEnabled: d.isPickupEnabled !== false,
      isStoreOpen: d.isStoreOpen !== false,
      businessHours,
      requiredCheckoutFields: Array.isArray(d.requiredCheckoutFields)
        ? d.requiredCheckoutFields
        : ['full_name', 'phone_number', 'address_line1', 'city'],
      paymentMethods: d.paymentMethods ?? { cash: true },
      createdAt: toISO(d.createdAt),
      updatedAt: d.updatedAt ? toISO(d.updatedAt) : undefined,
    };
  },
};

// ---- Order -----------------------------------------------------------------
export const orderConverter: FirestoreDataConverter<Order> = {
  toFirestore(o: Order): DocumentData {
    return stripId(o);
  },
  fromFirestore(snap: QueryDocumentSnapshot): Order {
    const d = snap.data();
    return {
      id: snap.id,
      userId: d.userId ?? null,
      customerName: d.customerName ?? '',
      phoneNumber: d.phoneNumber ?? '',
      deliveryAddress: d.deliveryAddress ?? null,
      fulfillmentType: (d.fulfillmentType ?? 'delivery') as Order['fulfillmentType'],
      paymentMethod: (d.paymentMethod ?? 'cash') as Order['paymentMethod'],
      status: (d.status ?? 'pending') as Order['status'],
      subtotal: Number(d.subtotal ?? 0),
      deliveryFee: Number(d.deliveryFee ?? 0),
      totalAmount: Number(d.totalAmount ?? 0),
      items: Array.isArray(d.items) ? d.items : [],
      notes: d.notes ?? null,
      createdAt: toISO(d.createdAt),
      updatedAt: d.updatedAt ? toISO(d.updatedAt) : undefined,
    };
  },
};
