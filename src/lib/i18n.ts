// ---------------------------------------------------------------------------
// i18n bootstrap — i18next + react-i18next, English / Hebrew / Arabic.
//
//   * Language choice persists in AsyncStorage ('order:language').
//   * Device locale is used as the initial guess when nothing is stored.
//   * RTL languages (he, ar) flip I18nManager; full layout mirroring
//     applies on the next app start (RN limitation), which the picker
//     communicates to the user.
//
// The pure helpers (isRTLLanguage, resolveInitialLanguage, normalizeLanguage)
// are exported separately from the i18next instance so Jest can test them
// without initializing the React bindings.
// ---------------------------------------------------------------------------

import AsyncStorage from '@react-native-async-storage/async-storage';
import { I18nManager, NativeModules, Platform } from 'react-native';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from '@/locales/en.json';
import he from '@/locales/he.json';
import ar from '@/locales/ar.json';

export const SUPPORTED_LANGUAGES = ['en', 'he', 'ar'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];
export const DEFAULT_LANGUAGE: Language = 'en';
const RTL_LANGUAGES: ReadonlySet<string> = new Set(['he', 'ar']);
const STORAGE_KEY = 'order:language';

export function isSupportedLanguage(v: unknown): v is Language {
  return typeof v === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(v);
}

/** True for Hebrew / Arabic (any region subtag: he-IL, ar-SA, …). */
export function isRTLLanguage(lng: string | null | undefined): boolean {
  if (!lng) return false;
  return RTL_LANGUAGES.has(lng.split('-')[0].toLowerCase());
}

/** Coerce any locale-ish string to a supported Language. */
export function normalizeLanguage(v: unknown): Language | null {
  if (typeof v !== 'string' || !v) return null;
  const base = v.split(/[-_]/)[0].toLowerCase();
  return isSupportedLanguage(base) ? base : null;
}

/**
 * Pick the startup language: stored choice wins, then the device locale,
 * then English.
 */
export function resolveInitialLanguage(
  stored: string | null | undefined,
  deviceLocale: string | null | undefined
): Language {
  return (
    normalizeLanguage(stored) ?? normalizeLanguage(deviceLocale) ?? DEFAULT_LANGUAGE
  );
}

function deviceLocale(): string | null {
  try {
    if (Platform.OS === 'ios') {
      const settings = NativeModules.SettingsManager?.settings;
      return settings?.AppleLocale ?? settings?.AppleLanguages?.[0] ?? null;
    }
    return NativeModules.I18nManager?.localeIdentifier ?? null;
  } catch {
    return null;
  }
}

let initialized = false;

/** Idempotent init — called once from the root layout (and by tests). */
export async function initI18n(): Promise<typeof i18n> {
  if (initialized) return i18n;
  initialized = true;

  let stored: string | null = null;
  try {
    stored = await AsyncStorage.getItem(STORAGE_KEY);
  } catch {
    // storage unavailable (tests) — fall through to device/default
  }

  const lng = resolveInitialLanguage(stored, deviceLocale());

  await i18n.use(initReactI18next).init({
    resources: {
      en: { translation: en },
      he: { translation: he },
      ar: { translation: ar },
    },
    lng,
    fallbackLng: DEFAULT_LANGUAGE,
    interpolation: { escapeValue: false },
    returnEmptyString: false,
  });

  applyRTL(lng);
  return i18n;
}

/** Switch language, persist it, and flip RTL state. */
export async function setLanguage(lng: Language): Promise<void> {
  await i18n.changeLanguage(lng);
  try {
    await AsyncStorage.setItem(STORAGE_KEY, lng);
  } catch {
    // non-fatal
  }
  applyRTL(lng);
}

export function currentLanguage(): Language {
  return normalizeLanguage(i18n.language) ?? DEFAULT_LANGUAGE;
}

function applyRTL(lng: string): void {
  const rtl = isRTLLanguage(lng);
  try {
    I18nManager.allowRTL(true);
    if (I18nManager.isRTL !== rtl) {
      I18nManager.forceRTL(rtl);
    }
  } catch {
    // I18nManager is a no-op in some test environments.
  }
}

export { i18n };
export default i18n;
