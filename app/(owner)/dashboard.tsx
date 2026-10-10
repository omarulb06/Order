import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  where,
} from 'firebase/firestore';
import { OrderCard } from '@/components/OrderCard';
import { NewOrderBanner } from '@/components/NewOrderBanner';
import { db } from '@/lib/firebase';
import { COL } from '@/lib/firestore/paths';
import { orderConverter } from '@/lib/firestore/converters';
import { updateOrderStatus } from '@/lib/firestore/orders';
import { notifyCustomerStatus } from '@/lib/whatsapp';
import { presentNewOrderAlert } from '@/lib/notifications';
import type { Order, OrderStatus } from '@/types/database';

const TABS: { key: OrderStatus; labelKey: string; color: string }[] = [
  { key: 'pending',          labelKey: 'owner.tabs.pending',   color: 'bg-amber-500'   },
  { key: 'preparing',        labelKey: 'owner.tabs.preparing', color: 'bg-blue-500'    },
  { key: 'out_for_delivery', labelKey: 'owner.tabs.onRoute',   color: 'bg-violet-500'  },
  { key: 'delivered',        labelKey: 'owner.tabs.delivered', color: 'bg-emerald-500' },
];

/**
 * Live-updating Owner Order Desk.
 *
 * Replaces the previous Supabase Realtime subscription with a Firestore
 * onSnapshot() listener filtered to the last 48 hours of orders, sorted
 * newest-first. When a new document with status === 'pending' arrives
 * since the first snapshot, we fire the visual + audible alert.
 */
export default function OwnerDashboard() {
  const { t } = useTranslation();
  const [orders, setOrders] = useState<Order[]>([]);
  const [activeTab, setActiveTab] = useState<OrderStatus>('pending');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [banner, setBanner] = useState<Order | null>(null);

  // Track which order ids we've already shown an alert for, so remounts
  // / re-snapshots don't re-fire the chime.
  const alertedRef = useRef<Set<string>>(new Set());
  const bootstrappedRef = useRef(false);

  useEffect(() => {
    const sinceIso = new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString();
    const since = Timestamp.fromDate(new Date(sinceIso));

    const q = query(
      collection(db, COL.orders).withConverter(orderConverter),
      where('createdAt', '>=', since),
      orderBy('createdAt', 'desc')
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const next = snap.docs.map((d) => d.data());
        setOrders(next);
        setLoading(false);
        setRefreshing(false);

        // Trigger alerts for any new PENDING orders after bootstrap.
        if (bootstrappedRef.current) {
          for (const change of snap.docChanges()) {
            if (change.type === 'added') {
              const o = change.doc.data();
              if (o.status === 'pending' && !alertedRef.current.has(o.id)) {
                alertedRef.current.add(o.id);
                setBanner(o);
                presentNewOrderAlert({
                  title: 'New order received',
                  body:  `${o.customerName} · ${o.fulfillmentType}`,
                  orderId: o.id,
                });
              }
            }
          }
        } else {
          // Mark the initial snapshot's pending orders as already-alerted
          // so re-renders don't re-notify.
          for (const o of next) {
            if (o.status === 'pending') alertedRef.current.add(o.id);
          }
          bootstrappedRef.current = true;
        }
      },
      (err) => {
        Alert.alert('Error loading orders', err.message);
        setLoading(false);
        setRefreshing(false);
      }
    );

    return () => unsub();
  }, []);

  const bucketed = useMemo(() => {
    const map: Record<OrderStatus, Order[]> = {
      pending: [],
      preparing: [],
      out_for_delivery: [],
      delivered: [],
      cancelled: [],
    };
    for (const o of orders) map[o.status].push(o);
    return map;
  }, [orders]);

  const itemCountFor = (o: Order) =>
    (o.items ?? []).reduce((s, it) => s + (it.quantity ?? 0), 0);

  const advance = async (order: Order, nextStatus: OrderStatus) => {
    try {
      await updateOrderStatus(order.id, nextStatus);
    } catch (err: any) {
      Alert.alert('Could not update order', err?.message ?? 'Unknown error');
      return;
    }
    try {
      await notifyCustomerStatus({ ...order, status: nextStatus }, nextStatus);
    } catch (err: any) {
      Alert.alert('WhatsApp failed', err?.message ?? 'Unknown error');
    }
  };

  const cancel = async (order: Order) => {
    Alert.alert('Cancel order?', 'This cannot be undone.', [
      { text: 'Keep order', style: 'cancel' },
      {
        text: 'Cancel order',
        style: 'destructive',
        onPress: async () => {
          try {
            await updateOrderStatus(order.id, 'cancelled');
          } catch (err: any) {
            Alert.alert('Could not cancel', err?.message ?? 'Unknown error');
            return;
          }
          notifyCustomerStatus({ ...order, status: 'cancelled' }, 'cancelled').catch(() => {});
        },
      },
    ]);
  };

  const data = bucketed[activeTab];

  return (
    <View className="flex-1 bg-neutral-50">
      <NewOrderBanner
        order={banner}
        onDismiss={() => setBanner(null)}
        onOpen={() => {
          if (banner) setActiveTab(banner.status);
          setBanner(null);
        }}
      />

      {/* Tab bar */}
      <View className="flex-row flex-wrap p-3 gap-2">
        {TABS.map((tab) => {
          const count = bucketed[tab.key].length;
          const active = tab.key === activeTab;
          return (
            <Pressable
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              className={`flex-row items-center rounded-full px-3 py-1.5 ${
                active ? tab.color : 'bg-white border border-neutral-200'
              }`}
            >
              <Text className={`text-xs font-semibold ${active ? 'text-white' : 'text-neutral-700'}`}>
                {t(tab.labelKey)}
              </Text>
              <View
                className={`ml-2 min-w-[22px] px-1.5 py-0.5 rounded-full items-center justify-center ${
                  active ? 'bg-white/25' : 'bg-neutral-100'
                }`}
              >
                <Text className={`text-[10px] font-bold ${active ? 'text-white' : 'text-neutral-700'}`}>
                  {count}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#0ea5e9" />
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(o) => o.id}
          contentContainerStyle={{ padding: 12, paddingBottom: 32 }}
          ListEmptyComponent={
            <View className="items-center mt-20">
              <Ionicons name="checkmark-done-outline" size={44} color="#94a3b8" />
              <Text className="mt-2 text-neutral-500">{t('owner.emptyBucket')}</Text>
            </View>
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => setRefreshing(true)}
            />
          }
          renderItem={({ item }) => (
            <OrderCard
              order={item}
              itemCount={itemCountFor(item)}
              onAdvance={(next) => advance(item, next)}
              onCancel={() => cancel(item)}
            />
          )}
        />
      )}
    </View>
  );
}
