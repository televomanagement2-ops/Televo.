// =============================================================================
// FeedSkeleton — card segnaposto per il feed "Discover" finché non colleghiamo i
// dati reali (drops + stanze live). Look "in arrivo": niente query, solo forma.
// =============================================================================

import { StyleSheet, View } from 'react-native';
import { Card } from '@/components/ui/Card';
import { colors, radius, spacing } from '@/constants/theme';

/** Una singola card scheletro (avatar finto + due righe di testo finte). */
function SkeletonCard() {
  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <View style={styles.avatar} />
        <View style={styles.headText}>
          <View style={[styles.line, styles.lineShort]} />
          <View style={[styles.line, styles.lineTiny]} />
        </View>
      </View>
      <View style={[styles.line, styles.lineFull]} />
      <View style={[styles.line, styles.lineWide]} />
    </Card>
  );
}

/** Lista di card scheletro. */
export function FeedSkeleton({ count = 4 }: { count?: number }) {
  return (
    <View style={styles.list}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </View>
  );
}

const BLOCK = colors.elevated;

const styles = StyleSheet.create({
  list: { gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  card: { gap: spacing.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: { width: 40, height: 40, borderRadius: radius.full, backgroundColor: BLOCK },
  headText: { flex: 1, gap: spacing.sm },
  line: { height: 12, borderRadius: radius.sm, backgroundColor: BLOCK },
  lineShort: { width: '45%' },
  lineTiny: { width: '25%', height: 10 },
  lineFull: { width: '100%' },
  lineWide: { width: '70%' },
});
