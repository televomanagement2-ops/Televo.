// =============================================================================
// /live/nuovo — rotta del composer camera-first della Live (M12 / LM6, §3).
// =============================================================================
// Due guard, in ordine (pattern MapCanvas / rotte live):
//  1. Expo Go → pannello "serve la Dev Build" (LiveKit è nativo, §12.16);
//  2. Dev Build → superficie caricata PIGRAMENTE, così il modulo nativo
//     LiveKit non viene MAI valutato nel primo caso.

import { Suspense, lazy } from 'react';
import { StyleSheet, View } from 'react-native';
import { PannelloDevBuild } from '@/components/live/PannelloDevBuild';
import { dopoBootstrapLiveKit, liveKitDisponibile } from '@/lib/livekit';
import { colors } from '@/constants/theme';

// Import pigro: la factory gira solo al primo render della superficie, che in
// Expo Go non avviene mai (si torna prima). Il bootstrap DEVE precedere il
// chunk: livekit-client tocca DOMException alla valutazione del modulo.
const LiveComposerSurface = lazy(
  dopoBootstrapLiveKit(() => import('@/components/live/LiveComposerSurface')),
);

export default function LiveNuovoScreen() {
  if (!liveKitDisponibile) return <PannelloDevBuild />;

  return (
    <Suspense fallback={<View style={styles.fallback} />}>
      <LiveComposerSurface />
    </Suspense>
  );
}

const styles = StyleSheet.create({
  fallback: { flex: 1, backgroundColor: colors.base },
});
