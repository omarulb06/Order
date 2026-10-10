import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { RoleGuard } from '@/components/RoleGuard';

export default function AdminLayout() {
  return (
    <RoleGuard allow={['admin', 'owner']}>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: '#0ea5e9',
          headerStyle: { backgroundColor: '#0ea5e9' },
          headerTintColor: '#ffffff',
          headerTitleStyle: { fontWeight: '700' },
        }}
      >
        <Tabs.Screen
          name="audit"
          options={{
            title: 'Audit log',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="shield-checkmark" size={size} color={color} />
            ),
          }}
        />
      </Tabs>
    </RoleGuard>
  );
}
