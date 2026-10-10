/**
 * Tests for the pure checkout-form auto-fill helper. This is the logic
 * that fulfils the "Logged-in Client successfully completes checkout;
 * address auto-fills correctly" happy-path requirement from the QA matrix.
 */
import {
  EMPTY_CHECKOUT_FORM,
  buildCheckoutFormFromProfile,
  filterRequiredFieldsForFulfillment,
} from '@/lib/profileForm';
import type { Profile } from '@/types/database';

const sampleProfile: Profile = {
  id: 'u1',
  email: 'client@test.local',
  role: 'client',
  fullName: 'Alice Example',
  phoneNumber: '+972501234567',
  address: {
    addressLine1: 'Dizengoff 100',
    streetName: 'Dizengoff',
    city: 'Tel Aviv',
    postalCode: '6433223',
    country: 'IL',
    state: '',
  },
  createdAt: '2026-01-01T00:00:00Z',
};

describe('buildCheckoutFormFromProfile', () => {
  it('auto-fills every field from the profile', () => {
    const f = buildCheckoutFormFromProfile(sampleProfile);
    expect(f.full_name).toBe('Alice Example');
    expect(f.phone_number).toBe('+972501234567');
    expect(f.email).toBe('client@test.local');
    expect(f.address_line1).toBe('Dizengoff 100');
    expect(f.street_name).toBe('Dizengoff');
    expect(f.city).toBe('Tel Aviv');
    expect(f.postal_code).toBe('6433223');
    expect(f.country).toBe('IL');
    expect(f.notes).toBe('');
  });

  it('returns the empty form when profile is null/undefined', () => {
    expect(buildCheckoutFormFromProfile(null)).toEqual(EMPTY_CHECKOUT_FORM);
    expect(buildCheckoutFormFromProfile(undefined)).toEqual(EMPTY_CHECKOUT_FORM);
  });

  it('preserves user-typed values when profile fields are missing', () => {
    const noAddr: Profile = { ...sampleProfile, address: null };
    const prev = { city: 'Haifa', address_line1: '42 Herzl' };
    const f = buildCheckoutFormFromProfile(noAddr, prev);
    expect(f.city).toBe('Haifa');
    expect(f.address_line1).toBe('42 Herzl');
    // but profile still wins for its own populated keys:
    expect(f.full_name).toBe('Alice Example');
  });

  it('profile fields override empty "previous" values', () => {
    const prev = { full_name: '' };
    const f = buildCheckoutFormFromProfile(sampleProfile, prev);
    expect(f.full_name).toBe('Alice Example');
  });

  it('always starts notes empty', () => {
    const f = buildCheckoutFormFromProfile(sampleProfile, { notes: 'leftover' });
    expect(f.notes).toBe('');
  });
});

describe('filterRequiredFieldsForFulfillment', () => {
  const base = ['full_name', 'phone_number', 'street_name', 'city', 'postal_code', 'notes'];

  it('keeps every field for delivery', () => {
    expect(filterRequiredFieldsForFulfillment(base, 'delivery')).toEqual(base);
  });

  it('strips address-ish fields for pickup', () => {
    expect(filterRequiredFieldsForFulfillment(base, 'pickup')).toEqual([
      'full_name',
      'phone_number',
      'notes',
    ]);
  });

  it('handles the empty list', () => {
    expect(filterRequiredFieldsForFulfillment([], 'delivery')).toEqual([]);
    expect(filterRequiredFieldsForFulfillment([], 'pickup')).toEqual([]);
  });
});
