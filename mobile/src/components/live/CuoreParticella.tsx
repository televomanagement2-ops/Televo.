// =============================================================================
// CuoreParticella — un cuore che sale, scala e sfuma (M15 / LR8, RW-3).
// =============================================================================
// Nasce NEL punto del tap (double-tap sul video) o presso il bottone del rail,
// sale di 80–140px con deriva e rotazione casuali (jitter deciso alla nascita:
// una raffica non deve sembrare un timbro), scala 0.8→1.3 e sfuma in ~900ms,
// poi si toglie da sola (onFine → CuoriOverlay smonta la particella). Solo
// trasformazioni Reanimated native: zero lavoro JS durante la salita.

import { useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { colors } from '@/constants/theme';

/** Vita di un cuore (salita + dissolvenza), stile TikTok (~900ms, §8.5). */
const DURATA_MS = 900;

interface Props {
  id: number;
  /** Punto di spawn, nel sistema di coordinate dell'overlay (= root schermo). */
  x: number;
  y: number;
  /** Fine animazione: l'overlay rimuove la particella. */
  onFine: (id: number) => void;
}

export function CuoreParticella({ id, x, y, onFine }: Props) {
  const progresso = useSharedValue(0);

  // Jitter deciso alla nascita, stabile per tutta la vita della particella.
  const jitter = useRef({
    salita: 80 + Math.random() * 60, //       80..140 px verso l'alto
    deriva: (Math.random() - 0.5) * 48, //    ±24 px orizzontali
    rotazione: (Math.random() - 0.5) * 44, // ±22°
    dimensione: 26 + Math.round(Math.random() * 10),
  }).current;

  useEffect(() => {
    // Vita unica: parte alla nascita e muore a fine corsa (nessun replay).
    progresso.value = withTiming(
      1,
      { duration: DURATA_MS, easing: Easing.out(Easing.quad) },
      (finita) => {
        if (finita) runOnJS(onFine)(id);
      },
    );
  }, [progresso, onFine, id]);

  const stile = useAnimatedStyle(() => ({
    opacity: interpolate(progresso.value, [0, 0.4, 1], [1, 1, 0]),
    transform: [
      { translateY: -jitter.salita * progresso.value },
      { translateX: jitter.deriva * progresso.value },
      { rotate: `${jitter.rotazione * progresso.value}deg` },
      { scale: interpolate(progresso.value, [0, 0.25, 1], [0.8, 1.3, 1.3]) },
    ],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.cuore,
        { left: x - jitter.dimensione / 2, top: y - jitter.dimensione / 2 },
        stile,
      ]}
    >
      <Ionicons name="heart" size={jitter.dimensione} color={colors.danger} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  cuore: { position: 'absolute' },
});
