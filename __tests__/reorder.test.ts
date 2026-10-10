import { buildReorderPlan } from '@/lib/reorder';
import type { OrderItem, Product } from '@/types/database';

const product = (over: Partial<Product>): Product => ({
  id: 'p1',
  categoryId: null,
  name: 'Item',
  description: null,
  price: 10,
  stockQuantity: 10,
  imageUrl: null,
  images: [],
  averageRating: 0,
  reviewCount: 0,
  isAvailable: true,
  createdAt: '2026-01-01T00:00:00Z',
  ...over,
});

const item = (over: Partial<OrderItem> = {}): OrderItem => ({
  productId: 'p1',
  productName: 'Item',
  quantity: 2,
  unitPrice: 10,
  subtotal: 20,
  ...over,
});

describe('buildReorderPlan', () => {
  it('adds all items when everything is in stock', () => {
    const products = new Map([
      ['p1', product({ id: 'p1', stockQuantity: 5 })],
      ['p2', product({ id: 'p2', stockQuantity: 9 })],
    ]);
    const plan = buildReorderPlan(
      [item({ productId: 'p1', quantity: 2 }), item({ productId: 'p2', quantity: 4 })],
      products
    );
    expect(plan.added).toHaveLength(2);
    expect(plan.skipped).toHaveLength(0);
    expect(plan.added[1].quantity).toBe(4);
  });

  it('skips deleted products as unavailable', () => {
    const plan = buildReorderPlan([item({ productId: 'ghost' })], new Map());
    expect(plan.added).toHaveLength(0);
    expect(plan.skipped).toEqual([
      { productId: 'ghost', productName: 'Item', reason: 'unavailable' },
    ]);
  });

  it('skips isAvailable=false products', () => {
    const products = new Map([['p1', product({ isAvailable: false, stockQuantity: 50 })]]);
    const plan = buildReorderPlan([item()], products);
    expect(plan.skipped[0].reason).toBe('unavailable');
  });

  it('skips zero-stock products', () => {
    const products = new Map([['p1', product({ stockQuantity: 0 })]]);
    const plan = buildReorderPlan([item()], products);
    expect(plan.skipped[0].reason).toBe('out_of_stock');
  });

  it('caps quantity at current stock when partially available', () => {
    const products = new Map([['p1', product({ stockQuantity: 1 })]]);
    const plan = buildReorderPlan([item({ quantity: 5 })], products);
    expect(plan.added[0].quantity).toBe(1);
    expect(plan.skipped).toHaveLength(0);
  });

  it('mixed order: keeps available, filters the rest', () => {
    const products = new Map([
      ['p1', product({ id: 'p1', stockQuantity: 10 })],
      ['p2', product({ id: 'p2', stockQuantity: 0 })],
      ['p3', product({ id: 'p3', isAvailable: false })],
    ]);
    const plan = buildReorderPlan(
      [
        item({ productId: 'p1' }),
        item({ productId: 'p2', productName: 'Gone' }),
        item({ productId: 'p3', productName: 'Hidden' }),
        item({ productId: 'p4', productName: 'Deleted' }),
      ],
      products
    );
    expect(plan.added.map((l) => l.product.id)).toEqual(['p1']);
    expect(plan.skipped.map((s) => s.reason)).toEqual([
      'out_of_stock',
      'unavailable',
      'unavailable',
    ]);
  });

  it('empty items → empty plan', () => {
    const plan = buildReorderPlan([], new Map());
    expect(plan.added).toHaveLength(0);
    expect(plan.skipped).toHaveLength(0);
  });
});
