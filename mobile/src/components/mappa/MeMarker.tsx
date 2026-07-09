// =============================================================================
// MeMarker — il puntino "tu" sulla Mappa della Città (M7 / MM6 → resa MM8).
// =============================================================================
// La MIA aura, alla mia posizione reale (esatta: l'owner vede sé stesso preciso,
// map.md §10). Marker MapLibre nativo con l'AuraGlyph Skia, come le aure degli
// amici (coerenza visiva MM8). Due stati: ACCESA (sessione attiva → tinta accento,
// respiro) e SPENTA (muted, immobile, hint "tocca per accenderti"). Tap → apre il
// flusso di condivisione (stesso gesto del controllo in basso).

import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { Marker } from '@maplibre/maplibre-react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { AuraGlyph } from './AuraGlyph';
import { useMapStore, sessioneAttiva } from '@/store/mapStore';
import { colors, motion } from '@/constants/theme';

export function MeMarker({ onPress }: { onPress: () => void }) {
  const myCoords = useMapStore((s) => s.myCoords);
  const sessione = useMapStore((s) => s.sessione);
  const accesa = sessioneAttiva(sessione, Date.now());

  // Respiro solo quando accesa; a riposo l'aura è ferma (memoria).
  const breath = useSharedValue(0);
  useEffect(() => {
    if (accesa) {
      breath.value = withRepeat(
        withTiming(1, { duration: motion.breath, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      );
    } else {
      cancelAnimation(breath);
      breath.value = 0;
    }
    return () => cancelAnimation(breath);
  }, [accesa, breath]);

  const anim = useAnimatedStyle(() =>
    accesa
      ? { opacity: 0.82 + 0.18 * breath.value, transform: [{ scale: 0.92 + 0.12 * breath.value }] }
      : { opacity: 0.9, transform: [{ scale: 1 }] },
  );

  if (!myCoords) return null;

  return (
    <Marker id="me" lngLat={[myCoords.lng, myCoords.lat]} onPress={onPress}>
      <Animated.View
        style={[styles.hit, anim]}
        accessibilityRole="button"
        accessibilityLabel={
          accesa ? 'La tua Aura è accesa, tocca per gestirla' : 'La tua Aura è spenta, tocca per accenderti'
        }
      >
        <AuraGlyph
          color={accesa ? colors.accent : colors.muted}
          size={accesa ? 56 : 46}
          dimmed={!accesa}
        />
      </Animated.View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  hit: { alignItems: 'center', justifyContent: 'center' },
});
