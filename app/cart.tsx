import { FlatList, Image, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useCartStore } from '@/stores/cart';
import { useSettingsStore } from '@/stores/settings';
import { formatCurrency } from '@/lib/format';

export default function CartScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const lines = useCartStore((s) => s.lines);
  const subtotal = useCartStore((s) => s.subtotal());
  const increment = useCartStore((s) => s.increment);
  const decrement = useCartStore((s) => s.decrement);
  const remove = useCartStore((s) => s.remove);
  const clear = useCartStore((s) => s.clear);
  const settings = useSettingsStore((s) => s.settings);

  const minOrder = settings?.minOrderAmount ?? 0;
  const belowMin = subtotal < minOrder;

  return (
    <View className="flex-1 bg-white dark:bg-neutral-950">
      <FlatList
        data={lines}
        keyExtractor={(l) => l.product.id}
        ListEmptyComponent={
          <View className="items-center justify-center p-10 mt-20">
            <Ionicons name="cart-outline" size={56} color="#94a3b8" />
            <Text className="mt-3 text-neutral-500">{t('cart.empty')}</Text>
            <Pressable
              onPress={() => router.back()}
              className="mt-6 rounded-xl bg-brand-600 px-4 py-2"
            >
              <Text className="text-white font-semibold">{t('common.continueShopping')}</Text>
            </Pressable>
          </View>
        }
        renderItem={({ item }) => (
          <View className="flex-row items-center bg-neutral-50 dark:bg-neutral-900 rounded-xl p-3 mx-3 mb-2">
            {item.product.imageUrl ? (
              <Image
                source={{ uri: item.product.imageUrl }}
                className="w-16 h-16 rounded-lg bg-neutral-200"
                resizeMode="cover"
              />
            ) : (
              <View className="w-16 h-16 rounded-lg bg-neutral-200 items-center justify-center">
                <Ionicons name="image-outline" size={24} color="#94a3b8" />
              </View>
            )}

            <View className="flex-1 ml-3">
              <Text className="text-sm font-semibold text-neutral-900 dark:text-white">
                {item.product.name}
              </Text>
              <Text className="text-xs text-neutral-500">
                {formatCurrency(item.product.price)} each
              </Text>

              <View className="flex-row items-center mt-2">
                <Pressable
                  onPress={() => decrement(item.product.id)}
                  className="h-7 w-7 rounded-full bg-white border border-neutral-200 items-center justify-center"
                >
                  <Ionicons name="remove" size={14} color="#0f172a" />
                </Pressable>
                <Text className="mx-3 font-semibold text-neutral-900 dark:text-white">
                  {item.quantity}
                </Text>
                <Pressable
                  onPress={() => increment(item.product.id)}
                  className="h-7 w-7 rounded-full bg-white border border-neutral-200 items-center justify-center"
                >
                  <Ionicons name="add" size={14} color="#0f172a" />
                </Pressable>

                <Pressable onPress={() => remove(item.product.id)} className="ml-auto p-1">
                  <Ionicons name="trash-outline" size={18} color="#be123c" />
                </Pressable>
              </View>
            </View>

            <Text className="ml-2 font-bold text-brand-600">
              {formatCurrency(item.quantity * item.product.price)}
            </Text>
          </View>
        )}
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 220 }}
      />

      {lines.length > 0 && (
        <View className="absolute bottom-0 left-0 right-0 bg-white dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-800 px-4 pt-4 pb-8">
          <View className="flex-row justify-between mb-1">
            <Text className="text-neutral-500">{t('cart.subtotal')}</Text>
            <Text className="font-semibold">{formatCurrency(subtotal)}</Text>
          </View>
          {minOrder > 0 && (
            <View className="flex-row justify-between mb-3">
              <Text className="text-neutral-500">{t('cart.minOrder')}</Text>
              <Text className={belowMin ? 'text-rose-600 font-semibold' : 'text-neutral-500'}>
                {formatCurrency(minOrder)}
              </Text>
            </View>
          )}

          <Pressable
            disabled={belowMin}
            onPress={() => router.push('/checkout')}
            className={`rounded-xl px-4 py-3 items-center ${
              belowMin ? 'bg-neutral-300' : 'bg-brand-600 active:bg-brand-700'
            }`}
          >
            <Text className="text-white font-bold">
              {belowMin
                ? t('cart.addMore', { amount: formatCurrency(minOrder - subtotal) })
                : t('cart.checkout')}
            </Text>
          </Pressable>

          <Pressable onPress={clear} className="mt-2 items-center py-2">
            <Text className="text-xs text-neutral-500">{t('cart.clear')}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
