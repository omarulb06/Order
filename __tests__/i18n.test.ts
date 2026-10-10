import {
  DEFAULT_LANGUAGE,
  isRTLLanguage,
  isSupportedLanguage,
  normalizeLanguage,
  resolveInitialLanguage,
  SUPPORTED_LANGUAGES,
} from '@/lib/i18n';
import en from '@/locales/en.json';
import he from '@/locales/he.json';
import ar from '@/locales/ar.json';

describe('language helpers', () => {
  it('supports exactly en, he, ar', () => {
    expect(SUPPORTED_LANGUAGES).toEqual(['en', 'he', 'ar']);
    expect(DEFAULT_LANGUAGE).toBe('en');
  });

  it('isSupportedLanguage', () => {
    expect(isSupportedLanguage('en')).toBe(true);
    expect(isSupportedLanguage('he')).toBe(true);
    expect(isSupportedLanguage('ar')).toBe(true);
    expect(isSupportedLanguage('fr')).toBe(false);
    expect(isSupportedLanguage('')).toBe(false);
    expect(isSupportedLanguage(null)).toBe(false);
  });

  it('normalizeLanguage strips region subtags', () => {
    expect(normalizeLanguage('en-US')).toBe('en');
    expect(normalizeLanguage('he-IL')).toBe('he');
    expect(normalizeLanguage('ar-SA')).toBe('ar');
    expect(normalizeLanguage('he_IL')).toBe('he');
    expect(normalizeLanguage('fr-FR')).toBeNull();
    expect(normalizeLanguage(undefined)).toBeNull();
  });

  it('isRTLLanguage detects Hebrew and Arabic', () => {
    expect(isRTLLanguage('he')).toBe(true);
    expect(isRTLLanguage('he-IL')).toBe(true);
    expect(isRTLLanguage('ar')).toBe(true);
    expect(isRTLLanguage('ar-EG')).toBe(true);
    expect(isRTLLanguage('en')).toBe(false);
    expect(isRTLLanguage('en-US')).toBe(false);
    expect(isRTLLanguage(null)).toBe(false);
    expect(isRTLLanguage(undefined)).toBe(false);
  });

  it('resolveInitialLanguage prefers stored, then device, then English', () => {
    expect(resolveInitialLanguage('he', 'en-US')).toBe('he');
    expect(resolveInitialLanguage(null, 'ar-EG')).toBe('ar');
    expect(resolveInitialLanguage(undefined, undefined)).toBe('en');
    expect(resolveInitialLanguage('fr', 'he-IL')).toBe('he');   // unsupported stored → device
    expect(resolveInitialLanguage('fr', 'de-DE')).toBe('en');   // both unsupported → default
  });
});

describe('locale files', () => {
  const keySet = (obj: Record<string, any>, prefix = ''): string[] =>
    Object.entries(obj).flatMap(([k, v]) =>
      v && typeof v === 'object'
        ? keySet(v, `${prefix}${k}.`)
        : [`${prefix}${k}`]
    );

  const enKeys = keySet(en).sort();
  const heKeys = keySet(he).sort();
  const arKeys = keySet(ar).sort();

  it('he.json has exactly the same keys as en.json', () => {
    expect(heKeys).toEqual(enKeys);
  });

  it('ar.json has exactly the same keys as en.json', () => {
    expect(arKeys).toEqual(enKeys);
  });

  it('no empty translations anywhere', () => {
    for (const [name, locale] of Object.entries({ en, he, ar })) {
      const walk = (o: Record<string, any>, path: string[]) => {
        for (const [k, v] of Object.entries(o)) {
          if (v && typeof v === 'object') walk(v, [...path, k]);
          else expect(`${name}:${[...path, k].join('.')} — ${v}`).not.toBe(`${name}:${[...path, k].join('.')} — `);
        }
      };
      walk(locale as Record<string, any>, []);
    }
  });

  it('status translations exist for every order status', () => {
    for (const s of ['pending', 'preparing', 'out_for_delivery', 'delivered', 'cancelled']) {
      expect((en.status as any)[s]).toBeTruthy();
      expect((he.status as any)[s]).toBeTruthy();
      expect((ar.status as any)[s]).toBeTruthy();
    }
  });

  it('whatsapp templates keep {{name}} and {{id}} placeholders in every locale', () => {
    for (const locale of [en, he, ar]) {
      for (const s of ['pending', 'preparing', 'out_for_delivery', 'delivered', 'cancelled']) {
        const tpl = (locale.whatsapp as any)[s] as string;
        expect(tpl).toContain('{{name}}');
        expect(tpl).toContain('{{id}}');
      }
    }
  });
});
