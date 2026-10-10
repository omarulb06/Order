import { buildStatusMessage, buildWhatsAppLink } from '@/lib/whatsapp';
import type { Order } from '@/types/database';

const mockOrder: Order = {
  id: 'abcd1234-5678-90ab-cdef-000000000000',
  userId: null,
  customerName: 'Alice',
  phoneNumber: '+972501234567',
  deliveryAddress: null,
  fulfillmentType: 'delivery',
  paymentMethod: 'cash',
  status: 'pending',
  subtotal: 40,
  totalAmount: 55,
  deliveryFee: 15,
  items: [],
  notes: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('buildWhatsAppLink', () => {
  it('builds a valid wa.me URL for a +972 number', () => {
    const url = buildWhatsAppLink('+972501234567', 'Hello world');
    expect(url).toBe('https://wa.me/972501234567?text=Hello%20world');
  });

  it('builds the URL exactly as the QA spec requires', () => {
    // Spec: Input phone 972501234567, status out_for_delivery
    //       → url matches https://wa.me/972501234567?text=...
    const url = buildWhatsAppLink(
      '972501234567',
      buildStatusMessage({ ...mockOrder, status: 'out_for_delivery' }, 'out_for_delivery')
    );
    expect(url).toMatch(/^https:\/\/wa\.me\/972501234567\?text=.+/);
    expect(url).toContain('out%20for%20delivery');
  });

  it('normalizes a local IL number before building the URL', () => {
    const url = buildWhatsAppLink('0501234567', 'hi');
    expect(url).toContain('wa.me/972501234567');
  });

  it('URL-encodes special characters in the message', () => {
    const url = buildWhatsAppLink('+972501234567', 'Hi, how are you?');
    expect(url).toBe(
      'https://wa.me/972501234567?text=Hi%2C%20how%20are%20you%3F'
    );
  });

  it('URL-encodes emojis', () => {
    const url = buildWhatsAppLink('+972501234567', 'order delivered! 🚚');
    // 🚚 encodes as %F0%9F%9A%9A
    expect(url).toContain('%F0%9F%9A%9A');
  });

  it('throws on an unrecoverable phone number', () => {
    expect(() => buildWhatsAppLink('abc', 'hi')).toThrow(/E\.164/i);
  });
});

describe('buildStatusMessage', () => {
  it('includes a short order id and the customer name', () => {
    const msg = buildStatusMessage(mockOrder, 'pending');
    // Short id = first 8 chars uppercase (ABCD1234 for our fixture)
    expect(msg).toContain('ABCD1234');
    expect(msg).toContain('Alice');
  });

  it('produces status-specific copy for every lifecycle state', () => {
    expect(buildStatusMessage(mockOrder, 'pending')).toMatch(/received/i);
    expect(buildStatusMessage(mockOrder, 'preparing')).toMatch(/prepared/i);
    expect(buildStatusMessage(mockOrder, 'out_for_delivery')).toMatch(
      /out for delivery/i
    );
    expect(buildStatusMessage(mockOrder, 'delivered')).toMatch(/delivered/i);
    expect(buildStatusMessage(mockOrder, 'cancelled')).toMatch(/cancelled/i);
  });

  it('falls back to a generic message for unknown statuses', () => {
    // Cast to coerce an invalid status for the robustness test
    const msg = buildStatusMessage(mockOrder, 'archived' as any);
    expect(msg).toContain('ABCD1234');
    expect(msg).toContain('archived');
  });
});
