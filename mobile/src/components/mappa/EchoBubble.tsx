// =============================================================================
// EchoBubble — l'eco di una stanza finita, che decade (M7 / MM8).
// =============================================================================
// Il CUORE VISIVO della mappa (map.md §1/§2): una stanza terminata resta come
// Echo fino a `ended_at + 12h` e DECADE con continuità — fucsia pieno → viola
// spento → trasparente, un orologio senza cifre. Il fattore [1→0] è puro sui
// millisecondi UTC calibrati (store `fattoreEcho`); qui lo rendiamo:
//  · TINTA: lerp fucsia→viola su (1 − fattore) — su un canvas dati-viz il viola
//    NON è la firma di marca dell'app, è il linguaggio del decadimento (§1).
//  · OPACITÀ: ramp morbido verso il fattore su MAP_TICK_MS (tra un tick e l'altro
//    del ricalcolo) → transizione fluida, non a scatti.
// Marker nativo (ancorato), niente pulse: l'Echo è memoria, non presenza.

import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Marker } from '@maplibre/maplibre-react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { AuraGlyph } from './AuraGlyph';
import { MAP_TICK_MS, type PuntoEvento } from '@/store/mapStore';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';

interface Props {
  evento: PuntoEvento;
  /** Fattore di decadimento 1→0 (map.md §2), ricalcolato dal tick di AuraLayer. */
  fattore: number;
  /** Tempo relativo già formattato ("2h fa") su clock calibrato. */
  tempo: string;
  onPress: () => void;
}

// Lerp RGB tra due esadecimali (t: 0→a, 1→b). Locale: l'unico uso è la rampa Echo.
function lerpHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ar = (pa >> 16) & 255,
    ag = (pa >> 8) & 255,
    ab = pa & 255;
  const br = (pb >> 16) & 255,
    bg = (pb >> 8) & 255,
    bb = pb & 255;
  const h = (v: number) => Math.round(v).toString(16).padStart(2, '0');
  return `#${h(ar + (br - ar) * t)}${h(ag + (bg - ag) * t)}${h(ab + (bb - ab) * t)}`;
}

export function EchoBubble({ evento, fattore, tempo, onPress }: Props) {
  const f = Math.max(0, Math.min(1, fattore));
  // Pieno appena finito (fucsia), spento a fine finestra (viola).
  const tinta = lerpHex(colors.fucsia, colors.viola, 1 - f);

  // Rampa morbida dell'opacità verso il fattore tra un tick e l'altro.
  const op = useSharedValue(f);
  useEffect(() => {
    op.value = withTiming(f, { duration: MAP_TICK_MS });
  }, [f, op]);
  const style = useAnimatedStyle(() => ({ opacity: 0.22 + 0.72 * op.value }));

  return (
    <Marker id={`event-${evento.id}`} lngLat={[evento.lng, evento.lat]} onPress={onPress}>
      <Animated.View
        style={style}
        accessibilityRole="button"
        accessibilityLabel={`${evento.title ?? 'Stanza'}, finita ${tempo}`}
      >
        <View style={styles.pill}>
          <AuraGlyph color={tinta} size={20} dimmed />
          <Text style={styles.title} numberOfLines={1}>
            {evento.title ?? 'Stanza'}
          </Text>
          <Text style={styles.time}>· {tempo}</Text>
        </View>
      </Animated.View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 2,
    paddingRight: spacing.sm + 2,
    paddingVertical: 3,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(11,12,16,0.9)',
    maxWidth: 180,
  },
  title: { color: colors.muted, fontSize: fontSize.xs, fontFamily: fontFamily.semibold, flexShrink: 1 },
  time: { color: colors.faint, fontSize: 10, fontFamily: fontFamily.medium },
});
