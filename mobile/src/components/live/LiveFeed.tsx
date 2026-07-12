// =============================================================================
// LiveFeed — la categoria Live della Home: striscia + feed verticale (M12 / LM7).
// =============================================================================
// Superficie FULL-HEIGHT montata dal ramo `live` di home.tsx (pattern
// DropFeed/MapCanvas: fuori dalla ScrollView, il pager verticale non convive
// con uno scroll sullo stesso asse). live.md §7:
//  A. striscia orizzontale in alto (LiveStrip): tap → apre la live;
//  B. feed verticale pagingEnabled stile TikTok: una live a schermo per volta
//     come preview video reale — la VIEWABILITY decide l'UNICA pagina `attiva`
//     (LiveFeedPage si connette solo allora, budget R-3) e il gate vale solo
//     con Home a fuoco e app in foreground (blur/background = disconnessione).
// I dati vivono in useLivesFeed (snapshot lives_feed = verità, delta inbox =
// patch realtime): striscia e feed si aggiornano senza refresh. Feed vuoto =
// stato ONESTO con CTA ad avviare una live (mai riempitivi, §1).
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
import { StatoErrore } from '@/components/ui/StatoErrore';
import { LiveFeedPage } from '@/components/live/LiveFeedPage';
import { LiveStrip } from '@/components/live/LiveStrip';
import { useLivesFeed } from '@/hooks/useLivesFeed';
import { liveErrorMessage } from '@/lib/errors';
import { ROUTES, dynamicRoutes } from '@/constants/routes';
import { livesOrdinate, useLiveStore, type LiveAmico } from '@/store/liveStore';
import { colors, fontFamily, fontSize, spacing } from '@/constants/theme';

export default function LiveFeed() {
  const { query, appActive } = useLivesFeed();

  // L'ordine è del server (Top Friends → spettatori reali → Aura host, §7B);
  // i delta prependono le novità, lo snapshot riconcilia.
  const lives = useLiveStore((s) => s.lives);
  const ordine = useLiveStore((s) => s.ordine);
  const items = useMemo(() => livesOrdinate({ lives, ordine }), [lives, ordine]);

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
  const inIdratazione = items.length === 0 && (query.data?.lives.length ?? 0) > 0;
  if (query.isLoading || inIdratazione) {
    return (
      <View style={styles.centrato}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }
  if (query.isError) {
    return <StatoErrore messaggio={liveErrorMessage(query.error)} onRetry={() => void refetch()} />;
  }
  if (items.length === 0) {
    return (
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
  }

  // --- Striscia + pager ---------------------------------------------------------

  return (
    <View style={styles.flex}>
      <LiveStrip lives={items} onApri={apri} />
      <View style={styles.flex} onLayout={(e) => setAltezza(e.nativeEvent.layout.height)}>
        {altezza > 0 ? (
          <FlatList
            data={items}
            keyExtractor={(l) => l.liveId}
            renderItem={renderItem}
            pagingEnabled
            showsVerticalScrollIndicator={false}
            getItemLayout={(_, index) => ({ length: altezza, offset: altezza * index, index })}
            viewabilityConfigCallbackPairs={coppieViewability}
            // Una live nuova che arriva via delta viene PREPESA: mantieni ferma
            // la pagina che si sta guardando (niente scatto né riconnessione).
            maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
            // Pagine pesanti (video): finestre minime, si monta poco oltre lo schermo.
            initialNumToRender={1}
            maxToRenderPerBatch={2}
            windowSize={3}
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
