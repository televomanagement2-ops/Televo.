// =============================================================================
// /live/test — schermo di PROVA TECNICA delle fondamenta LiveKit (M12 / LM5).
// =============================================================================
// TEMPORANEO: esiste solo per validare su device (Dev Build EAS) che SDK,
// token Edge e strato dati funzionino PRIMA di costruire composer e schermo
// live veri (LM6, che lo sostituirà). Non c'è nessuna voce di menu: si
// raggiunge a mano (televo://live/test). Tre guard, in ordine:
//  1. build di produzione → redirect alla Home (la rotta resta inerte);
//  2. Expo Go → pannello "serve la Dev Build" (pattern MapCanvas);
//  3. Dev Build → superficie di prova caricata PIGRAMENTE, così il modulo
//     nativo LiveKit non viene MAI valutato nei primi due casi.

import { Suspense, lazy } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { liveKitDisponibile } from '@/lib/livekit';
import { colors, fontFamily, fontSize, spacing } from '@/constants/theme';

// Import pigro: la factory gira solo al primo render di <LiveTestSurface />,
// che in produzione/Expo Go non avviene mai (si torna prima).
const LiveTestSurface = lazy(() => import('@/components/live/LiveTestSurface'));

export default function LiveTestScreen() {
  if (!__DEV__) return <Redirect href="/" />;

  if (!liveKitDisponibile) {
    return (
      <View style={styles.info}>
        <Ionicons name="videocam-outline" size={40} color={colors.faint} />
        <Text style={styles.infoTitle}>La Live richiede la Dev Build</Text>
        <Text style={styles.infoSub}>
          LiveKit è un modulo nativo e non gira in Expo Go. Apri Televo dalla Dev Build EAS per
          provare la Live.
        </Text>
      </View>
    );
  }

  return (
    <Suspense fallback={<View style={styles.fallback} />}>
      <LiveTestSurface />
    </Suspense>
  );
}

const styles = StyleSheet.create({
  fallback: { flex: 1, backgroundColor: colors.base },
  info: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
    backgroundColor: colors.base,
  },
  infoTitle: {
    color: colors.ink,
    fontSize: fontSize.lg,
    fontFamily: fontFamily.semibold,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  infoSub: {
    color: colors.muted,
    fontSize: fontSize.sm,
    fontFamily: fontFamily.sans,
    textAlign: 'center',
    lineHeight: 20,
  },
});
