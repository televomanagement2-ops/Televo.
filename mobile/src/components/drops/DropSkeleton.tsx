// =============================================================================
// DropSkeleton — scheletro di caricamento del feed drops (stato loading, §12).
// Forma soltanto (niente query): header finto + un blocco corpo. Riprende il
// linguaggio di FeedSkeleton ma con le proporzioni della DropCard.
// =============================================================================

import { StyleSheet, View } from 'react-native';
import { colors, radius, spacing } from '@/constants/theme';

function Card() {
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={styles.avatar} />
        <View style={styles.headText}>
          <View style={[styles.line, styles.lineShort]} />
          <View style={[styles.line, styles.lineTiny]} />
        </View>
      </View>
      <View style={styles.block} />
      <View style={styles.footer}>
        <View style={styles.dot} />
        <View style={styles.dot} />
        <View style={styles.dot} />
      </View>
    </View>
  );
}

export function DropSkeleton({ count = 3 }: { count?: number }) {
  return (
    <View style={styles.list}>
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} />
      ))}
    </View>
  );
}

const BLOCK = colors.elevated;

const styles = StyleSheet.create({
  list: { gap: spacing.lg, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    padding: spacing.md,
    gap: spacing.md,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  avatar: { width: 40, height: 40, borderRadius: radius.full, backgroundColor: BLOCK },
  headText: { flex: 1, gap: 6 },
  line: { height: 10, borderRadius: 4, backgroundColor: BLOCK },
  lineShort: { width: '40%' },
  lineTiny: { width: '20%', height: 8 },
  block: { width: '100%', aspectRatio: 4 / 5, borderRadius: radius.lg, backgroundColor: BLOCK },
  footer: { flexDirection: 'row', gap: spacing.lg },
  dot: { width: 22, height: 22, borderRadius: radius.full, backgroundColor: BLOCK },
});
