// =============================================================================
// (main) layout — area autenticata. Guard: senza sessione o profilo non
// finalizzato si torna all'index (che reinstrada). Niente header.
// =============================================================================

import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { ChatRuntime } from '@/components/chat/ChatRuntime';
import { colors } from '@/constants/theme';

export default function MainLayout() {
  const { initializing, isAuthenticated, isOnboarded } = useAuth();

  if (initializing) return null;
  if (!isAuthenticated || !isOnboarded) return <Redirect href="/" />;

  return (
    <>
      {/* Servizi chat globali (CM2): rete, realtime hub, flush outbox. */}
      <ChatRuntime />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.base },
        }}
      />
    </>
  );
}
