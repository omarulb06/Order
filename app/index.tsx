import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CartSummaryFooter } from '@/components/CartSummaryFooter';
import { CategoryChip } from '@/components/CategoryChip';
import { ProductCard } from '@/components/ProductCard';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { COL } from '@/lib/firestore/paths';
import { categoryConverter, productConverter } from '@/lib/firestore/converters';
import { useTranslation } from 'react-i18next';
import { HeaderIconButton } from '@/components/HeaderIconButton';
import { LanguagePicker } from '@/components/LanguagePicker';
import { useAuthStore } from '@/stores/auth';
import type { Category, Product } from '@/types/database';

export default function HomeScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);

  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    const catsQ  = query(
      collection(db, COL.categories).withConverter(categoryConverter),
      orderBy('sortOrder', 'asc')
    );
    const prodsQ = query(
      collection(db, COL.products).withConverter(productConverter),
      orderBy('name', 'asc')
    );
    const [catsSnap, prodsSnap] = await Promise.all([getDocs(catsQ), getDocs(prodsQ)]);
    setCategories(catsSnap.docs.map((d) => d.data()));
    setProducts(prodsSnap.docs.map((d) => d.data()));
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    let list = products;
    if (activeCategory) list = list.filter((p) => p.categoryId === activeCategory);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.description ?? '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [products, activeCategory, search]);

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-neutral-50 dark:bg-neutral-950">
      {/* Store header banner */}
      <View className="bg-brand-600 px-4 pt-2 pb-5">
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-white/80 text-xs">
              {t('shop.welcome')}{profile?.fullName ? `, ${profile.fullName.split(' ')[0]}` : ''}
            </Text>
            <Text className="text-white text-2xl font-bold">{t('shop.storeName')}</Text>
          </View>

          <View className="flex-row items-center flex-wrap justify-end">
            <LanguagePicker />
            <HeaderIconButton
              icon="heart-outline"
              accessibilityLabel={t('favorites.title')}
              onPress={() => router.push('/favorites' as any)}
            />
            {user && (
              <>
                <HeaderIconButton
                  icon="receipt-outline"
                  accessibilityLabel={t('orders.title')}
                  onPress={() => router.push('/orders' as any)}
                />
                <HeaderIconButton
                  icon="person-outline"
                  accessibilityLabel={t('profile.title')}
                  onPress={() => router.push('/profile/edit' as any)}
                />
              </>
            )}
            {profile?.role === 'owner' && (
              <HeaderIconButton
                icon="briefcase-outline"
                accessibilityLabel="Owner dashboard"
                onPress={() => router.push('/(owner)/dashboard' as any)}
              />
            )}
            {profile?.role === 'admin' && (
              <HeaderIconButton
                icon="shield-checkmark-outline"
                accessibilityLabel="Admin audit"
                onPress={() => router.push('/(admin)/audit' as any)}
              />
            )}
            {user ? (
              <HeaderIconButton
                icon="log-out-outline"
                accessibilityLabel={t('common.signOut')}
                last
                onPress={() => useAuthStore.getState().signOut()}
              />
            ) : (
              <Pressable
                onPress={() => router.push('/sign-in')}
                accessibilityRole="button"
                accessibilityLabel={t('common.signIn')}
                hitSlop={6}
                className="h-12 flex-row items-center rounded-full bg-white px-5 active:bg-brand-50"
              >
                <Ionicons name="log-in-outline" size={22} color="#0369a1" />
                <Text className="ml-2 text-base font-bold text-brand-700">
                  {t('common.signIn')}
                </Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* Search bar */}
        <View className="mt-4 flex-row items-center bg-white rounded-xl px-3 py-2">
          <Ionicons name="search" size={18} color="#64748b" />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={t('shop.searchPlaceholder')}
            placeholderTextColor="#94a3b8"
            className="ml-2 flex-1 text-neutral-900"
          />
          {search ? (
            <Pressable onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color="#94a3b8" />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Category chips */}
      <View className="pt-3">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 12 }}
        >
          <CategoryChip
            label={t('shop.all')}
            active={activeCategory === null}
            onPress={() => setActiveCategory(null)}
          />
          {categories.map((c) => (
            <CategoryChip
              key={c.id}
              label={c.name}
              active={activeCategory === c.id}
              onPress={() => setActiveCategory(c.id)}
            />
          ))}
        </ScrollView>
      </View>

      {/* Product grid */}
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#0ea5e9" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => <ProductCard product={item} />}
          numColumns={2}
          contentContainerStyle={{ paddingHorizontal: 4, paddingTop: 8, paddingBottom: 140 }}
          ListEmptyComponent={
            <View className="items-center justify-center mt-20 px-6">
              <Ionicons name="basket-outline" size={48} color="#94a3b8" />
              <Text className="mt-2 text-neutral-500 text-center">
                {t('shop.emptyProducts')}
              </Text>
            </View>
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
            />
          }
        />
      )}

      <CartSummaryFooter />
    </SafeAreaView>
  );
}
