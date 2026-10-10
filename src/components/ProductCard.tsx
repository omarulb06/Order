import { Image, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCartStore } from '@/stores/cart';
import { useWishlistStore } from '@/stores/wishlist';
import { formatCurrency } from '@/lib/format';
import type { Product } from '@/types/database';

interface Props {
  product: Product;
}

export function ProductCard({ product }: Props) {
  const router = useRouter();
  const addToCart = useCartStore((s) => s.add);
  const lineInCart = useCartStore((s) => s.lines.find((l) => l.product.id === product.id));
  const isFav = useWishlistStore((s) => s.ids.includes(product.id));
  const toggleFav = useWishlistStore((s) => s.toggle);
  const outOfStock = !product.isAvailable || product.stockQuantity <= 0;
  const hasReviews = (product.reviewCount ?? 0) > 0;

  return (
    <Pressable
      onPress={() => router.push(`/product/${product.id}` as any)}
      className="flex-1 m-2 rounded-2xl bg-white dark:bg-neutral-900 shadow-sm overflow-hidden active:opacity-90"
    >
      <View className="aspect-square bg-neutral-100 dark:bg-neutral-800">
        {product.imageUrl ? (
          <Image
            source={{ uri: product.imageUrl }}
            className="w-full h-full"
            resizeMode="cover"
          />
        ) : (
          <View className="w-full h-full items-center justify-center">
            <Ionicons name="image-outline" size={36} color="#94a3b8" />
          </View>
        )}
        {outOfStock && (
          <View className="absolute inset-0 items-center justify-center bg-black/40">
            <Text className="text-white font-semibold">Out of stock</Text>
          </View>
        )}
        <Pressable
          onPress={() => toggleFav(product.id)}
          hitSlop={8}
          className="absolute top-2 right-2 h-8 w-8 rounded-full bg-white/90 items-center justify-center shadow"
        >
          <Ionicons
            name={isFav ? 'heart' : 'heart-outline'}
            size={17}
            color={isFav ? '#e11d48' : '#475569'}
          />
        </Pressable>
      </View>

      <View className="p-3">
        <Text numberOfLines={1} className="text-base font-semibold text-neutral-900 dark:text-white">
          {product.name}
        </Text>

        {hasReviews && (
          <View className="mt-0.5 flex-row items-center">
            <Ionicons name="star" size={12} color="#f59e0b" />
            <Text className="ml-1 text-xs font-medium text-neutral-600 dark:text-neutral-300">
              {product.averageRating.toFixed(1)}
            </Text>
            <Text className="ml-1 text-[10px] text-neutral-400">
              ({product.reviewCount})
            </Text>
          </View>
        )}

        {product.description ? (
          <Text
            numberOfLines={2}
            className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400"
          >
            {product.description}
          </Text>
        ) : null}

        <View className="mt-2 flex-row items-center justify-between">
          <Text className="text-base font-bold text-brand-600">
            {formatCurrency(product.price)}
          </Text>

          <Pressable
            onPress={() => !outOfStock && addToCart(product)}
            disabled={outOfStock}
            className={`flex-row items-center rounded-full px-3 py-1.5 ${
              outOfStock ? 'bg-neutral-300' : 'bg-brand-600 active:bg-brand-700'
            }`}
          >
            <Ionicons name="add" size={16} color="white" />
            <Text className="ml-1 text-xs font-semibold text-white">
              {lineInCart ? `In cart (${lineInCart.quantity})` : 'Add'}
            </Text>
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}
