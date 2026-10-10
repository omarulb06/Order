import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  /** 0..5, supports halves for display. */
  value: number;
  size?: number;
  /** When provided the row becomes interactive (tap to set 1..5). */
  onChange?: (rating: number) => void;
}

/**
 * Star rating row. Read-only when `onChange` is omitted (renders full /
 * half / outline stars for the aggregate), interactive when provided.
 */
export function Stars({ value, size = 16, onChange }: Props) {
  const stars = [1, 2, 3, 4, 5];
  return (
    <View className="flex-row items-center">
      {stars.map((i) => {
        const icon =
          value >= i ? 'star' : value >= i - 0.5 ? 'star-half' : 'star-outline';
        const star = (
          <Ionicons
            key={i}
            name={icon as any}
            size={size}
            color="#f59e0b"
          />
        );
        if (!onChange) {
          return <View key={i} className="mr-0.5">{star}</View>;
        }
        return (
          <Pressable
            key={i}
            onPress={() => onChange(i)}
            hitSlop={6}
            className="mr-1"
          >
            {star}
          </Pressable>
        );
      })}
    </View>
  );
}
