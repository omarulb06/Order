import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { StatusBadge } from './StatusBadge';
import { formatCurrency, formatDate, shortId } from '@/lib/format';
import type { Order, OrderStatus } from '@/types/database';
import { notifyCustomerStatus } from '@/lib/whatsapp';

interface Props {
  order: Order;
  itemCount?: number;
  onAdvance?: (nextStatus: OrderStatus) => void;
  onCancel?: () => void;
  readOnly?: boolean;
}

const NEXT: Record<OrderStatus, OrderStatus | null> = {
  pending: 'preparing',
  preparing: 'out_for_delivery',
  out_for_delivery: 'delivered',
  delivered: null,
  cancelled: null,
};

const NEXT_LABEL_KEY: Record<OrderStatus, string> = {
  pending: 'owner.actions.startPreparing',
  preparing: 'owner.actions.sendOut',
  out_for_delivery: 'owner.actions.markDelivered',
  delivered: 'owner.actions.completed',
  cancelled: 'owner.actions.cancelled',
};

export function OrderCard({ order, itemCount, onAdvance, onCancel, readOnly }: Props) {
  const { t } = useTranslation();
  const nextStatus = NEXT[order.status];

  return (
    <View className="rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-4 mb-3">
      <View className="flex-row items-start justify-between">
        <View className="flex-1 pr-2">
          <Text className="text-sm text-neutral-500">Order #{shortId(order.id)}</Text>
          <Text className="text-base font-semibold text-neutral-900 dark:text-white mt-0.5">
            {order.customerName}
          </Text>
          <Text className="text-xs text-neutral-500 mt-0.5">
            {order.phoneNumber} · {order.fulfillmentType} · {order.paymentMethod}
          </Text>
          <Text className="text-xs text-neutral-400 mt-0.5">{formatDate(order.createdAt)}</Text>
        </View>
        <View className="items-end">
          <StatusBadge status={order.status} />
          <Text className="mt-2 text-base font-bold text-neutral-900 dark:text-white">
            {formatCurrency(order.totalAmount)}
          </Text>
          {typeof itemCount === 'number' && (
            <Text className="text-xs text-neutral-500">{itemCount} item{itemCount === 1 ? '' : 's'}</Text>
          )}
        </View>
      </View>

      {!readOnly && (
        <View className="flex-row flex-wrap mt-3 gap-2">
          {nextStatus && onAdvance && (
            <Pressable
              onPress={() => onAdvance(nextStatus)}
              className="flex-row items-center rounded-xl bg-brand-600 active:bg-brand-700 px-3 py-2"
            >
              <Ionicons name="arrow-forward-circle-outline" size={16} color="white" />
              <Text className="ml-1.5 text-white text-xs font-semibold">
                {t(NEXT_LABEL_KEY[order.status])}
              </Text>
            </Pressable>
          )}

          <Pressable
            onPress={() => notifyCustomerStatus(order, order.status)}
            className="flex-row items-center rounded-xl bg-emerald-600 active:bg-emerald-700 px-3 py-2"
          >
            <Ionicons name="logo-whatsapp" size={16} color="white" />
            <Text className="ml-1.5 text-white text-xs font-semibold">
              {t('owner.actions.whatsApp')}
            </Text>
          </Pressable>

          {order.status !== 'delivered' && order.status !== 'cancelled' && onCancel && (
            <Pressable
              onPress={onCancel}
              className="flex-row items-center rounded-xl bg-rose-100 active:bg-rose-200 px-3 py-2"
            >
              <Ionicons name="close-circle-outline" size={16} color="#be123c" />
              <Text className="ml-1.5 text-rose-700 text-xs font-semibold">
                {t('owner.actions.cancel')}
              </Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}
