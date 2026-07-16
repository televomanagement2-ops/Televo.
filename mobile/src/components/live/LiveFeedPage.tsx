// =============================================================================
// LiveFeedPage — una pagina del feed verticale: preview video reale (M12 / LM7).
// =============================================================================
// Il feed è stile TikTok (una live a schermo per volta) e OGNI preview è una
// connessione LiveKit subscriber (§12.15): la disciplina di budget R-3 è il
// requisito di accettazione, non un'ottimizzazione —
//  · si connette SOLO la pagina visibile (`attiva`, decisa dalla viewability
//    del pager) e SOLO se la live è in onda (in `paused` le tracce sono
//    unpublished: connettersi comprerebbe minuti per zero pixel — il velo
//    "Live in pausa" non ha bisogno della stanza);
//  · DISCONNESSIONE immediata allo scroll/blur/background (l'effect si smonta);
//  · audio sempre MUTO in preview (QA-3): volume 0 su ogni participant remoto,
//    anche su quelli che entrano dopo. Niente AudioSession: non serve per il
//    video e non va conteso con lo schermo live (§15.6).
// L'attacco è DEBOUNCED: uno swipe veloce attraversa le pagine senza mintare
// token (il mint È il join, live.md §5 — ogni connessione conta come
// spettatore reale: giusto per chi si ferma a guardare, spreco per chi passa).
//
// Tap → schermo spettatore completo (/live/[id]): la preview si stacca PRIMA
// del push (un proprietario per risorsa, pattern composer LM6) e in quel caso
// NON chiama live_leave — il mint dello schermo live rientra subito e una
// leave in ritardo lo scavalcherebbe. Negli altri distacchi la leave parte
// best-effort (il webhook riconcilia i silenzosi).
//
// ⚠️ Importa livekit-client/@livekit/react-native (nativo): montato SOLO
// dentro LiveFeed, caricato lazy dietro il guard Expo Go (pattern useLive).

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { VideoTrack } from '@livekit/react-native';
import { Room, RoomEvent, Track, type RemoteTrackPublication } from 'livekit-client';
import { Avatar } from '@/components/ui/Avatar';
import type { TrackRefLive } from '@/hooks/useLive';
import { authErrorCode } from '@/lib/auth';
import { fetchTokenLive, lasciaLive } from '@/lib/live';
import { inizializzaLiveKit } from '@/lib/livekit';
import { useLiveStore, type LiveAmico } from '@/store/liveStore';
import { colors, fontFamily, fontSize, motion, radius, spacing } from '@/constants/theme';

/** Attesa prima di attaccare la pagina visibile: uno swipe rapido non minta. */
const ATTACCO_DEBOUNCE_MS = 350;

/** Codici per cui la live non è più guardabile: sparisce dal feed (lo store è
 *  la fotografia "chi posso guardare ORA"; lo snapshot poi conferma). */
const CODICI_LIVE_SPARITA = new Set([
  'live_not_joinable',
  'live_already_ended',
  'live_not_found',
  'not_visible',
  'forbidden',
]);

type FasePreview = 'spenta' | 'connessione' | 'attiva' | 'fallita';

interface Props {
  live: LiveAmico;
  /** true = questa è la pagina visibile del pager (e la Home è in foreground). */
  attiva: boolean;
  /** Altezza della pagina (il pager è pagingEnabled: una live a schermo). */
  altezza: number;
  /** Apre lo schermo spettatore completo. */
  onApri: (liveId: string) => void;
}

export const LiveFeedPage = memo(function LiveFeedPage({ live, attiva, altezza, onApri }: Props) {
  const [fase, setFase] = useState<FasePreview>('spenta');
  // Contatore bumpato dagli eventi Room: il trackRef si ricalcola in render
  // dalla Room viva (pattern useLiveSession, niente stato duplicato).
  const [versione, setVersione] = useState(0);
  const roomRef = useRef<Room | null>(null);
  const disconnessioneVolutaRef = useRef(false);
  // true mentre si apre lo schermo live di QUESTA live: il distacco della
  // preview non deve mandare live_leave (il mint dello schermo rientra subito).
  const inAperturaRef = useRef(false);

  const connetti = attiva && live.status === 'live';
  const liveId = live.liveId;
  const hostId = live.host.userId;

  /** Preview sempre muta (QA-3): vale anche per chi entra dopo. */
  const silenzia = useCallback((room: Room) => {
    for (const p of room.remoteParticipants.values()) p.setVolume(0);
  }, []);

  useEffect(() => {
    if (!connetti) {
      setFase('spenta');
      return;
    }
    inAperturaRef.current = false; // pagina di nuovo attiva: eventuale ritorno dallo schermo live
    const segnale = { annullato: false };
    let partita = false; // il mint è avvenuto: al distacco serve la leave

    const timer = setTimeout(() => {
      void (async () => {
        try {
          setFase('connessione');
          const pronto = await inizializzaLiveKit();
          if (!pronto || segnale.annullato) return;

          // Il mint è il join (§5): da qui si è spettatori reali della live.
          const token = await fetchTokenLive(liveId);
          if (segnale.annullato) return;
          partita = true;

          // M14/V4 (preview bianca Android): NIENTE adaptiveStream e NIENTE
          // autoSubscribe. La regolazione automatica lega il download del
          // video alla visibilità dell'elemento, ma dentro il pager (FlatList
          // pagingEnabled su New Architecture) il rilevamento può non scattare
          // mai → stream in pausa → riquadro vuoto al posto del video. La
          // disciplina qui è già esplicita (R-3: UNA pagina connessa per
          // volta): iscrizione mirata alla SOLA camera dell'host principale —
          // deterministico e più parco di banda (niente audio né co-host).
          const room = new Room({ adaptiveStream: false });
          roomRef.current = room;
          const bump = () => setVersione((v) => v + 1);
          const iscriviCameraHost = () => {
            const publication = room.remoteParticipants
              .get(hostId)
              ?.getTrackPublication(Track.Source.Camera) as RemoteTrackPublication | undefined;
            if (publication && !publication.isSubscribed) publication.setSubscribed(true);
          };
          const suPartecipanti = () => {
            iscriviCameraHost();
            bump();
            silenzia(room);
          };
          room
            .on(RoomEvent.ParticipantConnected, suPartecipanti)
            .on(RoomEvent.TrackPublished, suPartecipanti)
            .on(RoomEvent.TrackSubscribed, suPartecipanti)
            .on(RoomEvent.ParticipantDisconnected, bump)
            .on(RoomEvent.TrackUnsubscribed, bump)
            .on(RoomEvent.TrackMuted, bump)
            .on(RoomEvent.TrackUnmuted, bump)
            // M14R3: iscrizione rifiutata o persa lato SFU (transiente) — un
            // retry gentile, poi il fallback statico resta onesto.
            .on(RoomEvent.TrackSubscriptionFailed, () => {
              setTimeout(() => {
                if (!segnale.annullato) iscriviCameraHost();
              }, 1000);
            })
            .on(RoomEvent.Disconnected, () => {
              if (disconnessioneVolutaRef.current) return;
              // Fine stanza, kick o rete: la preview non insiste — il feed
              // (delta live_ended + reconcile) è la verità; qui solo fallback.
              roomRef.current = null;
              setFase('fallita');
            });

          await room.connect(token.wsUrl, token.token, { autoSubscribe: false });
          if (segnale.annullato) return; // il cleanup ha già chiuso la room
          silenzia(room);
          iscriviCameraHost();
          setFase('attiva');
          bump();
        } catch (e) {
          if (segnale.annullato) return;
          if (CODICI_LIVE_SPARITA.has(authErrorCode(e))) {
            // Live finita o visibilità revocata: via dal feed, subito.
            useLiveStore.getState().rimuoviLive(liveId);
          } else {
            setFase('fallita'); // errore transiente: fallback statico, tap = riprova via schermo
          }
        }
      })();
    }, ATTACCO_DEBOUNCE_MS);

    return () => {
      segnale.annullato = true;
      clearTimeout(timer);
      const room = roomRef.current;
      roomRef.current = null;
      if (room) {
        disconnessioneVolutaRef.current = true;
        void room
          .disconnect()
          .catch(() => {})
          .finally(() => {
            room.removeAllListeners();
            disconnessioneVolutaRef.current = false;
          });
      }
      // Uscita dalla preview = uscita dalla live (best-effort), TRANNE quando
      // si sta entrando nello schermo spettatore della stessa live.
      if (partita && !inAperturaRef.current) lasciaLive(liveId);
      setFase('spenta');
    };
  }, [connetti, liveId, hostId, silenzia]);

  // Il video dell'HOST PRINCIPALE (l'identità che il feed conosce, L-1): la
  // preview si iscrive SOLO a quella traccia (vedi iscriviCameraHost sopra).
  const trackRef = useMemo<TrackRefLive | null>(() => {
    void versione; // dipendenza esplicita: la Room è mutabile, il bump la fotografa
    const room = roomRef.current;
    if (!room || fase !== 'attiva') return null;
    const participant = room.remoteParticipants.get(live.host.userId);
    const publication = participant?.getTrackPublication(Track.Source.Camera);
    if (!participant || !publication?.track || publication.isMuted) return null;
    return { participant, publication, source: Track.Source.Camera };
  }, [versione, fase, live.host.userId]);

  const apri = () => {
    inAperturaRef.current = true; // il distacco (blur) non manderà la leave
    onApri(liveId);
  };

  const nomeHost = live.host.displayName ?? live.host.username;
  const inPausa = live.status === 'paused';

  return (
    <Pressable style={[styles.pagina, { height: altezza }]} onPress={apri}>
      {trackRef ? (
        // M14R3: NIENTE zOrder — stessa configurazione dello schermo live, che
        // sugli stessi device renderizza. Il tentativo media-overlay di M14R2/F2
        // (zOrder=1) lasciava comunque il riquadro cieco su alcuni compositor
        // OEM: il vero prerequisito è il pager senza clipping (LiveFeed,
        // removeClippedSubviews=false). La KEY sulla trackSid ricrea la
        // SurfaceView nativa a ogni traccia nuova: una surface riciclata da
        // Fabric può restare vuota anche con la traccia sottoscritta.
        <VideoTrack
          key={trackRef.publication.trackSid}
          trackRef={trackRef}
          style={styles.video}
          objectFit="cover"
        />
      ) : (
        <View style={styles.senzaVideo}>
          <Avatar uri={live.host.avatarUrl} name={nomeHost} size={84} />
          {fase === 'attiva' ? <Text style={styles.senzaVideoTesto}>Camera spenta</Text> : null}
        </View>
      )}

      {fase === 'connessione' ? (
        <View style={styles.veloCarico} pointerEvents="none">
          <ActivityIndicator color={colors.ink} />
        </View>
      ) : null}

      {inPausa ? (
        <View style={styles.veloPausa} pointerEvents="none">
          <Ionicons name="pause-circle-outline" size={48} color={colors.ink} />
          <Text style={styles.pausaTitolo}>Live in pausa</Text>
          <Text style={styles.pausaSub}>L’host torna tra poco.</Text>
        </View>
      ) : null}

      {/* Overlay identità: badge in alto, host + titolo in basso. QA-2
          (M15/RW-4): accanto al badge la pilla 👁 col viewer_count del feed —
          statica (si aggiorna con snapshot/reconcile dello store), aiuta a
          leggere il ranking a engagement. I like NON esistono in preview
          (vivono solo nello schermo /live/[id], §0.2). */}
      <View style={styles.overlay} pointerEvents="none">
        <View style={styles.rigaBadge}>
          <BadgePreview inPausa={inPausa} />
          <View style={styles.pillaOcchi}>
            <Ionicons name="eye-outline" size={13} color={colors.ink} />
            <Text style={styles.pillaOcchiTesto}>{live.viewerCount}</Text>
          </View>
        </View>
        <View style={styles.piede}>
          <View style={styles.rigaHost}>
            <Avatar uri={live.host.avatarUrl} name={nomeHost} size={30} />
            <Text style={styles.nomeHost} numberOfLines={1}>
              {nomeHost}
            </Text>
          </View>
          <Text style={styles.titolo} numberOfLines={2}>
            {live.title}
          </Text>
          <Text style={styles.hint}>Tocca per guardare</Text>
        </View>
      </View>
    </Pressable>
  );
});

/** Badge LIVE/PAUSA col puntino pulsante (stessa estetica dello schermo live). */
function BadgePreview({ inPausa }: { inPausa: boolean }) {
  const alone = useSharedValue(1);
  useEffect(() => {
    alone.value = withRepeat(withTiming(0.35, { duration: motion.pulse / 2 }), -1, true);
  }, [alone]);
  const stile = useAnimatedStyle(() => ({ opacity: inPausa ? 1 : alone.value }));

  return (
    <View style={[styles.badge, inPausa && styles.badgePausa]}>
      <Animated.View style={[styles.badgePunto, stile]} />
      <Text style={styles.badgeTesto}>{inPausa ? 'PAUSA' : 'LIVE'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pagina: { width: '100%', backgroundColor: colors.base, overflow: 'hidden' },
  video: { ...StyleSheet.absoluteFillObject },
  senzaVideo: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
  },
  senzaVideoTesto: { color: colors.muted, fontSize: fontSize.sm, fontFamily: fontFamily.medium },
  veloCarico: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  veloPausa: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  pausaTitolo: { color: colors.ink, fontSize: fontSize.lg, fontFamily: fontFamily.semibold },
  pausaSub: { color: colors.muted, fontSize: fontSize.sm, fontFamily: fontFamily.sans },

  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    padding: spacing.lg,
  },
  rigaBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.danger,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  pillaOcchi: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  pillaOcchiTesto: { color: colors.ink, fontSize: fontSize.xs, fontFamily: fontFamily.semibold },
  badgePausa: { backgroundColor: colors.elevated },
  badgePunto: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#ffffff' },
  badgeTesto: {
    color: '#ffffff',
    fontSize: fontSize.xs,
    fontFamily: fontFamily.semibold,
    letterSpacing: 1,
  },
  piede: { gap: spacing.xs },
  rigaHost: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  nomeHost: {
    color: colors.ink,
    fontSize: fontSize.base,
    fontFamily: fontFamily.semibold,
    flexShrink: 1,
  },
  titolo: { color: colors.ink, fontSize: fontSize.sm, fontFamily: fontFamily.medium },
  hint: { color: colors.muted, fontSize: fontSize.xs, fontFamily: fontFamily.medium },
});
