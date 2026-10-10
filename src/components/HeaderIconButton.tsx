import { Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  accessibilityLabel?: string;
  /** Render as the last item (no trailing margin). */
  last?: boolean;
}

/**
 * Large, finger-friendly header action button.
 * 48×48dp touch target (exceeds the 44dp HIG minimum) with a 24dp glyph.
 */
export function HeaderIconButton({ icon, onPress, accessibilityLabel, last }: Props) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={6}
      className={`h-12 w-12 items-center justify-center rounded-full bg-white/15 active:bg-white/30 ${
        last ? '' : 'mr-2'
      }`}
    >
      <Ionicons name={icon} size={24} color="white" />
    </Pressable>
  );
}
