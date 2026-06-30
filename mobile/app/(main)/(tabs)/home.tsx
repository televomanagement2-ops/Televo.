// =============================================================================
// Home — l'hub dell'app. Header (avatar→profilo · "televo" · ricerca) + barra
// categorie + corpo del feed che cambia in base alla categoria selezionata.
// =============================================================================
// "Discover" (default) = mix di tutto: per ora SCHELETRO visivo (i dati reali —
// drops + stanze live — si collegano nei round successivi). Reels/Sport non
// hanno backend: stato "Prossimamente". Live/Map/Aura avranno dati reali (M3/M4/
// M7): per ora segnaposto coerente. L'importante è che il frame sia navigabile.

import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HomeHeader } from '@/components/navigation/HomeHeader';
import { CategoryBar } from '@/components/feed/CategoryBar';
import { FeedSkeleton } from '@/components/feed/FeedSkeleton';
import { ComingSoon } from '@/components/feed/ComingSoon';
import { DEFAULT_FEED_CATEGORY, type FeedCategoryKey } from '@/constants/feed';
import { colors } from '@/constants/theme';

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

/** Corpo del feed in base alla categoria. Tutto placeholder in questo round. */
function FeedBody({ category }: { category: FeedCategoryKey }) {
  switch (category) {
    case 'discover':
      // Mix di tutto: scheletro finché non colleghiamo drops + stanze live.
      return <FeedSkeleton count={5} />;
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
    case 'reels':
      return (
        <ComingSoon
          icon="film-outline"
          title="Reels"
          subtitle="Prossimamente."
        />
      );
    case 'sport':
      return (
        <ComingSoon
          icon="football-outline"
          title="Sport"
          subtitle="Prossimamente."
        />
      );
    default:
      return <View />;
  }
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.base },
  flex: { flex: 1 },
  content: { paddingBottom: 24, flexGrow: 1 },
});
