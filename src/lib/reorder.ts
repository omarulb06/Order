// ---------------------------------------------------------------------------
// Re-order logic — pure functions, unit-testable without RN / Firebase.
//
// Given a past order's embedded items and the current product catalog,
// decide what can go back into the cart:
//   * deleted product          → skipped ('unavailable')
//   * isAvailable === false    → skipped ('unavailable')
//   * stockQuantity <= 0       → skipped ('out_of_stock')
//   * 0 < stock < original qty → added CAPPED at current stock
//   * otherwise                → added at the original quantity
// ---------------------------------------------------------------------------

import type { OrderItem, Product } from '@/types/database';

export interface ReorderLine {
  product: Product;
  quantity: number;
}

export type SkipReason = 'unavailable' | 'out_of_stock';

export interface ReorderSkip {
  productId: string | null;
  productName: string;
  reason: SkipReason;
}

export interface ReorderPlan {
  added: ReorderLine[];
  skipped: ReorderSkip[];
}

export function buildReorderPlan(
  items: OrderItem[],
  productsById: Map<string, Product>
): ReorderPlan {
  const added: ReorderLine[] = [];
  const skipped: ReorderSkip[] = [];

  for (const item of items ?? []) {
    const product = item.productId ? productsById.get(item.productId) : undefined;

    if (!product || product.isAvailable === false) {
      skipped.push({
        productId: item.productId,
        productName: product?.name ?? item.productName,
        reason: 'unavailable',
      });
      continue;
    }

    const stock = Number(product.stockQuantity ?? 0);
    if (stock <= 0) {
      skipped.push({
        productId: item.productId,
        productName: product.name,
        reason: 'out_of_stock',
      });
      continue;
    }

    added.push({
      product,
      quantity: Math.min(item.quantity, stock),
    });
  }

  return { added, skipped };
}
