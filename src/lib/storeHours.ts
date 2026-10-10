// ---------------------------------------------------------------------------
// Store open/closed logic — pure functions, zero RN / Firebase imports.
//
// Two gates, both evaluated against the LIVE /store_settings/default doc:
//   1. isStoreOpen        — owner master switch (instant override)
//   2. businessHours      — weekly schedule; inactive day = closed
//
// Overnight windows are supported: { open: "18:00", close: "02:00" } means
// the store is open from 18:00 through 02:00 the next morning.
// ---------------------------------------------------------------------------

import type { BusinessHours, DayHours, DayKey, StoreSettings } from '@/types/database';

export const DAY_KEYS: readonly DayKey[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

const DEFAULT_DAY: DayHours = { open: '08:00', close: '22:00', active: true };

export function defaultBusinessHours(): BusinessHours {
  return DAY_KEYS.reduce((acc, d) => {
    acc[d] = { ...DEFAULT_DAY };
    return acc;
  }, {} as BusinessHours);
}

/** "HH:MM" → minutes since midnight. Returns null on malformed input. */
export function parseHHMM(v: unknown): number | null {
  if (typeof v !== 'string') return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

export function isValidDayHours(d: DayHours): boolean {
  return parseHHMM(d?.open) !== null && parseHHMM(d?.close) !== null;
}

function dayKeyFor(date: Date): DayKey {
  return DAY_KEYS[date.getDay()];
}

function resolveDay(
  hours: BusinessHours | null | undefined,
  key: DayKey
): DayHours {
  const fromSettings = hours?.[key];
  if (fromSettings && isValidDayHours(fromSettings)) return fromSettings;
  return { ...DEFAULT_DAY };
}

/**
 * Is `date` inside today's (or, for overnight windows, yesterday's)
 * active operating window?
 */
export function isWithinBusinessHours(
  hours: BusinessHours | null | undefined,
  date: Date = new Date()
): boolean {
  // No schedule configured anywhere → no time restriction.
  if (hours == null) return true;

  const minutes = date.getHours() * 60 + date.getMinutes();

  // Today's window.
  const today = resolveDay(hours, dayKeyFor(date));
  const open = parseHHMM(today.open)!;
  const close = parseHHMM(today.close)!;
  if (today.active) {
    if (open === close) {
      // Convention: open == close on an active day means 24h service.
      return true;
    }
    if (close > open) {
      if (minutes >= open && minutes < close) return true;
    } else {
      // Overnight window starting today: 18:00 → 02:00.
      if (minutes >= open) return true;
    }
  }

  // Yesterday's overnight window spilling into today.
  const yesterday = new Date(date);
  yesterday.setDate(yesterday.getDate() - 1);
  const yHours = resolveDay(hours, dayKeyFor(yesterday));
  if (yHours.active) {
    const yOpen = parseHHMM(yHours.open)!;
    const yClose = parseHHMM(yHours.close)!;
    if (yClose < yOpen && minutes < yClose) return true;
  }

  return false;
}

type StoreHoursSlice = Pick<StoreSettings, 'isStoreOpen' | 'businessHours'>;

/** Both gates must pass for the store to accept orders right now. */
export function isStoreAcceptingOrders(
  settings: StoreHoursSlice | null | undefined,
  date: Date = new Date()
): boolean {
  if (settings?.isStoreOpen === false) return false;
  return isWithinBusinessHours(settings?.businessHours, date);
}

export class StoreClosedError extends Error {
  code = 'store_closed' as const;
  constructor(message = 'The store is currently closed and not accepting orders.') {
    super(message);
    this.name = 'StoreClosedError';
  }
}

/** Throws StoreClosedError when the store is not accepting orders. */
export function assertStoreOpen(
  settings: StoreHoursSlice | null | undefined,
  date: Date = new Date()
): void {
  if (settings?.isStoreOpen === false) {
    throw new StoreClosedError('The store is closed by the owner right now.');
  }
  if (settings?.businessHours != null && !isWithinBusinessHours(settings.businessHours, date)) {
    throw new StoreClosedError('The store is outside its business hours right now.');
  }
}
