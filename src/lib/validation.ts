// ---------------------------------------------------------------------------
// Phone number validation / normalization
//
// We require strict E.164 format on submission: `+<country code><number>`.
// Total length (digits only, excluding the leading `+`) must be between 8
// and 15 per the ITU-T E.164 recommendation.
//
// `normalizeE164` understands several input shapes and promotes them to a
// canonical `+<country><subscriber>` string:
//
//   `+972501234567`      — already international, kept as-is
//   `00972501234567`     — IDD-prefixed, `00` stripped and `+` added
//   `972501234567`       — country-code-prefixed sans `+`, `+` added
//   `0501234567` (IL)    — local-format with trunk zero, `0` stripped and
//                          country code prepended
//
// A caller may pass an explicit `defaultCountry` (ISO-3166-1 alpha-2); when
// omitted we read `EXPO_PUBLIC_DEFAULT_COUNTRY` from the environment (bundled
// at build time by Expo) and fall back to `US`.
// ---------------------------------------------------------------------------

const E164_REGEX = /^\+[1-9]\d{7,14}$/;

/**
 * ISO-3166-1 alpha-2 → calling code. Expand this map as you ship to more
 * markets. Only countries listed here support the "local trunk zero" style
 * input (e.g. Israeli `0501234567`); numbers for unlisted countries must be
 * entered in `+CC...` form.
 */
const COUNTRY_CALLING_CODES: Record<string, string> = {
  IL: '972',
  US: '1',
  CA: '1',
  GB: '44',
  DE: '49',
  FR: '33',
  ES: '34',
  IT: '39',
  NL: '31',
  AU: '61',
  AE: '971',
  SA: '966',
  EG: '20',
  JO: '962',
  TR: '90',
  IN: '91',
};

/** Set of known calling codes (used to detect trunk-zero smuggling). */
const KNOWN_CALLING_CODES: ReadonlySet<string> = new Set(
  Object.values(COUNTRY_CALLING_CODES)
);

/**
 * After we've assembled a candidate `+CC...` number, verify that the
 * subscriber portion doesn't begin with 0 when the country code is one of
 * our known trunk-zero markets. E.164 subscriber numbers never begin with
 * 0 — a leading zero means someone concatenated a local trunk-prefix to a
 * country code (e.g. `+972 0501234567` → `+9720501234567`), which is
 * invalid even though it passes the loose length regex.
 */
function hasTrunkZeroAfterKnownCC(candidate: string): boolean {
  if (!candidate.startsWith('+')) return false;
  const digits = candidate.slice(1);
  // Try all plausible country-code lengths (1-4 digits).
  for (let len = 1; len <= 4; len++) {
    const cc = digits.slice(0, len);
    if (KNOWN_CALLING_CODES.has(cc)) {
      return digits.charAt(len) === '0';
    }
  }
  return false;
}

function resolveDefaultCountry(explicit?: string): string {
  const envCountry =
    typeof process !== 'undefined' ? process.env?.EXPO_PUBLIC_DEFAULT_COUNTRY : undefined;
  return (explicit || envCountry || 'US').toUpperCase();
}

export function isValidE164(phone: string | null | undefined): boolean {
  if (!phone) return false;
  const trimmed = phone.trim();
  if (!E164_REGEX.test(trimmed)) return false;
  // Reject obviously-smuggled trunk zeros like `+9720501234567`.
  if (hasTrunkZeroAfterKnownCC(trimmed)) return false;
  return true;
}

/**
 * Normalize a phone input to strict E.164. Returns `null` when the input is
 * not recoverable; callers should surface a validation error.
 */
export function normalizeE164(input: string, defaultCountry?: string): string | null {
  if (!input) return null;

  // Strip common formatting characters.
  const cleaned = input.replace(/[\s\-()\.]/g, '');
  if (!cleaned) return null;

  // Already in `+<cc><sub>` form.
  if (cleaned.startsWith('+')) {
    return isValidE164(cleaned) ? cleaned : null;
  }

  // IDD prefix (`00<cc><sub>` or similar). Treat as international.
  if (cleaned.startsWith('00')) {
    const candidate = `+${cleaned.slice(2)}`;
    return isValidE164(candidate) ? candidate : null;
  }

  // Only digits should remain at this point.
  if (!/^\d+$/.test(cleaned)) return null;

  const country = resolveDefaultCountry(defaultCountry);
  const callingCode = COUNTRY_CALLING_CODES[country];

  // Local-format with trunk zero (e.g. `0501234567` for IL → `+972501234567`).
  if (callingCode && cleaned.startsWith('0')) {
    const candidate = `+${callingCode}${cleaned.slice(1)}`;
    return isValidE164(candidate) ? candidate : null;
  }

  // Country-code-prefixed sans `+` (e.g. `972501234567`).
  if (callingCode && cleaned.startsWith(callingCode)) {
    const candidate = `+${cleaned}`;
    return isValidE164(candidate) ? candidate : null;
  }

  // Last-ditch: assume the caller gave a full international number without `+`.
  const candidate = `+${cleaned}`;
  return isValidE164(candidate) ? candidate : null;
}

export interface RequiredFieldError {
  field: string;
  message: string;
}

/**
 * Validate a checkout form payload against the dynamic list of required
 * fields configured on `store_settings.required_checkout_fields`.
 */
export function validateCheckout(
  payload: Record<string, unknown>,
  requiredFields: string[],
  options?: { defaultCountry?: string }
): RequiredFieldError[] {
  const errors: RequiredFieldError[] = [];

  for (const field of requiredFields) {
    const value = payload[field];
    if (value === undefined || value === null || `${value}`.trim() === '') {
      errors.push({ field, message: `${humanize(field)} is required.` });
    }
  }

  if (requiredFields.includes('phone_number')) {
    const phone = typeof payload.phone_number === 'string' ? payload.phone_number : '';
    if (phone) {
      const normalized = normalizeE164(phone, options?.defaultCountry);
      if (!normalized) {
        errors.push({
          field: 'phone_number',
          message:
            'Phone number must be a valid E.164 number (e.g. +972501234567 or 0501234567).',
        });
      }
    }
  }

  return errors;
}

function humanize(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
