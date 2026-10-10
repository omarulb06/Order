import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { OrderStatus } from '@/types/database';

const STYLE: Record<OrderStatus, { bg: string; text: string }> = {
  pending:          { bg: 'bg-amber-100',   text: 'text-amber-800'   },
  preparing:        { bg: 'bg-blue-100',    text: 'text-blue-800'    },
  out_for_delivery: { bg: 'bg-violet-100',  text: 'text-violet-800'  },
  delivered:        { bg: 'bg-emerald-100', text: 'text-emerald-800' },
  cancelled:        { bg: 'bg-rose-100',    text: 'text-rose-800'    },
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  const { t } = useTranslation();
  const s = STYLE[status];
  return (
    <View className={`self-start rounded-full px-2.5 py-1 ${s.bg}`}>
      <Text className={`text-xs font-semibold ${s.text}`}>{t(`status.${status}`)}</Text>
    </View>
  );
}
