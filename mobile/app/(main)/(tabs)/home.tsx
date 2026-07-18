// =============================================================================
// Home — l'hub dell'app. Header (avatar→profilo · logo · ricerca) + barra
// categorie + corpo del feed che cambia in base alla categoria selezionata.
// =============================================================================
// "Discover" (default) = il mix di TUTTO: drop, live, mappa, aura, sport. Per ora
// i contenuti sono SEGNAPOSTO (card grandi con media grigio, dati statici in
// constants/feedItems.ts) — i dati reali si collegano nei round successivi.
// Drops (M6), Map (M7), Live (M12) e Aura (M16: Classifica Aura solo-amici)
// sono REALI; Sport mostra "Prossimamente". NB: niente "Reels" (rimosso).

import { Suspense, lazy, useEffect, useState } from 'react';
import { InteractionManager, ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HomeHeader } from '@/components/navigation/HomeHeader';
import { CategoryBar } from '@/components/feed/CategoryBar';
import { FeedCard } from '@/components/feed/FeedCard';
import { ComingSoon } from '@/components/feed/ComingSoon';
import { DropFeed } from '@/components/drops/DropFeed';
import { MapCanvas } from '@/components/mappa/MapCanvas';
import { ClassificaAura } from '@/components/aura/classifica/ClassificaAura';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { PannelloDevBuild } from '@/components/live/PannelloDevBuild';
import { dopoBootstrapLiveKit, liveKitDisponibile } from '@/lib/livekit';
import { FEED_ITEMS } from '@/constants/feedItems';
import { DEFAULT_FEED_CATEGORY, isFeedCategoryKey, type FeedCategoryKey } from '@/constants/feed';
import { colors, spacing } from '@/constants/theme';

// Il feed live importa i moduli nativi LiveKit: caricato PIGRAMENTE dietro il
// guard Expo Go (pattern /live/[id], §12.16) — in Expo Go non viene mai
// valutato — e SOLO dopo il bootstrap (livekit-client tocca DOMException alla
// valutazione del modulo, vincolo 4 di lib/livekit.ts).
const LiveFeed = lazy(dopoBootstrapLiveKit(() => import('@/components/live/LiveFeed')));

export default function Home() {
  const [category, setCategory] = useState<FeedCategoryKey>(DEFAULT_FEED_CATEGORY);
  const { categoria } = useLocalSearchParams<{ categoria?: string }>();

  // M16 (AC5): deep link `?categoria=` (notifiche aura_podio/sorpasso/recap →
  // tab Aura). Il param è validato contro FeedCategoryKey e CONSUMATO subito
  // (setParams lo rimuove dalla route): così un re-focus del tab non
  // "riscatta" la categoria, e un secondo tap sulla stessa notifica torna a
  // far cambiare il valore (undefined → 'aura') ri-innescando l'effect.
  useEffect(() => {
    if (typeof categoria !== 'string' || categoria.length === 0) return;
    if (isFeedCategoryKey(categoria)) setCategory(categoria);
    router.setParams({ categoria: undefined });
  }, [categoria]);

  // H3 (M13/P11): pre-warm di bootstrap LiveKit + chunk del feed live DOPO il
  // primo frame della Home (runAfterInteractions: mai in competizione col
  // rendering di atterraggio). Il primo ingresso in Live/schermo live salta
  // così il tratto "nero" chunk+bootstrap. L'ordine resta quello del vincolo 4
  // di lib/livekit.ts: prima il polyfill, poi la valutazione del chunk.
  useEffect(() => {
    if (!liveKitDisponibile) return;
    const task = InteractionManager.runAfterInteractions(() => {
      void dopoBootstrapLiveKit(() => import('@/components/live/LiveFeed'))().catch(() => {});
    });
    return () => task.cancel();
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <HomeHeader />
      <CategoryBar selected={category} onSelect={setCategory} />
      {/* Drops (S1), Map (M7), Live (M12/LM7) e Aura (M16/AC3): resi a tutta
          altezza FUORI dalla ScrollView. Lista virtualizzata, pan/zoom della
          mappa e pager verticale delle live non convivono con uno scroll sullo
          stesso asse. */}
      {category === 'drops' ? (
        <DropFeed />
      ) : category === 'map' ? (
        <MapCanvas />
      ) : category === 'aura' ? (
        <ClassificaAura />
      ) : category === 'live' ? (
        liveKitDisponibile ? (
          // Fallback = spinner (P11): mai un buco nero mentre arriva il chunk.
          <Suspense fallback={<LoadingSpinner style={styles.flex} />}>
            <LiveFeed />
          </Suspense>
        ) : (
          <PannelloDevBuild />
        )
      ) : (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <FeedBody category={category} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

/** Corpo del feed in base alla categoria. Ogni ramo ritorna un View con bounds
 *  reali (NIENTE Fragment: con gap + ScrollView crea un buco di layout). */
function FeedBody({ category }: { category: FeedCategoryKey }) {
  switch (category) {
    case 'discover':
      // Mix di tutto: card placeholder differenziate per tipo.
      return (
        <View style={styles.feed}>
          {FEED_ITEMS.map((item) => (
            <FeedCard key={item.id} item={item} />
          ))}
        </View>
      );
    case 'drops':
    case 'map':
    case 'live':
    case 'aura':
      // Resi a tutta altezza fuori dalla ScrollView (vedi sopra): qui no-op.
      return null;
    case 'sport':
      return <ComingSoon icon="football-outline" title="Sport" subtitle="Prossimamente." />;
  }
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.base },
  flex: { flex: 1 },
  // Niente flexGrow/gap qui: il gap vive sul View interno (vedi `feed`). Il
  // paddingBottom ampio tiene l'ultima card sopra la bottom bar floating.
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: 110 },
  feed: { gap: spacing.lg },
});
