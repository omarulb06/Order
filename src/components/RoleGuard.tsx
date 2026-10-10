import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/auth';
import type { UserRole } from '@/types/database';

interface Props {
  allow: UserRole[];
  children: React.ReactNode;
  redirectTo?: string;
}

/**
 * Guards a route subtree so only the specified roles can access it.
 * Everyone else is pushed to `redirectTo` (defaults to the sign-in screen).
 */
export function RoleGuard({ allow, children, redirectTo = '/sign-in' }: Props) {
  const router = useRouter();
  const initialized = useAuthStore((s) => s.initialized);
  const profile = useAuthStore((s) => s.profile);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (!initialized) return;
    if (!user) {
      router.replace(redirectTo as any);
      return;
    }
    if (profile && !allow.includes(profile.role)) {
      router.replace('/' as any);
    }
  }, [initialized, user, profile, allow, redirectTo, router]);

  if (!initialized || !profile || !allow.includes(profile.role)) {
    return (
      <View className="flex-1 items-center justify-center bg-white dark:bg-neutral-950">
        <ActivityIndicator color="#0ea5e9" />
      </View>
    );
  }

  return <>{children}</>;
}
