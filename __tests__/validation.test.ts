import { isValidE164, normalizeE164, validateCheckout } from '@/lib/validation';

describe('isValidE164', () => {
  it.each([
    '+972501234567',
    '+15555550123',
    '+447911123456',
    '+12345678',          // minimum length (8 digits after +)
  ])('accepts valid number %s', (n) => {
    expect(isValidE164(n)).toBe(true);
  });

  it.each([
    ['missing +', '972501234567'],
    ['too short', '+1234567'],
    ['too long', '+1234567890123456'],
    ['letters', '+972501ABC567'],
    ['leading zero in CC', '+0972501234567'],
    ['empty', ''],
    ['whitespace only', '   '],
  ])('rejects %s', (_label, n) => {
    expect(isValidE164(n)).toBe(false);
  });

  it('rejects null/undefined safely', () => {
    expect(isValidE164(null)).toBe(false);
    expect(isValidE164(undefined)).toBe(false);
  });
});

describe('normalizeE164 — Israel (IL) default', () => {
  it('promotes local trunk-zero to +972...', () => {
    expect(normalizeE164('0501234567', 'IL')).toBe('+972501234567');
  });

  it('keeps already-international numbers untouched', () => {
    expect(normalizeE164('+972501234567', 'IL')).toBe('+972501234567');
  });

  it('adds + to numbers that already start with 972', () => {
    expect(normalizeE164('972501234567', 'IL')).toBe('+972501234567');
  });

  it('strips spaces, dashes, parens, dots', () => {
    expect(normalizeE164('050-123 4567', 'IL')).toBe('+972501234567');
    expect(normalizeE164('(050) 123-4567', 'IL')).toBe('+972501234567');
    expect(normalizeE164('050.123.4567', 'IL')).toBe('+972501234567');
  });

  it('handles the IDD 00 prefix', () => {
    expect(normalizeE164('00972501234567', 'IL')).toBe('+972501234567');
  });

  it.each([
    ['too short', '0501'],
    ['letters', 'abc'],
    ['empty', ''],
    ['pure zeros', '00000'],
  ])('returns null for %s', (_label, bad) => {
    expect(normalizeE164(bad as string, 'IL')).toBeNull();
  });
});

describe('normalizeE164 — US fallback', () => {
  it('passes through +15555550123', () => {
    expect(normalizeE164('+15555550123', 'US')).toBe('+15555550123');
  });

  it('adds + to 15555550123 (country-code prefixed)', () => {
    expect(normalizeE164('15555550123', 'US')).toBe('+15555550123');
  });
});

describe('validateCheckout', () => {
  const required = ['city', 'street_name', 'phone_number', 'notes'];

  it('reports one error per missing field', () => {
    const errs = validateCheckout({}, required);
    expect(errs.map((e) => e.field).sort()).toEqual(
      ['city', 'notes', 'phone_number', 'street_name'].sort()
    );
  });

  it('passes when all required fields are filled with a valid IL phone', () => {
    const errs = validateCheckout(
      {
        city: 'Tel Aviv',
        street_name: 'Rothschild',
        phone_number: '0501234567',
        notes: 'leave at door',
      },
      required,
      { defaultCountry: 'IL' }
    );
    expect(errs).toHaveLength(0);
  });

  it('flags a phone field present but not valid E.164', () => {
    const errs = validateCheckout(
      {
        city: 'Tel Aviv',
        street_name: 'Rothschild',
        phone_number: 'not-a-number',
        notes: 'x',
      },
      required,
      { defaultCountry: 'IL' }
    );
    const phoneErr = errs.find((e) => e.field === 'phone_number');
    expect(phoneErr).toBeDefined();
    expect(phoneErr?.message).toMatch(/E\.164/i);
  });

  it('treats whitespace-only values as missing', () => {
    const errs = validateCheckout(
      { city: '   ', street_name: '', phone_number: '0501234567', notes: 'x' },
      required
    );
    expect(errs.map((e) => e.field).sort()).toEqual(['city', 'street_name']);
  });

  it('does not require phone_number if it is not in requiredFields', () => {
    const errs = validateCheckout(
      { city: 'TLV', street_name: 'X', notes: 'y' },
      ['city', 'street_name', 'notes']
    );
    expect(errs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Hostile / malformed input matrix — these were REAL findings during the
// deep-review phase and now have strict guards in both validation.ts
// and the SQL trigger `tg_validate_order_on_insert`.
// ---------------------------------------------------------------------------
describe('normalizeE164 — strict rejection of malicious / malformed input', () => {
  it.each([
    // Letters mixed with digits (classic "050-123-abcd")
    '050-123-abcd',
    '050abc1234',
    '+9725012abc567',

    // Trunk-zero smuggling after a known country code
    //   "+972 0501234567" → "+9720501234567" used to pass before the fix.
    '+972 0501234567',
    '+9720501234567',
    '972 0501234567',   // same via sans-plus path
    '00972 0501234567', // same via IDD path

    // Over-length (ITU-T E.164 cap is 15 digits)
    '+1234567890123456',
    '0' + '5'.repeat(20),

    // Under-length (less than 8 digits after +)
    '+1234567',
    '0501',

    // Double / malformed `+`
    '++972501234567',
    '+',
    '+ 972 50 1234 567abc',

    // Pure zeros / empty
    '',
    '   ',
    '0000000000',
    '00',

    // SQL / injection-ish strings
    "' OR 1=1 --",
    '<script>alert(1)</script>',
    '+972;DROP TABLE orders;--',

    // Unicode / RTL mark attempts
    '+972\u200F501234567',
    '٠٥٠١٢٣٤٥٦٧', // Arabic-Indic digits — not ASCII
  ])('rejects %j', (bad) => {
    expect(normalizeE164(bad as string, 'IL')).toBeNull();
  });

  it('still accepts clean IL inputs after hardening', () => {
    expect(normalizeE164('0501234567', 'IL')).toBe('+972501234567');
    expect(normalizeE164('+972501234567', 'IL')).toBe('+972501234567');
    expect(normalizeE164('972-50-123-4567', 'IL')).toBe('+972501234567');
  });
});

describe('isValidE164 — strict pass-through gate', () => {
  it.each([
    '+9720501234567',   // trunk-zero smuggled
    '+10501234567',     // leading-0 subscriber under NANP
    '+440501234567',    // leading-0 subscriber under GB
    '+00000000',        // zeros after +
  ])('rejects %j', (bad) => {
    expect(isValidE164(bad)).toBe(false);
  });

  it.each([
    '+972501234567',
    '+15555550123',
    '+447911123456',
    '+4915112345678',
  ])('accepts %j', (good) => {
    expect(isValidE164(good)).toBe(true);
  });
});

