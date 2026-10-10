import { Pressable, Text } from 'react-native';

interface Props {
  label: string;
  active?: boolean;
  onPress?: () => void;
}

export function CategoryChip({ label, active, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      className={`px-4 py-2 mr-2 rounded-full border ${
        active
          ? 'bg-brand-600 border-brand-600'
          : 'bg-white border-neutral-200 dark:bg-neutral-900 dark:border-neutral-700'
      }`}
    >
      <Text
        className={`text-sm font-medium ${
          active ? 'text-white' : 'text-neutral-700 dark:text-neutral-200'
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}
