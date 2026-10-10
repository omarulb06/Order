import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCartStore } from '@/stores/cart';
import { formatCurrency } from '@/lib/format';

export function CartSummaryFooter() {
  const router = useRouter();
  const itemCount = useCartStore((s) => s.itemCount());
  const subtotal = useCartStore((s) => s.subtotal());

  if (itemCount === 0) return null;

  return (
    <View className="absolute bottom-0 left-0 right-0 px-4 pb-6 pt-3 bg-white dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-800">
      <Pressable
        onPress={() => router.push('/cart')}
        className="flex-row items-center justify-between rounded-xl bg-brand-600 active:bg-brand-700 px-4 py-3"
      >
        <View className="flex-row items-center">
          <View className="h-7 w-7 items-center justify-center rounded-full bg-white/20 mr-3">
            <Text className="text-white font-bold">{itemCount}</Text>
          </View>
          <Text className="text-white font-semibold">View cart</Text>
        </View>
        <View className="flex-row items-center">
          <Text className="text-white font-bold mr-2">{formatCurrency(subtotal)}</Text>
          <Ionicons name="arrow-forward" size={18} color="white" />
        </View>
      </Pressable>
    </View>
  );
}
