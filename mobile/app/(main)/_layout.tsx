// =============================================================================
// (main) layout — area autenticata. Guard: senza sessione o profilo non
// finalizzato si torna all'index (che reinstrada). Niente header.
// =============================================================================

import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { colors } from '@/constants/theme';

export default function MainLayout() {
  const { initializing, isAuthenticated, isOnboarded } = useAuth();

  if (initializing) return null;
  if (!isAuthenticated || !isOnboarded) return <Redirect href="/" />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.base },
      }}
    />
  );
}
