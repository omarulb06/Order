import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
} from 'firebase/firestore';
import { OrderCard } from '@/components/OrderCard';
import { db } from '@/lib/firebase';
import { COL } from '@/lib/firestore/paths';
import { orderConverter, productConverter } from '@/lib/firestore/converters';
import { formatCurrency } from '@/lib/format';
import type { Order, OrderStatus, Product } from '@/types/database';

type Section = 'orders' | 'low_stock';

export default function AuditScreen() {
  const [section, setSection] = useState<Section>('orders');
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('');
  const [status, setStatus] = useState<OrderStatus | 'all'>('all');

  const load = useCallback(async () => {
    const ordersQ = query(
      collection(db, COL.orders).withConverter(orderConverter),
      orderBy('createdAt', 'desc'),
      limit(200)
    );
    const productsQ = query(
      collection(db, COL.products).withConverter(productConverter),
      orderBy('stockQuantity', 'asc'),
      limit(100)
    );
    const [ordersSnap, productsSnap] = await Promise.all([
      getDocs(ordersQ),
      getDocs(productsQ),
    ]);
    setOrders(ordersSnap.docs.map((d) => d.data()));
    setProducts(productsSnap.docs.map((d) => d.data()));
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    let list = orders;
    if (status !== 'all') list = list.filter((o) => o.status === status);
    const q = filter.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (o) =>
          o.customerName.toLowerCase().includes(q) ||
          o.phoneNumber.includes(q) ||
          o.id.toLowerCase().includes(q)
      );
    }
    return list;
  }, [orders, status, filter]);

  const totals = useMemo(() => {
    return orders.reduce(
      (acc, o) => {
        acc.count += 1;
        acc.gross += Number(o.totalAmount);
        return acc;
      },
      { count: 0, gross: 0 }
    );
  }, [orders]);

  const itemCountFor = (o: Order) =>
    (o.items ?? []).reduce((s, it) => s + (it.quantity ?? 0), 0);

  const STATUSES: (OrderStatus | 'all')[] = [
    'all',
    'pending',
    'preparing',
    'out_for_delivery',
    'delivered',
    'cancelled',
  ];

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color="#0ea5e9" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-neutral-50">
      {/* Section switcher */}
      <View className="flex-row m-3 bg-neutral-100 rounded-xl p-1">
        <Pressable
          onPress={() => setSection('orders')}
          className={`flex-1 py-2 rounded-lg items-center ${
            section === 'orders' ? 'bg-white shadow' : ''
          }`}
        >
          <Text className={section === 'orders' ? 'font-bold' : ''}>Orders</Text>
        </Pressable>
        <Pressable
          onPress={() => setSection('low_stock')}
          className={`flex-1 py-2 rounded-lg items-center ${
            section === 'low_stock' ? 'bg-white shadow' : ''
          }`}
        >
          <Text className={section === 'low_stock' ? 'font-bold' : ''}>Stock levels</Text>
        </Pressable>
      </View>

      {section === 'orders' ? (
        <>
          {/* Summary bar */}
          <View className="mx-3 mb-2 flex-row bg-brand-50 rounded-xl p-3">
            <View className="flex-1">
              <Text className="text-xs text-neutral-500">Orders (last 200)</Text>
              <Text className="font-bold text-neutral-900">{totals.count}</Text>
            </View>
            <View className="flex-1">
              <Text className="text-xs text-neutral-500">Gross</Text>
              <Text className="font-bold text-brand-700">
                {formatCurrency(totals.gross)}
              </Text>
            </View>
          </View>

          {/* Filters */}
          <View className="px-3">
            <View className="flex-row items-center bg-white rounded-xl px-3 py-2 border border-neutral-200 mb-2">
              <Ionicons name="search" size={16} color="#64748b" />
              <TextInput
                placeholder="Search by name, phone, or order id"
                placeholderTextColor="#94a3b8"
                value={filter}
                onChangeText={setFilter}
                className="ml-2 flex-1"
                autoCapitalize="none"
              />
            </View>
            <View className="flex-row flex-wrap">
              {STATUSES.map((s) => (
                <Pressable
                  key={s}
                  onPress={() => setStatus(s)}
                  className={`mr-2 mb-2 px-3 py-1.5 rounded-full border ${
                    status === s
                      ? 'bg-brand-600 border-brand-600'
                      : 'bg-white border-neutral-200'
                  }`}
                >
                  <Text
                    className={`text-xs capitalize ${
                      status === s ? 'text-white' : 'text-neutral-700'
                    }`}
                  >
                    {s.replace(/_/g, ' ')}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <FlatList
            data={filtered}
            keyExtractor={(o) => o.id}
            contentContainerStyle={{ padding: 12, paddingBottom: 32 }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true);
                  load();
                }}
              />
            }
            ListEmptyComponent={
              <View className="items-center mt-20">
                <Ionicons name="document-text-outline" size={44} color="#94a3b8" />
                <Text className="mt-2 text-neutral-500">No orders match the filters.</Text>
              </View>
            }
            renderItem={({ item }) => (
              <OrderCard order={item} itemCount={itemCountFor(item)} readOnly />
            )}
          />
        </>
      ) : (
        <FlatList
          data={products}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: 12 }}
          renderItem={({ item }) => {
            const low = item.stockQuantity <= 5;
            return (
              <View className="bg-white rounded-xl p-3 mb-2 flex-row items-center">
                <View
                  className={`h-10 w-10 rounded-full items-center justify-center ${
                    low ? 'bg-rose-100' : 'bg-emerald-100'
                  }`}
                >
                  <Ionicons
                    name={low ? 'alert' : 'checkmark'}
                    size={18}
                    color={low ? '#be123c' : '#059669'}
                  />
                </View>
                <View className="flex-1 ml-3">
                  <Text className="font-semibold" numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text className="text-xs text-neutral-500">
                    {formatCurrency(item.price)} · {item.isAvailable ? 'Available' : 'Hidden'}
                  </Text>
                </View>
                <Text className={`font-bold ${low ? 'text-rose-600' : 'text-neutral-900'}`}>
                  {item.stockQuantity}
                </Text>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}
