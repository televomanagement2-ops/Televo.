// =============================================================================
// AuraDot — l'aura di UN amico sulla Mappa della Città (M7 / MM8).
// =============================================================================
// Marker MapLibre NATIVO (position-tracking: resta incollato alla mappa durante
// pan/zoom senza proiezione JS → niente desync, decisione MM8 §13.5) che contiene
// l'AuraGlyph Skia. Il "respiro" è una animazione di TRANSFORM Reanimated sul
// wrapper (thread UI, 60fps, NIENTE redraw Skia per-frame): la sorgente è UNA
// shared value condivisa da tutte le aure (respiro all'unisono), creata in
// AuraLayer. Live = aura piena che respira; Last Seen = aura spenta/immobile
// (map.md §2). `offset` (px) serve allo spiderfy di punti coincidenti.

import { StyleSheet } from 'react-native';
import { Marker } from '@maplibre/maplibre-react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { AuraGlyph } from './AuraGlyph';
import { AURA_TRAIT_COLOR } from '@/constants/aura';
import type { PuntoAmico } from '@/store/mapStore';

interface Props {
  amico: PuntoAmico;
  /** Posizione di RESA (= coord reali dell'amico, o coord del cluster se in
   *  spiderfy): la placement la decide il clustering, non la riga grezza. */
  lng: number;
  lat: number;
  /** Stato derivato client-side (Live = fresco e in sessione, altrimenti Last Seen). */
  live: boolean;
  /** Respiro condiviso 0→1 (creato in AuraLayer, usato solo se live). */
  breath: SharedValue<number>;
  /** Offset px del Marker per lo spiderfy (0,0 se punto isolato). */
  offsetX?: number;
  offsetY?: number;
  onPress: () => void;
}

export function AuraDot({ amico, lng, lat, live, breath, offsetX = 0, offsetY = 0, onPress }: Props) {
  const tinta = amico.auraColor ?? AURA_TRAIT_COLOR.chill;
  const size = live ? 64 : 52;
  const nome = amico.displayName ?? amico.username ?? 'Amico';

  // Respiro: scala + opacità pulsano lente (motion.breath). Last Seen = fermo.
  const anim = useAnimatedStyle(() => {
    if (!live) return { opacity: 0.9, transform: [{ scale: 1 }] };
    return {
      opacity: 0.82 + 0.18 * breath.value,
      transform: [{ scale: 0.92 + 0.12 * breath.value }],
    };
  });

  return (
    <Marker
      id={`friend-${amico.userId}`}
      lngLat={[lng, lat]}
      offset={[offsetX, offsetY]}
      onPress={onPress}
    >
      <Animated.View
        style={[styles.hit, anim]}
        accessibilityRole="button"
        accessibilityLabel={`${nome}, ${live ? 'ora sulla mappa' : 'ultima posizione nota'}`}
      >
        <AuraGlyph color={tinta} size={size} dimmed={!live} />
      </Animated.View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  hit: { alignItems: 'center', justifyContent: 'center' },
});
