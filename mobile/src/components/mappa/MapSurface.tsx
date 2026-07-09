// =============================================================================
// MapSurface — la mappa MapLibre vera e propria (M7 / MM5 + MM6). DEFAULT export.
// =============================================================================
// Isolata e caricata PIGRAMENTE da MapCanvas (React.lazy): il modulo NATIVO
// @maplibre/maplibre-react-native viene valutato solo su Dev Build. In Expo Go
// non ci si arriva mai → il resto dell'app resta intatto.
//
// MM5: sfondo dark custom (Terni), north-up, attribuzione, load/errore.
// MM6: la MIA presenza — puntino "tu" (MeMarker), controllo in basso
// (MapPresenceControl), sheet di opt-in gestuale (MapOnboarding → ShareSheet),
// camera-follow sul primo fix e "centra su di me". Il WATCHER vive in
// ChatRuntime (app-wide, foreground): qui c'è solo la superficie e i gesti.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View, type NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import {
  Camera,
  type CameraRef,
  Map,
  type PressEvent,
  type ViewStateChangeEvent,
} from '@maplibre/maplibre-react-native';
import { StatoErrore } from '@/components/ui/StatoErrore';
import { MeMarker } from '@/components/mappa/MeMarker';
import { AuraLayer, type Viewport } from '@/components/mappa/AuraLayer';
import { ZonesLayer } from '@/components/mappa/ZonesLayer';
import { MapFriendCard, type SelezioneMappa } from '@/components/mappa/MapFriendCard';
import { MapPresenceControl } from '@/components/mappa/MapPresenceControl';
import { MapOnboarding } from '@/components/mappa/MapOnboarding';
import { ShareSheet } from '@/components/mappa/ShareSheet';
import { SafeZoneEditor } from '@/components/mappa/SafeZoneEditor';
import { useCondivisionePosizione } from '@/hooks/useCondivisionePosizione';
import { useMappa } from '@/hooks/useMappa';
import { useSafeZones } from '@/hooks/useSafeZones';
import { posizioneCorrente } from '@/lib/location';
import { avvisa } from '@/lib/dialoghi';
import {
  nowCalibrato,
  sessioneAttiva,
  useMapStore,
  type PuntoAmico,
  type PuntoEvento,
} from '@/store/mapStore';
import { BBOX_MONDO, type BBox } from '@/lib/clustering';
import { MAP_ATTRIBUTION, MAP_DEFAULT, MAP_PALETTE, mapStyleDark } from '@/constants/mapStyle';
import { colors, fontFamily, fontSize, motion, radius, spacing } from '@/constants/theme';

type Sheet = 'none' | 'onboarding' | 'share';

export default function MapSurface() {
  const insets = useSafeAreaInsets();
  const bottomInset = insets.bottom + 84; // sopra la BottomBar floating (~78pt)

  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [attempt, setAttempt] = useState(0); // bump = remount della mappa (retry)
  const [sheet, setSheet] = useState<Sheet>('none');
  // MM8: viewport (bbox+zoom) che alimenta il clustering; punto selezionato per la card.
  const [viewport, setViewport] = useState<Viewport>({ bbox: BBOX_MONDO, zoom: MAP_DEFAULT.zoom });
  const [selezione, setSelezione] = useState<SelezioneMappa | null>(null);
  // MM9: bozza di Safe Zone (centro dal long-press) + raggio corrente dell'editor.
  const [zoneDraft, setZoneDraft] = useState<{ lat: number; lng: number } | null>(null);
  const [zoneRadius, setZoneRadius] = useState(200);
  const veil = useRef(new Animated.Value(1)).current;
  const cameraRef = useRef<CameraRef>(null);
  const centrato = useRef(false); // camera centrata sul primo fix una sola volta
  const lastVpRef = useRef(0); //    throttle degli eventi region-is-changing

  const { sessione, consenso, permesso, myCoords, sincronizzaPermesso } = useCondivisionePosizione();
  const clockOffsetMs = useMapStore((s) => s.clockOffsetMs);

  // MM7: aggancia snapshot + inbox realtime finché la mappa è montata (popola i
  // dizionari amici/eventi dello store, letti dall'AuraLayer). `snapshot` serve
  // qui per il banner di errore (map.md §9: StatoErrore/banner uniforme).
  const { query: snapshot } = useMappa();
  // MM9: le mie Safe Zone (dallo snapshot condiviso — nessuna fetch extra) e se
  // ho raggiunto il cap di 2. `pieno` gate il long-press.
  const { zones, pieno } = useSafeZones();

  // Stato vuoto (map.md §9): nessun amico né evento visibile → copy che spiega la lente.
  const mappaVuota = useMapStore(
    (s) => Object.keys(s.friends).length === 0 && Object.keys(s.events).length === 0,
  );

  // Permesso in store all'ingresso; se già concesso e nessuna sessione attiva,
  // un fix singolo piazza il puntino "tu" (spento) e centra la mappa.
  useEffect(() => {
    void sincronizzaPermesso();
  }, [sincronizzaPermesso]);

  useEffect(() => {
    if (permesso !== 'granted') return;
    if (sessioneAttiva(sessione, Date.now())) return; // ci pensa il runtime
    if (useMapStore.getState().myCoords) return;
    void posizioneCorrente().then((c) => {
      if (c) useMapStore.getState().setMyCoords(c);
    });
  }, [permesso, sessione]);

  // Centra la camera al primo fix (una volta): dopo, il pan è dell'utente.
  useEffect(() => {
    if (myCoords && !centrato.current) {
      centrato.current = true;
      cameraRef.current?.easeTo({ center: [myCoords.lng, myCoords.lat], zoom: 15, duration: 800 });
    }
  }, [myCoords]);

  const onLoaded = useCallback(() => {
    setLoaded(true);
    Animated.timing(veil, { toValue: 0, duration: motion.base, useNativeDriver: true }).start();
  }, [veil]);

  const retry = useCallback(() => {
    veil.setValue(1);
    setLoaded(false);
    setFailed(false);
    setAttempt((a) => a + 1);
  }, [veil]);

  // Il gesto: apri onboarding (prima volta / manca permesso) o lo sheet durate/gestione.
  const apriFlusso = useCallback(() => {
    if (sessioneAttiva(sessione, Date.now())) {
      setSheet('share');
    } else if (consenso.data !== true || permesso !== 'granted') {
      setSheet('onboarding');
    } else {
      setSheet('share');
    }
  }, [sessione, consenso.data, permesso]);

  const centraSuDiMe = useCallback(() => {
    const c = useMapStore.getState().myCoords;
    if (c) cameraRef.current?.easeTo({ center: [c.lng, c.lat], zoom: 15, duration: 500 });
  }, []);

  // Viewport → clustering (MM8). A gesto FERMO (onRegionDidChange) ricalcolo
  // accurato; durante il gesto (onRegionIsChanging) throttle a 250ms: i Marker
  // restano ancorati nativamente, il ri-cluster arriva senza scatti.
  const aggiornaViewport = useCallback((e: NativeSyntheticEvent<ViewStateChangeEvent>) => {
    const { bounds, zoom } = e.nativeEvent;
    if (!bounds) return;
    setViewport({ bbox: bounds as BBox, zoom });
  }, []);

  const viewportInCambiamento = useCallback(
    (e: NativeSyntheticEvent<ViewStateChangeEvent>) => {
      const now = Date.now();
      if (now - lastVpRef.current < 250) return;
      lastVpRef.current = now;
      aggiornaViewport(e);
    },
    [aggiornaViewport],
  );

  // Tap su un cluster apribile: la camera zooma per separare le aure fuse.
  const espandiCluster = useCallback((lng: number, lat: number, zoom: number) => {
    cameraRef.current?.easeTo({ center: [lng, lat], zoom, duration: 420 });
  }, []);

  // MM9 — long-press sulla mappa: apre l'editor di una nuova Safe Zone col centro
  // sul punto premuto (map.md §4). Se ho già 2 zone lo dico e mi fermo (il cap è
  // anche server-side). La camera centra il punto così il cerchio di anteprima è
  // ben visibile sopra la card dell'editor.
  const apriEditorZona = useCallback(
    (e: NativeSyntheticEvent<PressEvent>) => {
      const lngLat = e.nativeEvent.lngLat;
      if (!lngLat) return;
      if (pieno) {
        avvisa(
          'Zone al completo',
          'Hai già 2 zone sicure. Eliminane una da «Posizione e mappa» per crearne un’altra.',
        );
        return;
      }
      const [lng, lat] = lngLat;
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      setZoneRadius(200);
      setZoneDraft({ lat, lng });
      cameraRef.current?.easeTo({
        center: [lng, lat],
        zoom: Math.max(viewport.zoom, 15),
        duration: 420,
      });
    },
    [pieno, viewport.zoom],
  );

  const selezionaAmico = useCallback((a: PuntoAmico) => setSelezione({ tipo: 'amico', amico: a }), []);
  const selezionaEvento = useCallback((e: PuntoEvento) => {
    // L'host è un amico noto (gli eventi vengono dagli amici): risolve identità/azioni.
    const host = useMapStore.getState().friends[e.userId] ?? null;
    setSelezione({ tipo: 'evento', evento: e, host });
  }, []);

  if (failed) {
    return (
      <View style={styles.flex}>
        <StatoErrore messaggio="Mappa non caricata. Controlla la connessione." onRetry={retry} />
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <Map
        key={attempt}
        style={styles.flex}
        mapStyle={mapStyleDark}
        // ⚠️ Android + New Architecture (Fabric): la GLSurfaceView di default di
        // MapLibre NON viene composta nella gerarchia RN → l'output GL è invisibile
        // (si vede lo sfondo chiaro della finestra dietro, mappa "grigia/bianca").
        // TextureView compone in-hierarchy e risolve. Workaround documentato upstream.
        androidView="texture"
        touchRotate={false}
        touchPitch={false}
        compass={false}
        logo={false}
        attribution
        attributionPosition={{ bottom: bottomInset, right: spacing.md }}
        onDidFinishLoadingMap={onLoaded}
        onDidFailLoadingMap={() => setFailed(true)}
        onLongPress={apriEditorZona}
        onRegionIsChanging={viewportInCambiamento}
        onRegionDidChange={aggiornaViewport}
      >
        <Camera
          ref={cameraRef}
          initialViewState={{ center: MAP_DEFAULT.center, zoom: MAP_DEFAULT.zoom }}
          minZoom={MAP_DEFAULT.minZoom}
          maxZoom={MAP_DEFAULT.maxZoom}
        />
        {/* Safe Zone (MM9): cerchi salvati + anteprima della zona in creazione.
            Sotto le aure (layer di stile, non Marker) — non rubano la scena. */}
        <ZonesLayer zones={zones} draft={zoneDraft ? { ...zoneDraft, radiusM: zoneRadius } : null} />
        {/* Amici ed eventi (MM8): aure Skia, bolle stanza, clustering + spiderfy. */}
        <AuraLayer
          viewport={viewport}
          onSelectFriend={selezionaAmico}
          onSelectEvent={selezionaEvento}
          onExpandCluster={espandiCluster}
        />
        {/* La mia aura: puntino "tu" alla posizione reale (esatta per l'owner). */}
        <MeMarker onPress={apriFlusso} />
      </Map>

      {/* Attribuzione minima sempre visibile (ODbL) — sopra la BottomBar. */}
      <View style={[styles.attribution, { bottom: bottomInset }]} pointerEvents="none">
        <Text style={styles.attributionText}>{MAP_ATTRIBUTION}</Text>
      </View>

      {/* "Centra su di me": solo quando ho una posizione. */}
      {myCoords ? (
        <Pressable
          style={({ pressed }) => [styles.fab, { bottom: bottomInset + 108 }, pressed && styles.pressed]}
          onPress={centraSuDiMe}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Centra sulla mia posizione"
        >
          <Ionicons name="locate" size={20} color={colors.ink} />
        </Pressable>
      ) : null}

      {/* Controllo di presenza: pill di stato/azione (accendi / countdown). */}
      <MapPresenceControl bottom={bottomInset + 44} onPress={apriFlusso} />

      {/* Velo di caricamento: stessa tinta della terra, poi dissolve al ready. */}
      {loaded ? null : (
        <Animated.View style={[styles.veil, { opacity: veil }]} pointerEvents="none">
          <View style={styles.spinnerDot} />
          <Text style={styles.veilText}>Carico la mappa…</Text>
        </Animated.View>
      )}

      {/* Stato vuoto (map.md §9): riquadro compatto in alto a destra — spiega la
          lente senza coprire la mappa. Non intercetta i gesti (pan/zoom/long-press
          restano attivi sotto). Nascosto se c'è il banner di errore (no overlap). */}
      {loaded && mappaVuota && !zoneDraft && !snapshot.isError ? (
        <View style={[styles.emptyCard, { top: insets.top + spacing.sm }]} pointerEvents="none">
          <View style={styles.emptyHeader}>
            <Ionicons name="sparkles-outline" size={15} color={colors.accentSoft} />
            <Text style={styles.emptyTitle}>La tua lente sugli amici</Text>
          </View>
          <Text style={styles.emptyText}>
            Qui compaiono i tuoi amici quando accendono l’Aura. Tieni premuto per una zona sicura.
          </Text>
        </View>
      ) : null}

      {/* Errore snapshot (map.md §9): banner sobrio, la mappa resta usabile. */}
      {snapshot.isError ? (
        <Pressable
          style={[styles.banner, { top: insets.top + spacing.sm }]}
          onPress={() => void snapshot.refetch()}
          accessibilityRole="button"
          accessibilityLabel="Mappa non aggiornata. Tocca per riprovare"
          hitSlop={8}
        >
          <Ionicons name="cloud-offline-outline" size={14} color={colors.warning} />
          <Text style={styles.bannerText}>Mappa non aggiornata · Tocca per riprovare</Text>
        </Pressable>
      ) : null}

      {/* Sheet: onboarding (consenso+permesso) → durate/gestione. */}
      <MapOnboarding
        visible={sheet === 'onboarding'}
        onClose={() => setSheet('none')}
        onPronto={() => setSheet('share')}
      />
      <ShareSheet visible={sheet === 'share'} onClose={() => setSheet('none')} />

      {/* Card di dettaglio (MM8): tap su un'aura/bolla → identità + tempo + azioni. */}
      <MapFriendCard
        selezione={selezione}
        nowMs={nowCalibrato(clockOffsetMs)}
        onClose={() => setSelezione(null)}
      />

      {/* Editor Safe Zone (MM9): aperto dal long-press, chiude pulendo la bozza. */}
      <SafeZoneEditor
        visible={!!zoneDraft}
        center={zoneDraft}
        radiusM={zoneRadius}
        onChangeRadius={setZoneRadius}
        onClose={() => setZoneDraft(null)}
        onSaved={() => setZoneDraft(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: MAP_PALETTE.land },
  attribution: {
    position: 'absolute',
    left: spacing.md,
    backgroundColor: 'rgba(4,5,10,0.55)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
  },
  attributionText: { color: colors.faint, fontSize: 10, fontFamily: fontFamily.medium },
  fab: {
    position: 'absolute',
    right: spacing.md,
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(11,12,16,0.92)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: { opacity: 0.75 },
  veil: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: MAP_PALETTE.land,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  spinnerDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent },
  veilText: { color: colors.muted, fontSize: fontSize.sm, fontFamily: fontFamily.medium },

  // Stato vuoto: riquadro compatto ancorato in alto a destra, non intercetta i gesti.
  emptyCard: {
    position: 'absolute',
    right: spacing.md,
    maxWidth: 208,
    gap: spacing.xs,
    backgroundColor: 'rgba(11,12,16,0.82)',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  emptyHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  emptyTitle: { color: colors.ink, fontSize: fontSize.sm, fontFamily: fontFamily.semibold },
  emptyText: { color: colors.muted, fontSize: fontSize.xs, fontFamily: fontFamily.sans, lineHeight: 16 },

  // Banner di errore snapshot: pill sobria in alto, tappabile per riprovare.
  banner: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(11,12,16,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.5)',
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  bannerText: { color: colors.ink, fontSize: fontSize.xs, fontFamily: fontFamily.semibold },
});
