// =============================================================================
// (main) layout — area autenticata. Guard: senza sessione o profilo non
// finalizzato si torna all'index (che reinstrada). Niente header.
// =============================================================================

import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { ChatRuntime } from '@/components/chat/ChatRuntime';
import { MenuCrea } from '@/components/navigation/MenuCrea';
import { colors } from '@/constants/theme';

export default function MainLayout() {
  const { initializing, isAuthenticated, isOnboarded } = useAuth();

  if (initializing) return null;
  if (!isAuthenticated || !isOnboarded) return <Redirect href="/" />;

  return (
    <>
      {/* Servizi globali della shell (CM2 + M6): rete, realtime, flush outbox. */}
      <ChatRuntime />
      {/* Menu di creazione (S0) aperto dal + della BottomBar (R-16). */}
      <MenuCrea />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.base },
        }}
      />
    </>
  );
}
