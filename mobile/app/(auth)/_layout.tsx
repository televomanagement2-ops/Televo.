// =============================================================================
// (auth) layout — stack delle schermate di accesso/onboarding. Senza header,
// sfondo nero, transizione in dissolvenza (`fade`): più sobria e — soprattutto —
// stabile per la tastiera (lo `slide` faceva aprire/chiudere subito il keyboard
// sui form col focus al mount).
// =============================================================================

import { Stack } from 'expo-router';
import { colors } from '@/constants/theme';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        contentStyle: { backgroundColor: colors.base },
      }}
    />
  );
}
