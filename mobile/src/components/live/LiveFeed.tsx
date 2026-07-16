// =============================================================================
// LiveFeed — la categoria Live della Home: striscia + feed verticale (M12 / LM7).
// =============================================================================
// Superficie FULL-HEIGHT montata dal ramo `live` di home.tsx (pattern
// DropFeed/MapCanvas: fuori dalla ScrollView, il pager verticale non convive
// con uno scroll sullo stesso asse). live.md §7:
//  A. striscia orizzontale in alto (LiveStrip): attive (tap → apre la live) e,
//     da M15/LR6 (RW-1), i segnaposto delle terminate <24h (tap → profilo);
//     le terminate NON entrano mai negli items del pager (feed = solo attive);
//  B. feed verticale pagingEnabled stile TikTok: una live a schermo per volta
//     come preview video reale — la VIEWABILITY decide l'UNICA pagina `attiva`
//     (LiveFeedPage si connette solo allora, budget R-3) e il gate vale solo
//     con Home a fuoco e app in foreground (blur/background = disconnessione).
//     Quando le pagine finiscono (!hasMore), l'ultima è il segno di fine
//     FineFeedLive (M15/LR7, RW-5): alto una pagina esatta, viewability vuota
//     → zero preview connesse.
// I dati vivono in useLivesFeed (snapshot lives_feed = verità, delta inbox =
// patch realtime) + useLivesStrip (terminate <24h): striscia e feed si
// aggiornano senza refresh. Feed vuoto = stato ONESTO con CTA ad avviare una
// live (mai riempitivi, §1) — con la striscia sopra, se esistono terminate.
//
// ⚠️ Importa (via LiveFeedPage) i moduli nativi LiveKit: home.tsx lo carica
// LAZY dietro il guard Expo Go (pattern /live/[id], §12.16).

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
  type ViewToken,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/components/ui/Button';
import { VistaStato } from '@/components/ui/VistaStato';
import { FineFeedLive } from '@/components/live/FineFeedLive';
import { LiveFeedPage } from '@/components/live/LiveFeedPage';
import { LiveStrip } from '@/components/live/LiveStrip';
import { useLivesFeed } from '@/hooks/useLivesFeed';
import { useLivesStrip } from '@/hooks/useLivesStrip';
import { liveErrorMessage } from '@/lib/errors';
import { prewarmLiveDetail } from '@/lib/live';
import { statoSchermo } from '@/lib/query-ui';
import { useOnline } from '@/lib/rete';
import { ROUTES, dynamicRoutes } from '@/constants/routes';
import { livesOrdinate, useLiveStore, type LiveAmico } from '@/store/liveStore';
import { colors, fontFamily, fontSize, spacing } from '@/constants/theme';

// Dimensione della prima pagina server (lives_feed keyset, default p_limit):
// la STRISCIA resta sulla sola prima pagina anche dopo i load-more (P8).
const PRIMA_PAGINA = 10;

export default function LiveFeed() {
  const { query, appActive, caricaAltre } = useLivesFeed();
  // Seconda metà della striscia (M15/LR6): le terminate <24h, già filtrate sul
  // clock calibrato e dedupate (host con live attiva → vince l'attiva).
  const { terminate, clockOffsetMs } = useLivesStrip();
  const online = useOnline();

  // L'ordine è del server (M15/RW-2: Best Friends del viewer primi, poi
  // viewer_count desc, a pagine keyset); i delta prependono le novità, lo
  // snapshot riconcilia e resetta le pagine.
  const lives = useLiveStore((s) => s.lives);
  const ordine = useLiveStore((s) => s.ordine);
  const hasMore = useLiveStore((s) => s.hasMore);
  const items = useMemo(() => livesOrdinate({ lives, ordine }), [lives, ordine]);
  const itemsStriscia = useMemo(() => items.slice(0, PRIMA_PAGINA), [items]);

  // Home a fuoco? Aprendo /live/[id] (o un altro stack) questa superficie resta
  // montata sotto: il blur DEVE staccare la preview (budget R-3, §12.15).
  const [inFocus, setInFocus] = useState(true);
  const { refetch } = query;
  useFocusEffect(
    useCallback(() => {
      setInFocus(true);
      void refetch(); // al ritorno le live finite spariscono subito
      return () => setInFocus(false);
    }, [refetch]),
  );

  // Altezza reale del pager (misurata): ogni pagina è esattamente uno schermo.
  const [altezza, setAltezza] = useState(0);
  const [visibileId, setVisibileId] = useState<string | null>(null);

  // Coppia viewability STABILE (requisito FlatList): con pagingEnabled e soglia
  // 60% al massimo UNA pagina è "viewable" → una sola connessione per volta.
  const coppieViewability = useRef([
    {
      viewabilityConfig: { itemVisiblePercentThreshold: 60 },
      onViewableItemsChanged: ({ viewableItems }: { viewableItems: ViewToken[] }) => {
        const primo = viewableItems.find((v) => v.isViewable);
        setVisibileId(primo ? (primo.item as LiveAmico).liveId : null);
      },
    },
  ]).current;

  const apri = useCallback((liveId: string) => {
    // H2 (P11): il dettaglio si scalda in parallelo alla navigazione.
    prewarmLiveDetail(liveId);
    router.push(dynamicRoutes.live(liveId));
  }, []);

  const pronto = inFocus && appActive;
  const renderItem = useCallback(
    ({ item }: { item: LiveAmico }) => (
      <LiveFeedPage
        live={item}
        altezza={altezza}
        attiva={pronto && visibileId === item.liveId}
        onApri={apri}
      />
    ),
    [altezza, pronto, visibileId, apri],
  );

  // --- Stati di ingresso -------------------------------------------------------

  // Al remount con cache calda lo store viene idratato in un effect: per un
  // frame items è vuoto ma la query ha live → spinner, MAI il vuoto sbagliato.
  // L'idratazione vive DENTRO lo stato 'dati' (la query ha già i dati).
  const stato = statoSchermo(query, online);
  const inIdratazione = items.length === 0 && (query.data?.lives.length ?? 0) > 0;
  if (stato === 'caricamento' || inIdratazione) {
    return (
      <View style={styles.centrato}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }
  if (stato === 'offline' || stato === 'errore') {
    return (
      <VistaStato stato={stato} messaggio={liveErrorMessage(query.error)} onRetry={() => void refetch()} />
    );
  }
  if (items.length === 0) {
    const vuoto = (
      <View style={styles.centrato}>
        <Ionicons name="videocam-outline" size={44} color={colors.faint} />
        <Text style={styles.vuotoTitolo}>Nessun amico è in live ora</Text>
        <Text style={styles.vuotoSub}>
          Quando un amico apre una diretta la vedi qui, in tempo reale. Niente riempitivi: se non
          c’è nessuno, non c’è nessuno.
        </Text>
        <Button label="Avvia una live" onPress={() => router.push(ROUTES.liveNuovo)} />
      </View>
    );
    // 0 attive ma N terminate (LR6): il vuoto full-screen NASCONDEREBBE la
    // striscia — la striscia sta sopra, lo stato onesto (invariato) sotto.
    if (terminate.length === 0) return vuoto;
    return (
      <View style={styles.flex}>
        <LiveStrip lives={[]} terminate={terminate} clockOffsetMs={clockOffsetMs} onApri={apri} />
        {vuoto}
      </View>
    );
  }

  // --- Striscia + pager ---------------------------------------------------------

  return (
    <View style={styles.flex}>
      <LiveStrip
        lives={itemsStriscia}
        terminate={terminate}
        clockOffsetMs={clockOffsetMs}
        onApri={apri}
      />
      <View style={styles.flex} onLayout={(e) => setAltezza(e.nativeEvent.layout.height)}>
        {altezza > 0 ? (
          <FlatList
            data={items}
            keyExtractor={(l) => l.liveId}
            renderItem={renderItem}
            pagingEnabled
            showsVerticalScrollIndicator={false}
            // M14R2/F2: su Android il clipping della VirtualizedList stacca le
            // subview native fuori viewport — con una SurfaceView (la preview
            // video) il distacco rompe il compositing. Le pagine restano
            // comunque poche (windowSize=3) e UNA sola è connessa (R-3).
            removeClippedSubviews={false}
            getItemLayout={(_, index) => ({ length: altezza, offset: altezza * index, index })}
            viewabilityConfigCallbackPairs={coppieViewability}
            // Una live nuova che arriva via delta viene PREPESA: mantieni ferma
            // la pagina che si sta guardando (niente scatto né riconnessione).
            maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
            // Pagine pesanti (video): finestre minime, si monta poco oltre lo schermo.
            initialNumToRender={1}
            maxToRenderPerBatch={2}
            windowSize={3}
            // P8: load-more keyset a fine lista (append nello store, dedup incluso).
            onEndReached={caricaAltre}
            onEndReachedThreshold={0.5}
            // LR7 (RW-5): finite le pagine, l'ultima è il segno di fine — alto
            // ESATTAMENTE una pagina: il paging snappa e su quella pagina la
            // viewability è vuota → visibileId null → zero preview connesse
            // (budget R-3 gratis). Con has_more il footer non esiste e il
            // load-more continua. items.length > 0 è garantito dal ramo.
            ListFooterComponent={!hasMore ? <FineFeedLive altezza={altezza} /> : null}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centrato: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingBottom: 90, // otticamente centrato sopra la bottom bar floating
  },
  vuotoTitolo: {
    color: colors.ink,
    fontSize: fontSize.lg,
    fontFamily: fontFamily.semibold,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  vuotoSub: {
    color: colors.muted,
    fontSize: fontSize.sm,
    fontFamily: fontFamily.sans,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.md,
  },
});
