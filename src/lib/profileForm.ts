// ---------------------------------------------------------------------------
// Pure helpers for the checkout form. Extracted out of CheckoutScreen's
// useEffect so the auto-fill logic can be unit-tested without React.
//
// Fields are camelCase to match the Firestore `profiles/{uid}` doc shape.
// ---------------------------------------------------------------------------

import type { Address, Profile } from '@/types/database';

export interface CheckoutFormValues {
  full_name: string;
  phone_number: string;
  email: string;
  address_line1: string;
  address_line2: string;
  street_name: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  notes: string;
}

export const EMPTY_CHECKOUT_FORM: CheckoutFormValues = {
  full_name: '',
  phone_number: '',
  email: '',
  address_line1: '',
  address_line2: '',
  street_name: '',
  city: '',
  state: '',
  postal_code: '',
  country: '',
  notes: '',
};

/**
 * Build the checkout form state from the user's profile, filling blanks for
 * any missing field. Pass `previous` to preserve values the user has already
 * typed (profile wins only when the previous slot is empty).
 */
export function buildCheckoutFormFromProfile(
  profile: Profile | null | undefined,
  previous?: Partial<CheckoutFormValues>
): CheckoutFormValues {
  const addr = (profile?.address ?? {}) as Partial<Address>;
  const prev = previous ?? {};

  const pick = (fromProfile: string | null | undefined, prevKey: keyof CheckoutFormValues) =>
    (fromProfile ?? prev[prevKey] ?? '') || '';

  return {
    full_name:     pick(profile?.fullName,        'full_name'),
    phone_number:  pick(profile?.phoneNumber,     'phone_number'),
    email:         pick(profile?.email,           'email'),
    address_line1: pick(addr.addressLine1,        'address_line1'),
    address_line2: pick(addr.addressLine2,        'address_line2'),
    street_name:   pick(addr.streetName,          'street_name'),
    city:          pick(addr.city,                'city'),
    state:         pick(addr.state,               'state'),
    postal_code:   pick(addr.postalCode,          'postal_code'),
    country:       pick(addr.country,             'country'),
    notes:         '', // notes never auto-fill from profile
  };
}

/**
 * Determine which required fields to actually show given the chosen
 * fulfillment method. Pickup orders strip address fields.
 */
const ADDRESS_FIELDS = new Set([
  'address_line1',
  'address_line2',
  'street_name',
  'city',
  'state',
  'postal_code',
  'country',
]);

export function filterRequiredFieldsForFulfillment(
  requiredFields: string[],
  fulfillment: 'delivery' | 'pickup'
): string[] {
  if (fulfillment === 'pickup') {
    return requiredFields.filter((f) => !ADDRESS_FIELDS.has(f));
  }
  return [...requiredFields];
}
