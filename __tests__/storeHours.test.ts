import {
  assertStoreOpen,
  defaultBusinessHours,
  isStoreAcceptingOrders,
  isValidDayHours,
  isWithinBusinessHours,
  parseHHMM,
  StoreClosedError,
} from '@/lib/storeHours';
import type { BusinessHours } from '@/types/database';

const at = (h: number, m = 0, dayOffset = 0) => {
  // Sunday 2026-01-04 is day 0.
  const d = new Date(2026, 0, 4 + dayOffset, h, m, 0, 0);
  return d;
};

const hours = (over: Partial<Record<string, Partial<{ open: string; close: string; active: boolean }>>>): BusinessHours => {
  const base = defaultBusinessHours();
  for (const [k, v] of Object.entries(over)) {
    (base as any)[k] = { ...(base as any)[k], ...v };
  }
  return base;
};

describe('parseHHMM', () => {
  it('parses valid times', () => {
    expect(parseHHMM('08:00')).toBe(480);
    expect(parseHHMM('22:30')).toBe(1350);
    expect(parseHHMM('0:05')).toBe(5);
  });
  it('rejects malformed times', () => {
    expect(parseHHMM('8am')).toBeNull();
    expect(parseHHMM('24:00')).toBeNull();
    expect(parseHHMM('12:60')).toBeNull();
    expect(parseHHMM('')).toBeNull();
    expect(parseHHMM(null)).toBeNull();
  });
});

describe('isValidDayHours', () => {
  it('accepts HH:MM pairs', () => {
    expect(isValidDayHours({ open: '08:00', close: '22:00', active: true })).toBe(true);
  });
  it('rejects garbage', () => {
    expect(isValidDayHours({ open: 'x', close: '22:00', active: true })).toBe(false);
  });
});

describe('isWithinBusinessHours', () => {
  it('no schedule → always open', () => {
    expect(isWithinBusinessHours(null, at(3))).toBe(true);
    expect(isWithinBusinessHours(undefined, at(23))).toBe(true);
  });

  it('standard day window', () => {
    const h = hours({ sunday: { open: '08:00', close: '22:00', active: true } });
    expect(isWithinBusinessHours(h, at(7, 59))).toBe(false);
    expect(isWithinBusinessHours(h, at(8, 0))).toBe(true);
    expect(isWithinBusinessHours(h, at(21, 59))).toBe(true);
    expect(isWithinBusinessHours(h, at(22, 0))).toBe(false);
  });

  it('inactive day → closed all day', () => {
    const h = hours({ sunday: { active: false } });
    expect(isWithinBusinessHours(h, at(12))).toBe(false);
  });

  it('open == close on an active day means 24h', () => {
    const h = hours({ sunday: { open: '00:00', close: '00:00', active: true } });
    expect(isWithinBusinessHours(h, at(3))).toBe(true);
    expect(isWithinBusinessHours(h, at(23))).toBe(true);
  });

  it('overnight window (18:00 → 02:00)', () => {
    const h = hours({ sunday: { open: '18:00', close: '02:00', active: true } });
    expect(isWithinBusinessHours(h, at(17, 59))).toBe(false);
    expect(isWithinBusinessHours(h, at(18, 0))).toBe(true);
    expect(isWithinBusinessHours(h, at(23, 30))).toBe(true);
  });

  it("yesterday's overnight window still counts after midnight", () => {
    // Saturday active 18:00 → 02:00; checking Sunday 01:00.
    const h = hours({
      saturday: { open: '18:00', close: '02:00', active: true },
      sunday:   { active: false },
    });
    expect(isWithinBusinessHours(h, at(1, 0))).toBe(true);
    expect(isWithinBusinessHours(h, at(2, 0))).toBe(false);
  });

  it('malformed day falls back to default 08:00–22:00', () => {
    const h = defaultBusinessHours();
    (h as any).sunday = { open: 'garbage', close: '??', active: true };
    expect(isWithinBusinessHours(h, at(12))).toBe(true);
    expect(isWithinBusinessHours(h, at(4))).toBe(false);
  });
});

describe('isStoreAcceptingOrders / assertStoreOpen', () => {
  it('master switch off → closed even inside hours', () => {
    const settings = { isStoreOpen: false, businessHours: hours({ sunday: { open: '00:00', close: '23:59' } }) };
    expect(isStoreAcceptingOrders(settings, at(12))).toBe(false);
    expect(() => assertStoreOpen(settings, at(12))).toThrow(StoreClosedError);
    expect(() => assertStoreOpen(settings, at(12))).toThrow(/closed by the owner/);
  });

  it('outside business hours → closed with hours message', () => {
    const settings = { isStoreOpen: true, businessHours: hours({ sunday: { open: '08:00', close: '20:00' } }) };
    expect(isStoreAcceptingOrders(settings, at(21))).toBe(false);
    expect(() => assertStoreOpen(settings, at(21))).toThrow(/business hours/);
  });

  it('open inside hours → passes', () => {
    const settings = { isStoreOpen: true, businessHours: hours({ sunday: { open: '08:00', close: '22:00' } }) };
    expect(isStoreAcceptingOrders(settings, at(12))).toBe(true);
    expect(() => assertStoreOpen(settings, at(12))).not.toThrow();
  });

  it('missing settings fields → treated as open (no data, no restriction)', () => {
    expect(() => assertStoreOpen(null, at(3))).not.toThrow();
    expect(() => assertStoreOpen({ isStoreOpen: true } as any, at(3))).not.toThrow();
  });
});
