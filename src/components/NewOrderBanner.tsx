import { useEffect, useRef } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatCurrency, shortId } from '@/lib/format';
import type { Order } from '@/types/database';

interface Props {
  order: Order | null;
  onDismiss: () => void;
  onOpen: () => void;
}

/**
 * Floating banner shown when a new row is inserted into `orders` via the
 * realtime subscription. Pairs with the local notification + chime fired
 * from the Owner dashboard.
 */
export function NewOrderBanner({ order, onDismiss, onOpen }: Props) {
  const translate = useRef(new Animated.Value(-120)).current;

  useEffect(() => {
    Animated.spring(translate, {
      toValue: order ? 0 : -120,
      useNativeDriver: true,
      bounciness: 8,
    }).start();
  }, [order, translate]);

  if (!order) return null;

  return (
    <Animated.View
      style={{ transform: [{ translateY: translate }] }}
      className="absolute top-0 left-0 right-0 z-50 px-3 pt-10"
    >
      <View className="rounded-2xl bg-brand-600 shadow-lg px-4 py-3 flex-row items-center">
        <View className="h-10 w-10 rounded-full bg-white/20 items-center justify-center mr-3">
          <Ionicons name="notifications" size={20} color="white" />
        </View>
        <Pressable className="flex-1" onPress={onOpen}>
          <Text className="text-white font-semibold">
            New order #{shortId(order.id)} · {formatCurrency(order.totalAmount)}
          </Text>
          <Text className="text-white/80 text-xs mt-0.5">
            {order.customerName} · {order.fulfillmentType}
          </Text>
        </Pressable>
        <Pressable onPress={onDismiss} className="ml-2 p-1">
          <Ionicons name="close" size={20} color="white" />
        </Pressable>
      </View>
    </Animated.View>
  );
}
