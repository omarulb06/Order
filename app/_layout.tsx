import '../global.css';

import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StripeProvider } from '@stripe/stripe-react-native';
import * as SplashScreen from 'expo-splash-screen';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { configureNotifications, registerForOrderNotifications } from '@/lib/notifications';
import { stripePublishableKey } from '@/lib/stripe';
import { initI18n } from '@/lib/i18n';
// Importing the firebase module here guarantees initializeApp runs before
// any other code touches auth / firestore.
import '@/lib/firebase';

SplashScreen.preventAutoHideAsync().catch(() => {});
configureNotifications();
initI18n().catch(() => {});

export default function RootLayout() {
  const initAuth      = useAuthStore((s) => s.init);
  const subSettings   = useSettingsStore((s) => s.subscribe);
  const initialized   = useAuthStore((s) => s.initialized);

  useEffect(() => {
    const authUnsub     = initAuth();
    const settingsUnsub = subSettings();
    (async () => {
      try {
        await registerForOrderNotifications();
      } finally {
        SplashScreen.hideAsync().catch(() => {});
      }
    })();
    return () => {
      try { authUnsub(); }     catch {}
      try { settingsUnsub(); } catch {}
    };
  }, [initAuth, subSettings]);

  const content = (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <StatusBar style="auto" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: '#0ea5e9' },
            headerTintColor: '#ffffff',
            headerTitleStyle: { fontWeight: '700' },
            contentStyle: { backgroundColor: '#f8fafc' },
          }}
        >
          <Stack.Screen name="index" options={{ title: 'Shop', headerShown: true }} />
          <Stack.Screen name="product/[id]" options={{ title: 'Product' }} />
          <Stack.Screen name="orders" options={{ title: 'My orders' }} />
          <Stack.Screen name="favorites" options={{ title: 'Favorites' }} />
          <Stack.Screen name="profile/edit" options={{ title: 'Edit profile' }} />
          <Stack.Screen name="cart" options={{ title: 'Your cart', presentation: 'modal' }} />
          <Stack.Screen name="checkout" options={{ title: 'Checkout', presentation: 'modal' }} />
          <Stack.Screen
            name="order-confirmation"
            options={{ title: 'Order placed', headerBackVisible: false }}
          />
          <Stack.Screen name="sign-in" options={{ title: 'Sign in', presentation: 'modal' }} />
          <Stack.Screen name="(owner)" options={{ headerShown: false }} />
          <Stack.Screen name="(admin)" options={{ headerShown: false }} />
          <Stack.Screen name="+not-found" options={{ title: 'Not found' }} />
        </Stack>
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );

  // Suppress "unused" warning so React re-renders when auth init completes.
  void initialized;

  if (stripePublishableKey) {
    return (
      <StripeProvider
        publishableKey={stripePublishableKey}
        merchantIdentifier="merchant.com.storename.orderingapp"
      >
        {content}
      </StripeProvider>
    );
  }
  return content;
}
