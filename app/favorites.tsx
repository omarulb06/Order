// ---------------------------------------------------------------------------
// Favorites — the user's wishlist as a shoppable grid.
//
// Streams the full products collection once (small catalogs) and filters by
// the locally-persisted wishlist ids. Works for guests (AsyncStorage) and
// signed-in users (ids merged from /profiles/{uid}/wishlist on login).
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';

import { ProductCard } from '@/components/ProductCard';
import { db } from '@/lib/firebase';
import { COL } from '@/lib/firestore/paths';
import { productConverter } from '@/lib/firestore/converters';
import { useWishlistStore } from '@/stores/wishlist';
import type { Product } from '@/types/database';

export default function FavoritesScreen() {
  const router = useRouter();
  const ids = useWishlistStore((s) => s.ids);
  const [products, setProducts] = useState<Product[] | null>(null);

  useEffect(() => {
    const q = query(
      collection(db, COL.products).withConverter(productConverter),
      orderBy('name', 'asc')
    );
    const unsub = onSnapshot(q, (snap) => {
      setProducts(snap.docs.map((d) => d.data()));
    });
    return unsub;
  }, []);

  const favorites = useMemo(() => {
    if (!products) return [];
    const wanted = new Set(ids);
    return products.filter((p) => wanted.has(p.id));
  }, [products, ids]);

  if (products === null) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color="#0ea5e9" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-neutral-50">
      <FlatList
        data={favorites}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => <ProductCard product={item} />}
        numColumns={2}
        contentContainerStyle={{ paddingHorizontal: 4, paddingTop: 8, paddingBottom: 40 }}
        ListEmptyComponent={
          <View className="items-center justify-center mt-24 px-6">
            <Ionicons name="heart-dislike-outline" size={48} color="#94a3b8" />
            <Text className="mt-3 text-neutral-500 text-center">
              No favorites yet. Tap the heart on any product to save it here.
            </Text>
            <Pressable
              onPress={() => router.push('/' as any)}
              className="mt-4 rounded-xl bg-brand-600 px-4 py-2"
            >
              <Text className="text-white font-semibold">Browse products</Text>
            </Pressable>
          </View>
        }
      />
    </View>
  );
}
