// =============================================================================
// StreakBadge — piccola pill "🔥 N" per la streak di una conversazione.
// =============================================================================
// La streak conta i giorni consecutivi di attività (con freeze, reset senza
// penalità). Non è vanity-count: qui è solo un segnale gentile di continuità.

import { StyleSheet, Text, View } from 'react-native';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';

interface Props {
  count: number;
  /** compatta (lista chat) o normale (header chat). */
  compact?: boolean;
}

export function StreakBadge({ count, compact }: Props) {
  if (!count || count < 1) return null;
  return (
    <View style={[styles.badge, compact && styles.compact]}>
      <Text style={[styles.text, compact && styles.textCompact]}>🔥 {count}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.elevated,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  compact: { paddingHorizontal: 6, paddingVertical: 1 },
  text: { color: colors.warning, fontSize: fontSize.sm, fontFamily: fontFamily.semibold },
  textCompact: { fontSize: fontSize.xs },
});
