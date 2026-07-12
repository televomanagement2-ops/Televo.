// =============================================================================
// AuraDot — l'aura di UN amico sulla Mappa della Città (M7 / MM8, esteso M12).
// =============================================================================
// Marker MapLibre NATIVO (position-tracking: resta incollato alla mappa durante
// pan/zoom senza proiezione JS → niente desync, decisione MM8 §13.5) che contiene
// l'AuraGlyph Skia. Il "respiro" è una animazione di TRANSFORM Reanimated sul
// wrapper (thread UI, 60fps, NIENTE redraw Skia per-frame): la sorgente è UNA
// shared value condivisa da tutte le aure (respiro all'unisono), creata in
// AuraLayer. Live = aura piena che respira; Last Seen = aura spenta/immobile
// (map.md §2). `offset` (px) serve allo spiderfy di punti coincidenti.
//
// M12 (LM8) — badge LIVE (live.md §8): quando l'amico è host di una Live, il
// glyph porta l'ANELLO ESTERNO ROSSO e sopra compare il CALLOUT "LIVE"
// persistente. In onda l'intero marker PULSA a motion.pulse (più rapido del
// respiro: la diretta è presenza intensa); dopo la fine anello+callout restano
// e DECADONO in 3h via fattoreEcho (niente pulse: è memoria). Il callout sta
// SOPRA il glyph nella colonna del Marker → l'offset compensa metà callout
// così il glyph resta ancorato alla coordinata dell'amico.

import { StyleSheet, View } from 'react-native';
import { Marker } from '@maplibre/maplibre-react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { AuraGlyph } from './AuraGlyph';
import { LiveCallout, LIVE_CALLOUT_COMP } from './LiveBadge';
import { AURA_TRAIT_COLOR } from '@/constants/aura';
import type { PuntoAmico } from '@/store/mapStore';

/** Stato del badge LIVE dell'amico (derivato da AuraLayer sugli eventi
 *  live_broadcast): `inOnda` = diretta aperta; `fattore` = 1 in onda,
 *  fattoreEcho nella dissolvenza 3h post-fine. */
export interface BadgeLive {
  inOnda: boolean;
  fattore: number;
}

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
  /** Pulsazione condivisa 0→1 (motion.pulse, usata solo col badge in onda). */
  pulse: SharedValue<number>;
  /** Badge LIVE (M12): null = l'amico non ha live né echo sulla mappa. */
  liveBadge?: BadgeLive | null;
  /** Offset px del Marker per lo spiderfy (0,0 se punto isolato). */
  offsetX?: number;
  offsetY?: number;
  onPress: () => void;
}

export function AuraDot({
  amico,
  lng,
  lat,
  live,
  breath,
  pulse,
  liveBadge = null,
  offsetX = 0,
  offsetY = 0,
  onPress,
}: Props) {
  const tinta = amico.auraColor ?? AURA_TRAIT_COLOR.chill;
  const size = live ? 64 : 52;
  const nome = amico.displayName ?? amico.username ?? 'Amico';
  const inOnda = liveBadge?.inOnda === true;

  // Respiro: scala + opacità pulsano lente (motion.breath). Last Seen = fermo.
  // Con badge in onda il driver diventa il PULSE (più rapido): la diretta vince.
  const anim = useAnimatedStyle(() => {
    if (inOnda) {
      return {
        opacity: 0.86 + 0.14 * pulse.value,
        transform: [{ scale: 0.94 + 0.1 * pulse.value }],
      };
    }
    if (!live) return { opacity: 0.9, transform: [{ scale: 1 }] };
    return {
      opacity: 0.82 + 0.18 * breath.value,
      transform: [{ scale: 0.92 + 0.12 * breath.value }],
    };
  });

  const statoA11y = inOnda
    ? 'in diretta ora'
    : liveBadge
      ? 'era in diretta poco fa'
      : live
        ? 'ora sulla mappa'
        : 'ultima posizione nota';

  return (
    <Marker
      id={`friend-${amico.userId}`}
      lngLat={[lng, lat]}
      // Il callout sopra il glyph sposta il centro della colonna: si risale di
      // metà callout così il glyph resta sulla coordinata (y negativa = su).
      offset={[offsetX, liveBadge ? offsetY - LIVE_CALLOUT_COMP : offsetY]}
      onPress={onPress}
    >
      {/* Il callout resta FUORI dal wrapper animato: è persistente e fermo
          (live.md §8); pulsano solo aura e anello. */}
      <View style={styles.hit} accessibilityRole="button" accessibilityLabel={`${nome}, ${statoA11y}`}>
        {liveBadge ? <LiveCallout fattore={liveBadge.fattore} /> : null}
        <Animated.View style={anim}>
          <AuraGlyph
            color={tinta}
            size={size}
            dimmed={!live && !inOnda}
            liveRingOpacity={liveBadge ? liveBadge.fattore : undefined}
          />
        </Animated.View>
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  hit: { alignItems: 'center', justifyContent: 'center' },
});
