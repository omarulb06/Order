// ---------------------------------------------------------------------------
// "My Orders" — order history for authenticated clients.
//
// Live list of the caller's orders (rules scope reads to userId == auth.uid),
// each card showing status, date, itemized receipt, total, and a one-tap
// Re-Order button that repopulates the cart with whatever is still
// available (see src/lib/reorder.ts) and routes to /cart.
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  collection,
  documentId,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';

import { StatusBadge } from '@/components/StatusBadge';
import { db } from '@/lib/firebase';
import { COL, paths } from '@/lib/firestore/paths';
import { orderConverter, productConverter } from '@/lib/firestore/converters';
import { buildReorderPlan } from '@/lib/reorder';
import { formatCurrency, formatDate, shortId } from '@/lib/format';
import { useAuthStore } from '@/stores/auth';
import { useCartStore } from '@/stores/cart';
import type { Order, Product } from '@/types/database';

export default function OrdersScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const addToCart = useCartStore((s) => s.add);
  const clearCart = useCartStore((s) => s.clear);

  const [orders, setOrders] = useState<Order[] | null>(null);
  const [reorderingId, setReorderingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setOrders([]);
      return;
    }
    const q = query(
      collection(db, COL.orders).withConverter(orderConverter),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(
      q,
      (snap) => setOrders(snap.docs.map((d) => d.data())),
      () => setOrders([])
    );
    return unsub;
  }, [user]);

  const reorder = async (order: Order) => {
    setReorderingId(order.id);
    try {
      const ids = [...new Set(order.items.map((i) => i.productId).filter(Boolean))] as string[];
      const productsById = new Map<string, Product>();
      if (ids.length > 0) {
        // Firestore `in` queries cap at 10 — chunk.
        for (let i = 0; i < ids.length; i += 10) {
          const chunk = ids.slice(i, i + 10);
          const snap = await getDocs(
            query(
              collection(db, COL.products).withConverter(productConverter),
              where(documentId(), 'in', chunk)
            )
          );
          snap.docs.forEach((d) => productsById.set(d.id, d.data()));
        }
      }

      const plan = buildReorderPlan(order.items, productsById);
      if (plan.added.length === 0) {
        Alert.alert(
          'Nothing available',
          'None of the items from this order are available right now.'
        );
        return;
      }

      clearCart();
      for (const line of plan.added) addToCart(line.product, line.quantity);

      if (plan.skipped.length > 0) {
        const names = plan.skipped.map((s) => s.productName).join(', ');
        Alert.alert(
          'Some items unavailable',
          `${names} ${plan.skipped.length === 1 ? 'was' : 'were'} left out of your cart.`
        );
      }
      router.push('/cart' as any);
    } catch (err: any) {
      Alert.alert('Re-order failed', err?.message ?? 'Unknown error');
    } finally {
      setReorderingId(null);
    }
  };

  if (!user) {
    return (
      <View className="flex-1 items-center justify-center bg-white p-6">
        <Ionicons name="lock-closed-outline" size={44} color="#94a3b8" />
        <Text className="mt-3 text-neutral-600 text-center">
          Sign in to see your order history.
        </Text>
        <Pressable
          onPress={() => router.push('/sign-in' as any)}
          className="mt-4 rounded-xl bg-brand-600 px-4 py-2"
        >
          <Text className="text-white font-semibold">Sign in</Text>
        </Pressable>
      </View>
    );
  }

  if (orders === null) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color="#0ea5e9" />
      </View>
    );
  }

  return (
    <FlatList
      data={orders}
      keyExtractor={(o) => o.id}
      className="flex-1 bg-neutral-50"
      contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
      ListEmptyComponent={
        <View className="items-center mt-24">
          <Ionicons name="receipt-outline" size={48} color="#94a3b8" />
          <Text className="mt-2 text-neutral-500">No orders yet.</Text>
          <Pressable
            onPress={() => router.push('/' as any)}
            className="mt-4 rounded-xl bg-brand-600 px-4 py-2"
          >
            <Text className="text-white font-semibold">Start shopping</Text>
          </Pressable>
        </View>
      }
      renderItem={({ item }) => (
        <View className="mb-3 rounded-2xl bg-white border border-neutral-100 p-4">
          <View className="flex-row items-center justify-between">
            <View>
              <Text className="text-xs text-neutral-500">Order #{shortId(item.id)}</Text>
              <Text className="text-[11px] text-neutral-400 mt-0.5">
                {formatDate(item.createdAt)}
              </Text>
            </View>
            <StatusBadge status={item.status} />
          </View>

          <View className="mt-3 border-t border-neutral-100 pt-2">
            {item.items.map((it, idx) => (
              <View key={`${it.productId}-${idx}`} className="flex-row justify-between py-0.5">
                <Text className="text-sm text-neutral-700 flex-1" numberOfLines={1}>
                  {it.quantity}× {it.productName}
                </Text>
                <Text className="text-sm text-neutral-700">
                  {formatCurrency(it.subtotal)}
                </Text>
              </View>
            ))}
            <View className="flex-row justify-between mt-1 pt-1 border-t border-neutral-100">
              <Text className="text-sm font-semibold">Total</Text>
              <Text className="text-sm font-bold text-brand-600">
                {formatCurrency(item.totalAmount)}
              </Text>
            </View>
          </View>

          <Pressable
            onPress={() => reorder(item)}
            disabled={reorderingId === item.id}
            className={`mt-3 flex-row items-center justify-center rounded-xl py-2.5 ${
              reorderingId === item.id ? 'bg-neutral-200' : 'bg-brand-50 active:bg-brand-100'
            }`}
          >
            {reorderingId === item.id ? (
              <ActivityIndicator size="small" color="#0369a1" />
            ) : (
              <>
                <Ionicons name="refresh" size={15} color="#0369a1" />
                <Text className="ml-1.5 text-sm font-semibold text-brand-700">Re-Order</Text>
              </>
            )}
          </Pressable>
        </View>
      )}
    />
  );
}
