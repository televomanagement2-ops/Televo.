// =============================================================================
// FeedPaginationDots — i puntini di paginazione sotto il media (carosello). Il
// primo è attivo (viola), gli altri spenti. Statici in v1: niente carosello vero
// ancora, è solo l'indicatore visivo del layout.
// =============================================================================

import { StyleSheet, View } from 'react-native';
import { colors, radius, spacing } from '@/constants/theme';

export function FeedPaginationDots({ count }: { count: number }) {
  if (count <= 1) return null;

  return (
    <View style={styles.row}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={[styles.dot, i === 0 ? styles.active : styles.inactive]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xs },
  dot: { height: 4, borderRadius: radius.full },
  active: { width: 18, backgroundColor: colors.accent },
  inactive: { width: 18, backgroundColor: colors.border },
});
