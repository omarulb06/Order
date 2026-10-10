// ---------------------------------------------------------------------------
// E2E Journey 4 — Multi-language switching (English ↔ Hebrew ↔ Arabic).
//
// Runs without the Firebase emulator: the entire journey exercises the
// real i18n instance, the locale bundles, RTL detection, and the localized
// WhatsApp message builder the owner dashboard dispatches.
// ---------------------------------------------------------------------------

import {
  currentLanguage,
  initI18n,
  isRTLLanguage,
  setLanguage,
} from '@/lib/i18n';
import { buildStatusMessage } from '@/lib/whatsapp';
import i18n from '@/lib/i18n';
import type { Order } from '@/types/database';

const order: Order = {
  id: 'abcd1234-5678',
  userId: null,
  customerName: 'Dana',
  phoneNumber: '+972501234567',
  deliveryAddress: null,
  fulfillmentType: 'delivery',
  paymentMethod: 'cash',
  status: 'pending',
  subtotal: 42,
  deliveryFee: 15,
  totalAmount: 57,
  items: [],
  notes: null,
  createdAt: '2026-01-01T00:00:00Z',
};

describe('J4 · Multi-language switch', () => {
  beforeAll(async () => {
    await initI18n();
    await setLanguage('en');
  });

  it('starts in English (LTR)', () => {
    expect(currentLanguage()).toBe('en');
    expect(isRTLLanguage(currentLanguage())).toBe(false);
    expect(i18n.t('shop.welcome')).toBe('Welcome');
    expect(i18n.t('checkout.placeOrder', { total: '₪57.00' })).toContain('Place order');
  });

  it('switches to Hebrew — strings localize and RTL is detected', async () => {
    await setLanguage('he');
    expect(currentLanguage()).toBe('he');
    expect(isRTLLanguage(currentLanguage())).toBe(true);

    expect(i18n.t('shop.welcome')).toBe('ברוך הבא');
    expect(i18n.t('cart.checkout')).toBe('לתשלום');
    expect(i18n.t('status.pending')).toBe('ממתינה');
    expect(i18n.t('checkout.storeClosed')).toContain('החנות סגורה');
  });

  it('switches to Arabic — strings localize and RTL is detected', async () => {
    await setLanguage('ar');
    expect(currentLanguage()).toBe('ar');
    expect(isRTLLanguage(currentLanguage())).toBe(true);

    expect(i18n.t('shop.welcome')).toBe('أهلاً بك');
    expect(i18n.t('orders.reorder')).toBe('إعادة الطلب');
    expect(i18n.t('status.delivered')).toBe('تم التسليم');
  });

  it('WhatsApp status messages follow the active language', async () => {
    await setLanguage('he');
    const heMsg = buildStatusMessage(order, 'out_for_delivery');
    expect(heMsg).toContain('Dana');
    expect(heMsg).toContain('ABCD1234');
    expect(heMsg).toContain('יצאה למשלוח');

    await setLanguage('ar');
    const arMsg = buildStatusMessage(order, 'cancelled');
    expect(arMsg).toContain('Dana');
    expect(arMsg).toContain('تم إلغاء');

    await setLanguage('en');
    const enMsg = buildStatusMessage(order, 'delivered');
    expect(enMsg).toContain('has been delivered');
  });

  it('interpolation works in every locale (place order CTA)', async () => {
    for (const lng of ['en', 'he', 'ar'] as const) {
      await setLanguage(lng);
      const cta = i18n.t('checkout.placeOrder', { total: '₪99.00' });
      expect(cta).toContain('₪99.00');
    }
  });

  it('returns to English cleanly', async () => {
    await setLanguage('en');
    expect(currentLanguage()).toBe('en');
    expect(isRTLLanguage(currentLanguage())).toBe(false);
    expect(i18n.t('orders.title')).toBe('My orders');
  });
});
