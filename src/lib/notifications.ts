import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * Configure how notifications display when the app is foregrounded.
 * Called once at app startup from the root layout.
 */
export function configureNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

/**
 * Request permission and set up an Android high-importance channel for
 * live order alerts (sound + vibration). Idempotent — safe to call on
 * every app start.
 */
export async function registerForOrderNotifications(): Promise<boolean> {
  try {
    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('new-orders', {
        name: 'New orders',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 400, 200, 400],
        lightColor: '#0ea5e9',
        sound: 'new_order.wav',
      });
    }

    return status === 'granted';
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[notifications] registration failed', err);
    return false;
  }
}

/**
 * Fire a local notification. Used by the Owner dashboard when a new
 * order row arrives on the realtime channel.
 */
export async function presentNewOrderAlert(opts: {
  title: string;
  body: string;
  orderId: string;
}) {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: opts.title,
        body: opts.body,
        data: { orderId: opts.orderId },
        sound: 'new_order.wav',
      },
      trigger: null, // immediate
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[notifications] presentNewOrderAlert failed', err);
  }
}
