import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { RoleGuard } from '@/components/RoleGuard';

export default function OwnerLayout() {
  return (
    <RoleGuard allow={['owner']}>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: '#0ea5e9',
          headerStyle: { backgroundColor: '#0ea5e9' },
          headerTintColor: '#ffffff',
          headerTitleStyle: { fontWeight: '700' },
        }}
      >
        <Tabs.Screen
          name="dashboard"
          options={{
            title: 'Live orders',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="pulse" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="inventory"
          options={{
            title: 'Inventory',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="pricetags" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: 'Settings',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="settings" size={size} color={color} />
            ),
          }}
        />
      </Tabs>
    </RoleGuard>
  );
}
