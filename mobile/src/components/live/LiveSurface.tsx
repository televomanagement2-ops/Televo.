// =============================================================================
// LiveSurface — lo schermo della diretta, host E spettatore (M12 / LM6).
// =============================================================================
// Stessa rotta, ruolo dal token/live_detail (live.md §15.6): l'host (e il
// co-host attivo) pubblica e controlla i propri media; l'host principale in
// più governa pausa/fine/inviti/kick e resta l'unico a vedere la LISTA
// nominativa degli spettatori. Da M15 (RW-3/RW-4) i CONTATORI sono pubblici:
// pilla 👁 e pilla ❤ per tutti i visibili, like TikTok illimitati via
// double-tap sul video o bottone del rail (cuori solo locali, RW-3a). Lo
// spettatore guarda, lika, commenta, silenzia in locale, segnala. La sessione
// LiveKit e la verità DB vivono in useLiveSession; qui c'è solo la messa in
// scena. Caricato via lazy dietro il guard Expo Go.

import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { VideoTrack } from '@livekit/react-native';
import { useKeepAwake } from 'expo-keep-awake';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { StatoErrore } from '@/components/ui/StatoErrore';
import { CommentiOverlay } from '@/components/live/CommentiOverlay';
import { CommentComposer, CommentInput } from '@/components/live/CommentInput';
import { CoHostSheet } from '@/components/live/CoHostSheet';
import { CuoriOverlay, type CuoriOverlayHandle } from '@/components/live/CuoriOverlay';
import { ListaSpettatori } from '@/components/live/ListaSpettatori';
import { StatoPausa } from '@/components/live/StatoPausa';
import {
  useLiveComments,
  useLiveSession,
  type CommentoLive,
  type LiveSessionApi,
} from '@/hooks/useLive';
import { useLiveLikes } from '@/hooks/useLiveLikes';
import { avvisa, conferma, mostraMenu } from '@/lib/dialoghi';
import { liveErrorMessage } from '@/lib/errors';
import { segnalaCommentoLive, segnalaLive } from '@/lib/live';
import { REPORT_REASONS } from '@/constants/drops';
import { colors, fontFamily, fontSize, motion, radius, spacing } from '@/constants/theme';

export default function LiveSurface({ liveId }: { liveId: string }) {
  // M14/V3: durante una live lo schermo non va MAI in standby — vale per host,
  // co-host e spettatore, per tutta la vita dello schermo (unmount = timeout
  // di sistema ripristinato dal hook stesso).
  useKeepAwake();

  const navigation = useNavigation();

  // Il prompt live-vuota (§12.20) e il back hardware chiamano l'API più
  // recente via ref (le callback nascono prima che `api` esista).
  const apiRef = useRef<LiveSessionApi | null>(null);

  const api = useLiveSession(liveId, {
    onLiveVuota: () =>
      conferma({
        titolo: 'Nessuno sta guardando',
        messaggio: 'La live è vuota da qualche minuto. Vuoi continuare o terminare?',
        confermaLabel: 'Termina',
        annullaLabel: 'Continua',
        distruttiva: true,
        onConferma: () => {
          void apiRef.current
            ?.termina()
            .then(() => uscita())
            .catch((e) => avvisa('Ops', liveErrorMessage(e)));
        },
      }),
  });
  apiRef.current = api;

  const [sheetCoHost, setSheetCoHost] = useState(false);
  const [sheetSpettatori, setSheetSpettatori] = useState(false);
  const [invitoNascosto, setInvitoNascosto] = useState(false);
  const [inAccettazione, setInAccettazione] = useState(false);
  const [composerAperto, setComposerAperto] = useState(false);

  const identitaNote = useMemo(
    () =>
      api.hosts.map((h) => ({
        userId: h.user_id,
        nome: h.display_name ?? h.username,
        avatarUrl: h.avatar_url,
      })),
    [api.hosts],
  );

  // --- Like TikTok (M15/LR8, RW-3) ----------------------------------------------
  // Si lika SOLO in stato 'live' (in pausa gesto e bottone sono spenti; il
  // trigger server rifiuta comunque, specchio dei commenti). L'handler onLike
  // entra nel canale condiviso via useLiveComments (UN solo subscribe).
  const likeAbilitato = api.fase === 'attiva' && api.status === 'live';
  const { likeTotali, tap, onLike } = useLiveLikes(liveId, likeAbilitato, api.likeCount);
  const cuoriRef = useRef<CuoriOverlayHandle>(null);

  const { commenti, invia } = useLiveComments(liveId, api.fase === 'attiva', identitaNote, onLike);

  // Origine del root nella finestra: converte i pageX/pageY del bottone cuore
  // nelle coordinate dell'overlay (che è absoluteFill del root).
  const rootRef = useRef<View>(null);
  const origineRootRef = useRef({ x: 0, y: 0 });
  const misuraRoot = () => {
    rootRef.current?.measureInWindow((x, y) => {
      origineRootRef.current = { x, y };
    });
  };

  // Double-tap OVUNQUE sul video (RW-3): il detector vive sul CONTENITORE RN
  // della griglia — mai sulla SurfaceView nativa (rischio R-8, pattern
  // ViewerMedia). e.x/e.y sono già nel sistema del root (griglia=absoluteFill).
  const gestoLike = useMemo(
    () =>
      Gesture.Tap()
        .numberOfTaps(2)
        .enabled(likeAbilitato)
        .runOnJS(true)
        .onEnd((e, riuscito) => {
          if (!riuscito) return;
          tap();
          cuoriRef.current?.spawn(e.x, e.y);
        }),
    [likeAbilitato, tap],
  );

  // --- Uscita e back hardware ---------------------------------------------------

  const uscita = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/home');
  };

  // L'host che lascia lo schermo a live attiva deve DECIDERE (§2: la fine è
  // esplicita, mai implicita): il back è intercettato e chiede conferma.
  const hostAttivoRef = useRef(false);
  hostAttivoRef.current = api.sonoHost && api.fase === 'attiva';
  useEffect(() => {
    return navigation.addListener('beforeRemove', (e) => {
      if (!hostAttivoRef.current) return;
      e.preventDefault();
      conferma({
        titolo: 'Terminare la live?',
        messaggio: 'La diretta finirà per tutti. Le live terminate non restano visibili.',
        confermaLabel: 'Termina',
        distruttiva: true,
        onConferma: () => {
          void apiRef.current
            ?.termina()
            .catch(() => {})
            .finally(() => navigation.dispatch(e.data.action));
        },
      });
    });
  }, [navigation]);

  const chiudi = () => {
    if (api.sonoHost && api.fase === 'attiva') {
      // Passa dal back intercettato: stessa conferma, un solo percorso.
      uscita();
      return;
    }
    if (api.fase === 'attiva') api.esci();
    uscita();
  };

  // --- Segnalazioni (sistema report esistente, §11) -------------------------------

  const segnalaQuestaLive = () =>
    mostraMenu({
      titolo: 'Segnala la live',
      sottotitolo: 'La segnalazione è anonima e arriva ai moderatori.',
      voci: REPORT_REASONS.map((motivo) => ({
        label: motivo,
        onPress: () => {
          segnalaLive(liveId, motivo)
            .then(() => avvisa('Grazie', 'Segnalazione inviata ai moderatori.'))
            .catch((e) => avvisa('Ops', liveErrorMessage(e)));
        },
      })),
    });

  const segnalaCommento = (c: CommentoLive) =>
    mostraMenu({
      titolo: 'Segnala il commento',
      sottotitolo: `di ${c.nome}`,
      voci: REPORT_REASONS.map((motivo) => ({
        label: motivo,
        onPress: () => {
          segnalaCommentoLive(c.id, motivo)
            .then(() => avvisa('Grazie', 'Segnalazione inviata ai moderatori.'))
            .catch((e) => avvisa('Ops', liveErrorMessage(e)));
        },
      })),
    });

  // --- Azioni con errore a dialogo -------------------------------------------------

  const conErrore = (azione: () => Promise<void>) => () => {
    void azione().catch((e) => avvisa('Ops', liveErrorMessage(e)));
  };

  const accettaInvito = () => {
    setInAccettazione(true);
    api
      .accettaInvito()
      .catch((e) => avvisa('Ops', liveErrorMessage(e)))
      .finally(() => setInAccettazione(false));
  };

  // V6: uscita volontaria dal Co-Live (conferma → RPC → riconnessione da
  // spettatore). La live dell'host principale continua senza il mio video.
  const lasciaCoLive = () =>
    conferma({
      titolo: 'Lasciare il Co-Live?',
      messaggio: 'Torni tra gli spettatori: la live continua senza il tuo video.',
      confermaLabel: 'Lascia',
      onConferma: () => {
        void api.lasciaCoLive().catch((e) => avvisa('Ops', liveErrorMessage(e)));
      },
    });

  // --- Stati non attivi --------------------------------------------------------------

  if (api.fase === 'connessione') {
    return (
      <View style={styles.centrato}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }
  if (api.fase === 'errore') {
    return <StatoErrore messaggio={api.errore ?? undefined} onRetry={api.ricarica} />;
  }
  if (api.fase === 'terminata' || api.fase === 'rimossa') {
    return (
      <View style={styles.centrato}>
        <Ionicons name="videocam-off-outline" size={44} color={colors.faint} />
        <Text style={styles.fineTitolo}>
          {api.fase === 'terminata' ? 'La live è terminata' : 'Questa live non è più disponibile'}
        </Text>
        <Text style={styles.fineSub}>
          {api.fase === 'terminata'
            ? 'Le dirette non restano registrate: quando finiscono, finiscono.'
            : 'Torna alla Home per vedere chi altro è in diretta.'}
        </Text>
        <Button label="Chiudi" variant="secondary" onPress={uscita} />
      </View>
    );
  }

  // --- Diretta attiva -----------------------------------------------------------------

  const hostPrincipale = api.hosts[0];
  // RW-4: il conteggio 👁 resta client-side dai partecipanti LiveKit
  // (istantaneo, zero costo); lo spettatore aggiunge sé stesso — non è tra i
  // remoti; host e co-host non si contano (invariato).
  const spettatoriInStanza =
    api.idsSpettatori.length + (api.sonoHost || api.sonoCoHost ? 0 : 1);

  return (
    <View ref={rootRef} style={styles.root} onLayout={misuraRoot}>
      {/* Video: 1 pieno, 2 in colonna, 3–4 a griglia (Co-Live, §4). La cella
          di un host senza traccia (camera spenta) NON sparisce: placeholder
          camera-off al suo posto, la griglia resta stabile (M14R3). La key
          sulla trackSid ricrea la surface nativa a ogni traccia nuova.
          Il double-tap like (RW-3) avvolge il contenitore RN della griglia:
          gli overlay interattivi sopra (bottoni, commenti) restano padroni
          dei propri tocchi. */}
      <GestureDetector gesture={gestoLike}>
        <View style={styles.griglia}>
          {api.riquadri.map((r) => (
            <View key={r.userId} style={cellaStyle(api.riquadri.length)}>
              {r.trackRef ? (
                <VideoTrack
                  key={r.trackRef.publication.trackSid}
                  trackRef={r.trackRef}
                  style={styles.video}
                  objectFit="cover"
                  mirror={r.locale && api.fotocameraFrontale}
                />
              ) : (
                <View style={styles.cellaSpenta}>
                  <Avatar uri={r.avatarUrl} name={r.nome} size={api.riquadri.length <= 1 ? 84 : 56} />
                  <View style={styles.cellaSpentaRiga}>
                    <Ionicons name="videocam-off-outline" size={15} color={colors.muted} />
                    <Text style={styles.cellaSpentaTesto}>Camera spenta</Text>
                  </View>
                </View>
              )}
            </View>
          ))}
          {api.riquadri.length === 0 ? (
            <View style={styles.senzaVideo}>
              <Avatar
                uri={hostPrincipale?.avatar_url}
                name={hostPrincipale?.display_name ?? hostPrincipale?.username}
                size={84}
              />
              {api.status === 'live' ? <Text style={styles.senzaVideoTesto}>Camera spenta</Text> : null}
            </View>
          ) : null}
        </View>
      </GestureDetector>

      {api.status === 'paused' ? <StatoPausa sonoHost={api.sonoHost} /> : null}

      <SafeAreaView style={styles.overlay} edges={['top', 'bottom']} pointerEvents="box-none">
        {/* Testata: badge LIVE + titolo + host, X per chiudere. */}
        <View style={styles.testata} pointerEvents="box-none">
          <View style={styles.testataSx}>
            <View style={styles.rigaBadge}>
              <BadgeLive inPausa={api.status === 'paused'} />
              {/* M15/RW-4: pilla 👁 per TUTTI i visibili — pubblico è il
                  NUMERO; la LISTA nominativa col kick resta all'host
                  principale (unico per cui la pilla è tappabile). */}
              <Pressable
                style={styles.pillaOcchi}
                onPress={api.sonoHost ? () => setSheetSpettatori(true) : undefined}
                disabled={!api.sonoHost}
              >
                <Ionicons name="eye-outline" size={14} color={colors.ink} />
                <Text style={styles.pillaOcchiTesto}>{spettatoriInStanza}</Text>
              </Pressable>
              {/* M15/RW-3b: totale ❤ pubblico, sale in realtime quando
                  CHIUNQUE lika (baseline snapshot + delta, useLiveLikes). */}
              <View style={styles.pillaOcchi}>
                <Ionicons name="heart" size={14} color={colors.danger} />
                <Text style={styles.pillaOcchiTesto}>{likeTotali}</Text>
              </View>
            </View>
            <Text style={styles.titolo} numberOfLines={1}>
              {api.titolo}
            </Text>
            {hostPrincipale ? (
              <View style={styles.rigaHost}>
                <Avatar
                  uri={hostPrincipale.avatar_url}
                  name={hostPrincipale.display_name ?? hostPrincipale.username}
                  size={22}
                />
                <Text style={styles.nomeHost} numberOfLines={1}>
                  {hostPrincipale.display_name ?? hostPrincipale.username}
                  {api.hosts.length > 1 ? `  +${api.hosts.length - 1}` : ''}
                </Text>
              </View>
            ) : null}
          </View>
          <Pressable onPress={chiudi} hitSlop={8} style={styles.bottoneChiudi}>
            <Ionicons name="close" size={26} color={colors.ink} />
          </Pressable>
        </View>

        {/* Invito Co-Live pendente per me (accetto → token nuovo → pubblico). */}
        {api.mioInvitoPendente && !invitoNascosto ? (
          <View style={styles.banner}>
            <Ionicons name="people-outline" size={18} color={colors.accentSoft} />
            <Text style={styles.bannerTesto}>Ti ha invitato a trasmettere in Co-Live.</Text>
            <Pressable
              onPress={accettaInvito}
              disabled={inAccettazione}
              style={[styles.bannerAzione, inAccettazione && styles.spento]}
            >
              <Text style={styles.bannerAzioneTesto}>Accetta</Text>
            </Pressable>
            <Pressable onPress={() => setInvitoNascosto(true)} hitSlop={6}>
              <Ionicons name="close" size={18} color={colors.muted} />
            </Pressable>
          </View>
        ) : null}

        <View style={styles.spazio} pointerEvents="box-none" />

        {/* Piede: commenti a sinistra, controlli a destra. */}
        <View style={styles.piede} pointerEvents="box-none">
          <View style={styles.colonnaCommenti} pointerEvents="box-none">
            <CommentiOverlay commenti={commenti} onSegnala={segnalaCommento} />
            {api.possoCommentare ? <CommentInput onApri={() => setComposerAperto(true)} /> : null}
          </View>

          <View style={styles.colonnaControlli}>
            {/* Like dal rail (RW-3): per spettatori, co-host E host — +1 per
                tap, nessun toggle; in pausa è spento (il server rifiuta
                comunque). Il cuore spawna nel punto del press (pagina→root). */}
            <Pressable
              onPress={(e) => {
                tap();
                cuoriRef.current?.spawn(
                  e.nativeEvent.pageX - origineRootRef.current.x,
                  e.nativeEvent.pageY - origineRootRef.current.y,
                );
              }}
              disabled={!likeAbilitato}
              style={[styles.controllo, !likeAbilitato && styles.spento]}
            >
              <Ionicons name="heart" size={22} color={colors.danger} />
            </Pressable>
            {api.possoPubblicare && api.status === 'live' ? (
              <>
                <Controllo
                  icon={api.micAttivo ? 'mic-outline' : 'mic-off-outline'}
                  attivo={api.micAttivo}
                  onPress={conErrore(api.toggleMic)}
                />
                <Controllo
                  icon={api.cameraAttiva ? 'videocam-outline' : 'videocam-off-outline'}
                  attivo={api.cameraAttiva}
                  onPress={conErrore(api.toggleCamera)}
                />
                <Controllo icon="camera-reverse-outline" onPress={conErrore(api.flipCamera)} />
              </>
            ) : null}
            {api.sonoHost ? (
              <>
                <Controllo
                  icon={api.status === 'paused' ? 'play-outline' : 'pause-outline'}
                  onPress={conErrore(api.status === 'paused' ? api.riprendi : api.pausa)}
                />
                <Controllo icon="person-add-outline" onPress={() => setSheetCoHost(true)} />
              </>
            ) : (
              <>
                {/* V6: il co-host attivo può lasciare il Co-Live (torna
                    spettatore; fine/kick/inviti restano all'host principale). */}
                {api.sonoCoHost ? (
                  <Controllo icon="exit-outline" onPress={lasciaCoLive} />
                ) : null}
                <Controllo
                  icon={api.audioSilenziato ? 'volume-mute-outline' : 'volume-high-outline'}
                  attivo={!api.audioSilenziato}
                  onPress={api.toggleAudioLocale}
                />
                <Controllo icon="flag-outline" onPress={segnalaQuestaLive} />
              </>
            )}
          </View>
        </View>
      </SafeAreaView>

      {/* Cuori locali (RW-3a): layer sopra tutto, mai interattivo — i like
          altrui NON fanno cuori, solo il contatore che sale. */}
      <CuoriOverlay ref={cuoriRef} />

      {/* Fogli dell'host. */}
      {api.sonoHost ? (
        <>
          <CoHostSheet
            mode="gestione"
            visible={sheetCoHost}
            onClose={() => setSheetCoHost(false)}
            liveId={liveId}
            onInvita={api.invitaAmico}
            onRimuovi={api.rimuoviCoHostLive}
          />
          <ListaSpettatori
            visible={sheetSpettatori}
            onClose={() => setSheetSpettatori(false)}
            ids={api.idsSpettatori}
            onKick={api.kickSpettatore}
          />
        </>
      ) : null}

      {/* Composer commenti: layer assoluto sopra i controlli, montato solo
          quando serve (la tastiera è gestita lì con useAnimatedKeyboard). */}
      {composerAperto && api.possoCommentare ? (
        <CommentComposer onInvia={invia} onChiudi={() => setComposerAperto(false)} />
      ) : null}
    </View>
  );
}

// --- Pezzi di presentazione -----------------------------------------------------

/** Badge LIVE rosso col puntino pulsante (estetica LIVE rossa approvata). */
function BadgeLive({ inPausa }: { inPausa: boolean }) {
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

function Controllo({
  icon,
  onPress,
  attivo = true,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  attivo?: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.controllo, !attivo && styles.controlloOff]}>
      <Ionicons name={icon} size={22} color={colors.ink} />
    </Pressable>
  );
}

/** Layout dei riquadri video: 1 pieno · 2 in colonna · 3–4 a griglia 2×2. */
function cellaStyle(totale: number) {
  if (totale <= 1) return styles.cellaPiena;
  if (totale === 2) return styles.cellaMezza;
  return styles.cellaQuarto;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.base },
  centrato: {
    flex: 1,
    backgroundColor: colors.base,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  fineTitolo: {
    color: colors.ink,
    fontSize: fontSize.lg,
    fontFamily: fontFamily.semibold,
    textAlign: 'center',
  },
  fineSub: {
    color: colors.muted,
    fontSize: fontSize.sm,
    fontFamily: fontFamily.sans,
    textAlign: 'center',
    lineHeight: 20,
  },

  griglia: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cellaPiena: { width: '100%', height: '100%' },
  cellaMezza: { width: '100%', height: '50%' },
  cellaQuarto: { width: '50%', height: '50%' },
  video: { flex: 1 },
  cellaSpenta: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.base,
  },
  cellaSpentaRiga: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cellaSpentaTesto: { color: colors.muted, fontSize: fontSize.xs, fontFamily: fontFamily.medium },
  senzaVideo: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  senzaVideoTesto: { color: colors.muted, fontSize: fontSize.sm, fontFamily: fontFamily.medium },

  overlay: { flex: 1 },
  testata: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.md,
  },
  testataSx: { flex: 1, gap: spacing.xs },
  rigaBadge: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.danger,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  badgePausa: { backgroundColor: colors.elevated },
  badgePunto: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#ffffff' },
  badgeTesto: {
    color: '#ffffff',
    fontSize: fontSize.xs,
    fontFamily: fontFamily.semibold,
    letterSpacing: 1,
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
  titolo: { color: colors.ink, fontSize: fontSize.base, fontFamily: fontFamily.semibold },
  rigaHost: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  nomeHost: { color: colors.muted, fontSize: fontSize.sm, fontFamily: fontFamily.medium, flexShrink: 1 },
  bottoneChiudi: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    backgroundColor: 'rgba(11,12,16,0.9)',
    borderWidth: 1,
    borderColor: colors.accentDeep,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  bannerTesto: { flex: 1, color: colors.ink, fontSize: fontSize.sm, fontFamily: fontFamily.medium },
  bannerAzione: {
    backgroundColor: colors.accent,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  bannerAzioneTesto: { color: '#ffffff', fontSize: fontSize.sm, fontFamily: fontFamily.semibold },
  spento: { opacity: 0.5 },

  spazio: { flex: 1 },
  piede: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.md,
  },
  colonnaCommenti: { flex: 1, gap: spacing.sm },
  colonnaControlli: { gap: spacing.sm, alignItems: 'center' },
  controllo: {
    width: 46,
    height: 46,
    borderRadius: radius.full,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlloOff: { backgroundColor: 'rgba(251,113,133,0.35)', borderColor: colors.danger },
});
