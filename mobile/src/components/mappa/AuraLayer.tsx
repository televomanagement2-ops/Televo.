// =============================================================================
// AuraLayer — la resa Aura definitiva della Mappa della Città (M7 / MM8).
// =============================================================================
// Sostituisce il MapPoints "grezzo" di MM7. Orchestratore che, dai dizionari
// amici/eventi dello store (snapshot + realtime), rende:
//  · le AURE amici come Marker nativi con AuraGlyph Skia, respiro all'unisono;
//  · le BOLLE stanza (live che pulsa / echo che decade con continuità);
//  · i CLUSTER (aure vicine fuse a zoom bassi, dimensione ∝ numero, mai cifre)
//    con apertura via zoom o ventaglio (spiderfy) per punti coincidenti.
//
// DECISIONE ARCHITETTURALE MM8 (§13.5 — decision gate). Il piano prevedeva un
// canvas Skia FULL-SCREEN con proiezione geo→schermo per-frame, con FALLBACK a
// Marker nativi + mini-canvas Skia per-aura se il sync canvas↔camera fosse laggy.
// Adottiamo DA SUBITO il fallback pre-approvato dal PO perché:
//  (1) elimina PER COSTRUZIONE il rischio tecnico n.1 (desync): i Marker sono
//      ancorati nativamente, nessuna proiezione JS per-frame;
//  (2) il clustering cappa i punti visibili (~40) → il degrado "molti marker" non
//      si verifica (precondizione dichiarata del fallback);
//  (3) il gate on-device è azione owner (Dev Build EAS) e non eseguibile da qui →
//      scegliamo il ramo provabilmente corretto senza device.
// Il respiro NON ridisegna Skia per-frame: è transform Reanimated NATIVO sul
// wrapper (thread UI). Il clustering si ricalcola solo quando cambiano insieme
// punti/zoom (non col pan): i Marker restano incollati nel frattempo.
//
// ⚠️ Importa Skia (via i figli) → vive SOLO sotto il confine lazy di MapSurface
// (Dev Build). Mai eager in Expo Go.

import { useEffect, useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';
import { Marker } from '@maplibre/maplibre-react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { AuraGlyph } from './AuraGlyph';
import { AuraDot } from './AuraDot';
import { LiveRoomBubble } from './LiveRoomBubble';
import { EchoBubble } from './EchoBubble';
import {
  amicoVisibile,
  fattoreEcho,
  nowCalibrato,
  statoAmico,
  statoEvento,
  useMapStore,
  MAP_TICK_MS,
  type PuntoAmico,
  type PuntoEvento,
} from '@/store/mapStore';
import {
  calcolaRender,
  costruisciIndice,
  type BBox,
  type RenderCluster,
} from '@/lib/clustering';
import { tempoRelativoCalibrato } from '@/lib/datetime';
import { colors, motion } from '@/constants/theme';

export interface Viewport {
  bbox: BBox;
  zoom: number;
}

interface Props {
  viewport: Viewport;
  onSelectFriend: (a: PuntoAmico) => void;
  onSelectEvent: (e: PuntoEvento) => void;
  /** Tap su un cluster apribile: la camera zooma per separarlo. */
  onExpandCluster: (lng: number, lat: number, zoom: number) => void;
}

export function AuraLayer({ viewport, onSelectFriend, onSelectEvent, onExpandCluster }: Props) {
  const friends = useMapStore((s) => s.friends);
  const events = useMapStore((s) => s.events);
  const clockOffsetMs = useMapStore((s) => s.clockOffsetMs);

  // "now" calibrato STABILE tra un tick e l'altro (non Date.now() a ogni render):
  // così i memo di clustering non si invalidano ai soli cambi di viewport (pan).
  const [nowMs, setNowMs] = useState(() => nowCalibrato(clockOffsetMs));
  useEffect(() => setNowMs(nowCalibrato(clockOffsetMs)), [clockOffsetMs]);
  useEffect(() => {
    const id = setInterval(
      () => setNowMs(nowCalibrato(useMapStore.getState().clockOffsetMs)),
      MAP_TICK_MS,
    );
    return () => clearInterval(id);
  }, []);

  // Driver di animazione condivisi (una sola sorgente per tutte le aure/bolle):
  // respiro lento (Live) e pulsazione più rapida (stanze live).
  const breath = useSharedValue(0);
  const pulse = useSharedValue(0);
  useEffect(() => {
    breath.value = withRepeat(
      withTiming(1, { duration: motion.breath, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    pulse.value = withRepeat(
      withTiming(1, { duration: motion.pulse, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [breath, pulse]);

  // Amici visibili con coordinate valide → indice supercluster.
  const visibili = useMemo(
    () =>
      Object.values(friends).filter(
        (a) => amicoVisibile(a, nowMs) && Number.isFinite(a.lat) && Number.isFinite(a.lng),
      ),
    [friends, nowMs],
  );
  const index = useMemo(() => costruisciIndice(visibili), [visibili]);

  // Punti da renderizzare per il viewport corrente. Dipende dallo zoom ARROTONDATO
  // (lo zoom frazionario del pinch non ri-clusterizza finché non cambia gradino).
  const { bbox, zoom } = viewport;
  const render = useMemo(
    () => calcolaRender(index, bbox, zoom),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [index, bbox[0], bbox[1], bbox[2], bbox[3], Math.round(zoom)],
  );

  // Eventi visibili (live + echo), gli scaduti non si mostrano (il cron poi cancella).
  const eventiVisibili = useMemo(
    () => Object.values(events).filter((e) => statoEvento(e, nowMs) !== 'expired'),
    [events, nowMs],
  );

  return (
    <>
      {render.map((p) => {
        if (p.kind === 'cluster') {
          return (
            <ClusterAura
              key={`cluster-${p.id}`}
              cluster={p}
              breath={breath}
              onPress={() => onExpandCluster(p.lng, p.lat, p.expansionZoom)}
            />
          );
        }
        const amico = friends[p.userId];
        if (!amico) return null;
        return (
          <AuraDot
            key={`friend-${p.userId}`}
            amico={amico}
            lng={p.lng}
            lat={p.lat}
            offsetX={p.offsetX}
            offsetY={p.offsetY}
            live={statoAmico(amico, nowMs) === 'live'}
            breath={breath}
            onPress={() => onSelectFriend(amico)}
          />
        );
      })}

      {eventiVisibili.map((e) =>
        statoEvento(e, nowMs) === 'live' ? (
          <LiveRoomBubble key={`event-${e.id}`} evento={e} pulse={pulse} onPress={() => onSelectEvent(e)} />
        ) : (
          <EchoBubble
            key={`event-${e.id}`}
            evento={e}
            fattore={fattoreEcho(e, nowMs)}
            tempo={e.endedAt != null ? tempoRelativoCalibrato(e.endedAt, nowMs) : ''}
            onPress={() => onSelectEvent(e)}
          />
        ),
      )}
    </>
  );
}

// -----------------------------------------------------------------------------
// ClusterAura — aura AGGREGATA: dimensione proporzionale al numero di aure fuse,
// MAI una cifra in vista (map.md §6). Tap → la camera zooma per separarle.
// -----------------------------------------------------------------------------
function ClusterAura({
  cluster,
  breath,
  onPress,
}: {
  cluster: RenderCluster;
  breath: SharedValue<number>;
  onPress: () => void;
}) {
  const size = Math.min(104, 60 + cluster.count * 5);
  const anim = useAnimatedStyle(() => ({
    opacity: 0.78 + 0.2 * breath.value,
    transform: [{ scale: 0.94 + 0.08 * breath.value }],
  }));

  return (
    <Marker id={`cluster-${cluster.id}`} lngLat={[cluster.lng, cluster.lat]} onPress={onPress}>
      <Animated.View
        style={[styles.center, anim]}
        accessibilityRole="button"
        accessibilityLabel={`${cluster.count} amici vicini, tocca per separarli`}
      >
        <AuraGlyph color={colors.accentSoft} size={size} />
      </Animated.View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
});
