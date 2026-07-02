// =============================================================================
// Home — l'hub dell'app. Header (avatar→profilo · logo · ricerca) + barra
// categorie + corpo del feed che cambia in base alla categoria selezionata.
// =============================================================================
// "Discover" (default) = il mix di TUTTO: drop, live, mappa, aura, sport. Per ora
// i contenuti sono SEGNAPOSTO (card grandi con media grigio, dati statici in
// constants/feedItems.ts) — i dati reali si collegano nei round successivi. Le
// altre categorie (Live/Map/Aura backend reale; Sport senza backend) mostrano
// "Prossimamente" finché non vengono collegate. NB: niente "Reels" (rimosso).

import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HomeHeader } from '@/components/navigation/HomeHeader';
import { CategoryBar } from '@/components/feed/CategoryBar';
import { FeedCard } from '@/components/feed/FeedCard';
import { FeedLiveCard } from '@/components/feed/FeedLiveCard';
import { ComingSoon } from '@/components/feed/ComingSoon';
import { FEED_ITEMS } from '@/constants/feedItems';
import { DEFAULT_FEED_CATEGORY, type FeedCategoryKey } from '@/constants/feed';
import { colors, spacing } from '@/constants/theme';

export default function Home() {
  const [category, setCategory] = useState<FeedCategoryKey>(DEFAULT_FEED_CATEGORY);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <HomeHeader />
      <CategoryBar selected={category} onSelect={setCategory} />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <FeedBody category={category} />
      </ScrollView>
    </SafeAreaView>
  );
}

/** Corpo del feed in base alla categoria. Ogni ramo ritorna un View con bounds
 *  reali (NIENTE Fragment: con gap + ScrollView crea un buco di layout). */
function FeedBody({ category }: { category: FeedCategoryKey }) {
  switch (category) {
    case 'discover':
      // Mix di tutto: card placeholder differenziate per tipo + la card LIVE.
      return (
        <View style={styles.feed}>
          {FEED_ITEMS.map((item) => (
            <FeedCard key={item.id} item={item} />
          ))}
          <FeedLiveCard />
        </View>
      );
    case 'drops':
      return (
        <ComingSoon
          icon="flash-outline"
          title="I Drop arrivano presto"
          subtitle="Momenti effimeri che durano 24h. Niente vetrine, solo l'istante: quello che c'è ora e poi svanisce."
        />
      );
    case 'live':
      return (
        <ComingSoon
          icon="radio-outline"
          title="Stanze Live in arrivo"
          subtitle="Qui vedrai chi è live ora. La voce, in tempo reale: la prova che dietro c'è una persona vera."
        />
      );
    case 'map':
      return (
        <ComingSoon
          icon="map-outline"
          title="La Mappa Vibe arriva presto"
          subtitle="Scoprirai dove sono i tuoi amici e le stanze live vicine. Sempre approssimativa, solo tra amici, sempre opt-in."
        />
      );
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
