// =============================================================================
// Root layout — provider globali, listener di sessione, deep link inviti.
// =============================================================================
// Ordine: GestureHandler → SafeArea → React Query. Lo Stack è senza header
// (le schermate gestiscono il proprio chrome). Il listener auth popola lo store.

import '../global.css';
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { DialogHost } from '@/components/ui/DialogHost';
import { useAuthListener } from '@/hooks/useAuth';
import { useOnboardingStore } from '@/store/onboardingStore';
import { colors } from '@/constants/theme';

// Teniamo lo splash nativo finché il primo frame non è pronto (niente flash bianco).
SplashScreen.preventAutoHideAsync().catch(() => {});

/** Estrae un eventuale codice invito da un deep link (televo://invito/CODICE). */
function captureInviteFromUrl(url: string | null) {
  if (!url) return;
  const match = url.match(/invito\/([A-Za-z0-9-]+)/) ?? url.match(/[?&]code=([A-Za-z0-9-]+)/);
  if (match?.[1]) {
    useOnboardingStore.getState().patch({ inviteCode: match[1].toUpperCase() });
  }
}

export default function RootLayout() {
  useAuthListener();

  // Font reali Poppins (il wordmark e i titoli li usano): teniamo lo splash
  // finché non sono pronti, così niente flash col font di sistema.
  const [fontsLoaded] = useFonts({
    'Poppins-Regular': require('../assets/fonts/Poppins-Regular.ttf'),
    'Poppins-Medium': require('../assets/fonts/Poppins-Medium.ttf'),
    'Poppins-SemiBold': require('../assets/fonts/Poppins-SemiBold.ttf'),
    'Poppins-Bold': require('../assets/fonts/Poppins-Bold.ttf'),
  });

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded]);

  useEffect(() => {
    Linking.getInitialURL().then(captureInviteFromUrl);
    const sub = Linking.addEventListener('url', (e) => captureInviteFromUrl(e.url));
    return () => sub.remove();
  }, []);

  // Non montiamo nulla finché i font non sono caricati: lo splash nativo resta su.
  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerShown: false,
              animation: 'fade',
              contentStyle: { backgroundColor: colors.base },
            }}
          />
          {/* Host unico dei popup dark (CM6.5): menu, conferme e avvisi. */}
          <DialogHost />
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
