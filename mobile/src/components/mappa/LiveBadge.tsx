// =============================================================================
// LiveBadge — il badge LIVE della Mappa della Città (M12 / LM8).
// =============================================================================
// live.md §8: un amico host di una Live porta sull'avatar l'ANELLO ROSSO
// (disegnato da AuraGlyph, orchestrato da AuraDot) e un CALLOUT balloon "LIVE"
// persistente — visibile scorrendo la mappa, non solo al tap. Qui vivono i due
// pezzi di resa che AuraDot/AuraLayer compongono:
//  · `LiveCallout` — il fumetto con la punta (variante rossa di LiveRoomBubble),
//    reso DENTRO il Marker dell'amico, sopra il glyph;
//  · `LiveBadgeBubble` — la bolla rossa standalone (EchoBubble-like) quando
//    l'evento live_broadcast non ha un punto amico visibile (amico non in
//    condivisione, fuso in un cluster, o la MIA stessa live).
// Dopo la fine, entrambi DECADONO in 3h via `fattoreEcho` (identico meccanismo
// Echo di M7, già parametrico su ended_at → visibility_expires_at): in echo
// niente pulse — è memoria, non presenza (stessa filosofia di EchoBubble).
//
// ⚠️ Importa Skia (AuraGlyph) → vive SOLO sotto il confine lazy di MapSurface
// (Dev Build). In Expo Go non ci si arriva mai (MapCanvas fa da guardia).

import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Marker } from '@maplibre/maplibre-react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { AuraGlyph } from './AuraGlyph';
import { MAP_TICK_MS, type PuntoEvento } from '@/store/mapStore';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';

// Geometria del callout, condivisa con AuraDot: il balloon sta SOPRA il glyph
// nella colonna del Marker, quindi il centro del glyph scivola in basso di
// metà callout — AuraDot compensa l'offset del Marker con questa costante.
const CALLOUT_PILL_H = 18;
const CALLOUT_TIP_H = 5;
export const LIVE_CALLOUT_H = CALLOUT_PILL_H + CALLOUT_TIP_H + 2; // + margine
export const LIVE_CALLOUT_COMP = Math.round(LIVE_CALLOUT_H / 2);

// -----------------------------------------------------------------------------
// LiveCallout — fumetto "LIVE" con punta, sopra l'avatar dell'amico in diretta.
// Persistente e NON pulsante (pulsa l'anello): in echo sfuma con `fattore`.
// -----------------------------------------------------------------------------
export function LiveCallout({ fattore }: { fattore: number }) {
  const f = Math.max(0, Math.min(1, fattore));
  return (
    <View style={[styles.callout, { opacity: 0.25 + 0.75 * f }]} pointerEvents="none">
      <View style={styles.calloutPill}>
        <Ionicons name="videocam" size={9} color="#ffffff" />
        <Text style={styles.calloutText}>LIVE</Text>
      </View>
      <View style={styles.calloutTip} />
    </View>
  );
}

// -----------------------------------------------------------------------------
// LiveBadgeBubble — bolla rossa standalone di un evento live_broadcast il cui
// amico non ha un punto visibile. In diretta: punto-luce rosso che PULSA
// (motion.pulse condiviso da AuraLayer) + chip LIVE + titolo. In echo: niente
// pulse, tinta spenta e rampa d'opacità morbida verso `fattore` su MAP_TICK_MS
// (stesso ramp di EchoBubble → decadimento visivamente continuo).
// -----------------------------------------------------------------------------
interface BubbleProps {
  evento: PuntoEvento;
  /** true = live aperta (ended_at nullo); false = echo in dissolvenza 3h. */
  inOnda: boolean;
  /** Fattore di decadimento 1→0 (fattoreEcho); 1 quando in onda. */
  fattore: number;
  /** Tempo relativo già formattato ("2h fa") su clock calibrato; '' se in onda. */
  tempo: string;
  /** Pulsazione condivisa 0→1 (motion.pulse, creata in AuraLayer). */
  pulse: SharedValue<number>;
  onPress: () => void;
}

export function LiveBadgeBubble({ evento, inOnda, fattore, tempo, pulse, onPress }: BubbleProps) {
  const f = Math.max(0, Math.min(1, fattore));

  // Pulse del punto-luce SOLO in onda; in echo il glyph resta fermo (memoria).
  const pulseStyle = useAnimatedStyle(() => {
    if (!inOnda) return { opacity: 1, transform: [{ scale: 1 }] };
    return {
      opacity: 0.65 + 0.35 * pulse.value,
      transform: [{ scale: 0.85 + 0.3 * pulse.value }],
    };
  });

  // Rampa morbida dell'opacità della bolla verso il fattore tra un tick e l'altro.
  const op = useSharedValue(f);
  useEffect(() => {
    op.value = withTiming(f, { duration: MAP_TICK_MS });
  }, [f, op]);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: 0.22 + 0.78 * op.value }));

  return (
    <Marker id={`event-${evento.id}`} lngLat={[evento.lng, evento.lat]} onPress={onPress}>
      <Animated.View
        style={fadeStyle}
        accessibilityRole="button"
        accessibilityLabel={
          inOnda
            ? `In diretta: ${evento.title ?? 'live'}`
            : `Live finita ${tempo}: ${evento.title ?? 'live'}`
        }
      >
        <View style={[styles.pill, !inOnda && styles.pillEcho]}>
          <Animated.View style={pulseStyle}>
            <AuraGlyph color={colors.danger} size={22} dimmed={!inOnda} />
          </Animated.View>
          <View style={[styles.chip, !inOnda && styles.chipEcho]}>
            <Text style={styles.chipText}>LIVE</Text>
          </View>
          <Text style={[styles.title, !inOnda && styles.titleEcho]} numberOfLines={1}>
            {evento.title ?? 'Live'}
          </Text>
          {!inOnda && tempo ? <Text style={styles.time}>· {tempo}</Text> : null}
        </View>
      </Animated.View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  // Callout balloon (pill + punta), centrato sulla colonna del Marker amico.
  callout: { alignItems: 'center', marginBottom: 2 },
  calloutPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: CALLOUT_PILL_H,
    paddingHorizontal: 7,
    borderRadius: radius.full,
    backgroundColor: colors.danger,
  },
  calloutText: {
    color: '#ffffff',
    fontSize: 9,
    fontFamily: fontFamily.semibold,
    letterSpacing: 0.5,
  },
  calloutTip: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: CALLOUT_TIP_H,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: colors.danger,
  },

  // Bolla standalone (variante rossa della pill LiveRoomBubble/EchoBubble).
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 2,
    paddingRight: spacing.sm + 2,
    paddingVertical: 3,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: 'rgba(251,113,133,0.55)',
    backgroundColor: 'rgba(11,12,16,0.92)',
    maxWidth: 190,
  },
  pillEcho: { borderColor: colors.border },
  chip: {
    backgroundColor: colors.danger,
    borderRadius: radius.full,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  chipEcho: { backgroundColor: colors.elevated },
  chipText: {
    color: '#ffffff',
    fontSize: 8,
    fontFamily: fontFamily.semibold,
    letterSpacing: 0.5,
  },
  title: { color: colors.ink, fontSize: fontSize.xs, fontFamily: fontFamily.semibold, flexShrink: 1 },
  titleEcho: { color: colors.muted },
  time: { color: colors.faint, fontSize: 10, fontFamily: fontFamily.medium },
});
