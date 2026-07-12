// =============================================================================
// Home — l'hub dell'app. Header (avatar→profilo · logo · ricerca) + barra
// categorie + corpo del feed che cambia in base alla categoria selezionata.
// =============================================================================
// "Discover" (default) = il mix di TUTTO: drop, live, mappa, aura, sport. Per ora
// i contenuti sono SEGNAPOSTO (card grandi con media grigio, dati statici in
// constants/feedItems.ts) — i dati reali si collegano nei round successivi.
// Drops (M6), Map (M7) e Live (M12) sono REALI; Aura e Sport mostrano
// "Prossimamente" finché non vengono collegate. NB: niente "Reels" (rimosso).

import { Suspense, lazy, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HomeHeader } from '@/components/navigation/HomeHeader';
import { CategoryBar } from '@/components/feed/CategoryBar';
import { FeedCard } from '@/components/feed/FeedCard';
import { ComingSoon } from '@/components/feed/ComingSoon';
import { DropFeed } from '@/components/drops/DropFeed';
import { MapCanvas } from '@/components/mappa/MapCanvas';
import { PannelloDevBuild } from '@/components/live/PannelloDevBuild';
import { dopoBootstrapLiveKit, liveKitDisponibile } from '@/lib/livekit';
import { FEED_ITEMS } from '@/constants/feedItems';
import { DEFAULT_FEED_CATEGORY, type FeedCategoryKey } from '@/constants/feed';
import { colors, spacing } from '@/constants/theme';

// Il feed live importa i moduli nativi LiveKit: caricato PIGRAMENTE dietro il
// guard Expo Go (pattern /live/[id], §12.16) — in Expo Go non viene mai
// valutato — e SOLO dopo il bootstrap (livekit-client tocca DOMException alla
// valutazione del modulo, vincolo 4 di lib/livekit.ts).
const LiveFeed = lazy(dopoBootstrapLiveKit(() => import('@/components/live/LiveFeed')));

export default function Home() {
  const [category, setCategory] = useState<FeedCategoryKey>(DEFAULT_FEED_CATEGORY);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <HomeHeader />
      <CategoryBar selected={category} onSelect={setCategory} />
      {/* Drops (S1), Map (M7) e Live (M12/LM7): resi a tutta altezza FUORI dalla
          ScrollView. Lista virtualizzata, pan/zoom della mappa e pager verticale
          delle live non convivono con uno scroll sullo stesso asse. */}
      {category === 'drops' ? (
        <DropFeed />
      ) : category === 'map' ? (
        <MapCanvas />
      ) : category === 'live' ? (
        liveKitDisponibile ? (
          <Suspense fallback={<View style={styles.flex} />}>
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
      // Resi a tutta altezza fuori dalla ScrollView (vedi sopra): qui no-op.
      return null;
    case 'aura':
      return (
        <ComingSoon
          icon="sparkles-outline"
          title="La tua Aura arriva presto"
          subtitle="La reputazione viva: gentilezza, umorismo, presenza. Non follower, non like."
        />
      );
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
