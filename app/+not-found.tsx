import { Link, Stack } from 'expo-router';
import { Text, View } from 'react-native';

export default function NotFound() {
  return (
    <>
      <Stack.Screen options={{ title: 'Not found' }} />
      <View className="flex-1 items-center justify-center p-6 bg-white">
        <Text className="text-2xl font-bold">404</Text>
        <Text className="mt-2 text-neutral-500">That page could not be found.</Text>
        <Link href="/" className="mt-4 text-brand-600 font-semibold">
          Go home
        </Link>
      </View>
    </>
  );
}
