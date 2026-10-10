import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { paths } from '@/lib/firestore/paths';
import { orderConverter } from '@/lib/firestore/converters';
import { useAuthStore } from '@/stores/auth';
import { useRecentOrderStore } from '@/stores/recentOrder';
import { StatusBadge } from '@/components/StatusBadge';
import { formatCurrency, shortId } from '@/lib/format';
import { buildWhatsAppLink, openWhatsApp } from '@/lib/whatsapp';
import type { Order, OrderItem } from '@/types/database';
import { Linking } from 'react-native';

export default function OrderConfirmationScreen() {
  const router = useRouter();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();

  const user = useAuthStore((s) => s.user);
  const cachedOrder = useRecentOrderStore((s) => s.order);
  const cachedItems = useRecentOrderStore((s) => s.items);

  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderId) return;

    // Prefer the locally-cached snapshot (works for guests + authed).
    if (cachedOrder && cachedOrder.id === orderId) {
      setOrder(cachedOrder);
      setItems(cachedItems);
      setLoading(false);
      return;
    }

    // Fallback to Firestore — only possible for authenticated users
    // (Firestore rules deny guest reads of /orders/{id} unless staff).
    if (!user) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const snap = await getDoc(
          doc(db, paths.order(orderId)).withConverter(orderConverter)
        );
        if (snap.exists()) {
          const o = snap.data();
          setOrder(o);
          setItems(o.items ?? []);
        } else {
          setOrder(null);
        }
      } catch {
        setOrder(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [orderId, user, cachedOrder, cachedItems]);

  const contactStore = async () => {
    const number = process.env.EXPO_PUBLIC_STORE_WHATSAPP;
    if (!number || !order) return;
    const msg = `Hi! I just placed order #${shortId(order.id)}.`;
    const url = buildWhatsAppLink(`+${number}`, msg);
    try {
      await Linking.openURL(url);
    } catch {
      await openWhatsApp(`+${number}`, msg);
    }
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color="#0ea5e9" />
      </View>
    );
  }

  if (!order) {
    return (
      <View className="flex-1 items-center justify-center bg-white p-6">
        <Ionicons name="alert-circle-outline" size={48} color="#be123c" />
        <Text className="mt-2 text-center text-neutral-600">
          Order could not be loaded.
        </Text>
        <Pressable onPress={() => router.replace('/')} className="mt-4 rounded-xl bg-brand-600 px-4 py-2">
          <Text className="text-white font-semibold">Back to shop</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 20 }} className="bg-white flex-1">
      <View className="items-center">
        <View className="h-16 w-16 rounded-full bg-emerald-100 items-center justify-center">
          <Ionicons name="checkmark-circle" size={44} color="#059669" />
        </View>
        <Text className="mt-3 text-xl font-bold">Thank you!</Text>
        <Text className="mt-1 text-neutral-500">
          Your order has been received.
        </Text>
      </View>

      <View className="mt-6 rounded-2xl bg-neutral-50 p-4">
        <View className="flex-row justify-between items-center">
          <Text className="text-sm text-neutral-500">Order #</Text>
          <Text className="font-bold">{shortId(order.id)}</Text>
        </View>
        <View className="flex-row justify-between items-center mt-2">
          <Text className="text-sm text-neutral-500">Status</Text>
          <StatusBadge status={order.status} />
        </View>
        <View className="flex-row justify-between items-center mt-2">
          <Text className="text-sm text-neutral-500">Fulfillment</Text>
          <Text className="capitalize">{order.fulfillmentType}</Text>
        </View>
        <View className="flex-row justify-between items-center mt-2">
          <Text className="text-sm text-neutral-500">Payment</Text>
          <Text className="capitalize">{order.paymentMethod}</Text>
        </View>
      </View>

      <Text className="mt-6 font-semibold">Items</Text>
      <View className="mt-2 rounded-2xl bg-neutral-50 p-3">
        {items.map((it, idx) => (
          <View key={`${it.productId}-${idx}`} className="flex-row justify-between py-1.5">
            <Text className="flex-1 text-neutral-700">
              {it.quantity}× {it.productName}
            </Text>
            <Text className="text-neutral-700">
              {formatCurrency(it.subtotal ?? it.quantity * it.unitPrice)}
            </Text>
          </View>
        ))}
        <View className="h-px bg-neutral-200 my-2" />
        <View className="flex-row justify-between">
          <Text className="text-neutral-500">Delivery</Text>
          <Text>{formatCurrency(order.deliveryFee)}</Text>
        </View>
        <View className="flex-row justify-between mt-1">
          <Text className="font-bold">Total</Text>
          <Text className="font-bold text-brand-600">
            {formatCurrency(order.totalAmount)}
          </Text>
        </View>
      </View>

      {process.env.EXPO_PUBLIC_STORE_WHATSAPP ? (
        <Pressable
          onPress={contactStore}
          className="mt-6 rounded-xl bg-emerald-600 active:bg-emerald-700 px-4 py-3 flex-row items-center justify-center"
        >
          <Ionicons name="logo-whatsapp" size={18} color="white" />
          <Text className="ml-2 text-white font-bold">Contact store on WhatsApp</Text>
        </Pressable>
      ) : null}

      <Pressable
        onPress={() => router.replace('/')}
        className="mt-3 rounded-xl bg-brand-600 active:bg-brand-700 px-4 py-3 items-center"
      >
        <Text className="text-white font-bold">Continue shopping</Text>
      </Pressable>
    </ScrollView>
  );
}
