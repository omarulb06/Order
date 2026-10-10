import { Alert, Linking, Platform } from 'react-native';
import type { Order, OrderStatus } from '@/types/database';
import { isValidE164, normalizeE164 } from './validation';
import { i18n } from './i18n';

/** English defaults — byte-identical to the pre-i18n templates. Used as
 * i18next defaultValue so the function also works before i18n init (unit
 * tests, background contexts). */
const EN_DEFAULTS: Record<OrderStatus, string> = {
  pending:
    "Hi {{name}}! We've received your order #{{id}}. We'll start preparing it shortly. 🧾",
  preparing:
    'Hi {{name}}! Good news — order #{{id}} is now being prepared. 👩‍🍳',
  out_for_delivery:
    'Hi {{name}}! Order #{{id}} is out for delivery and on its way to you. 🚚',
  delivered:
    'Hi {{name}}! Order #{{id}} has been delivered. Enjoy, and thanks for shopping with us! 💚',
  cancelled:
    'Hi {{name}}, order #{{id}} has been cancelled. Please reach out if you have any questions. 🙏',
};

const MESSAGE_KEYS: OrderStatus[] = [
  'pending',
  'preparing',
  'out_for_delivery',
  'delivered',
  'cancelled',
];

/**
 * Build the human-readable status message sent to the customer when the
 * owner advances an order. Templates live in src/locales/* under
 * `whatsapp.<status>` so they follow the app language; uninitialized
 * i18n (tests) falls back to the English defaults above.
 */
export function buildStatusMessage(order: Order, nextStatus: OrderStatus): string {
  const id = order.id.slice(0, 8).toUpperCase();
  const name = order.customerName || 'there';

  if (MESSAGE_KEYS.includes(nextStatus)) {
    return translate(`whatsapp.${nextStatus}`, EN_DEFAULTS[nextStatus], { name, id });
  }
  return translate(
    'whatsapp.fallback',
    'Hi {{name}}, an update on order #{{id}}: status is now "{{status}}".',
    { name, id, status: nextStatus }
  );
}

/**
 * Use i18next when it's initialized; otherwise interpolate the English
 * fallback ourselves (Jest / background contexts where init never ran).
 */
function translate(
  key: string,
  fallback: string,
  vars: Record<string, string>
): string {
  if (i18n.isInitialized) {
    return i18n.t(key, { ...vars, defaultValue: fallback });
  }
  return fallback.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
}

/**
 * Build a wa.me deep link. Phone must be in E.164; the leading `+` is
 * stripped per WhatsApp's URL format.
 */
export function buildWhatsAppLink(phoneE164: string, message: string): string {
  const normalized = normalizeE164(phoneE164);
  if (!normalized) {
    throw new Error('Invalid phone number — must be E.164 (e.g. +15555550123).');
  }
  const digits = normalized.replace(/^\+/, '');
  const encoded = encodeURIComponent(message);
  return `https://wa.me/${digits}?text=${encoded}`;
}

/**
 * Opens the Owner's native WhatsApp with the recipient pre-filled and the
 * status message pre-populated. Falls back to the web URL if the whatsapp://
 * scheme isn't registered (e.g. simulators without WhatsApp installed).
 */
export async function openWhatsApp(phoneE164: string, message: string): Promise<void> {
  if (!isValidE164(phoneE164)) {
    throw new Error('Invalid phone number — must be E.164 (e.g. +15555550123).');
  }

  const url = buildWhatsAppLink(phoneE164, message);

  try {
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
      return;
    }
    // On iOS, LSApplicationQueriesSchemes must include `whatsapp` for the
    // scheme probe to succeed. If not, we fall through to the web URL.
    await Linking.openURL(url);
  } catch (err) {
    if (Platform.OS !== 'web') {
      Alert.alert(
        'Unable to open WhatsApp',
        'Please make sure WhatsApp is installed on this device.'
      );
    }
    // eslint-disable-next-line no-console
    console.error('[whatsapp] openURL failed', err);
  }
}

/**
 * Convenience wrapper combining the two helpers above.
 */
export function notifyCustomerStatus(order: Order, nextStatus: OrderStatus) {
  const message = buildStatusMessage(order, nextStatus);
  return openWhatsApp(order.phoneNumber, message);
}
