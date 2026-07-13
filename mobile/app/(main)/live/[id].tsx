// =============================================================================
// /live/[id] — rotta dello schermo live, host e spettatore (M12 / LM6).
// =============================================================================
// Ci si arriva dal composer (host), dalla notifica live_started/cohost_invite,
// e in LM7 da striscia/feed/mappa. Stessi guard delle altre rotte live:
//  1. Expo Go → pannello "serve la Dev Build" (§12.16);
//  2. Dev Build → superficie caricata PIGRAMENTE (il modulo nativo LiveKit non
//     viene mai valutato in Expo Go).

import { Suspense, lazy } from 'react';
import { StyleSheet } from 'react-native';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { PannelloDevBuild } from '@/components/live/PannelloDevBuild';
import { dopoBootstrapLiveKit, liveKitDisponibile } from '@/lib/livekit';
import { colors } from '@/constants/theme';

// Bootstrap prima del chunk: livekit-client tocca DOMException alla
// valutazione del modulo (vincolo 4 di lib/livekit.ts).
const LiveSurface = lazy(dopoBootstrapLiveKit(() => import('@/components/live/LiveSurface')));

export default function LiveScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();

  if (!liveKitDisponibile) return <PannelloDevBuild />;
  if (!id) return <Redirect href="/home" />;

  return (
    // Fallback = spinner (M13/P11, H3): mai un buco nero mentre arrivano
    // chunk+bootstrap (di norma già pre-warmati dalla Home).
    <Suspense fallback={<LoadingSpinner style={styles.fallback} />}>
      <LiveSurface liveId={id} />
    </Suspense>
  );
}

const styles = StyleSheet.create({
  fallback: { flex: 1, backgroundColor: colors.base },
});
