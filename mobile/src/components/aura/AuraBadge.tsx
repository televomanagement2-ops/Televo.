// =============================================================================
// AuraBadge — il badge ESCLUSIVO di livello Aura raggiunto.
// =============================================================================
// È il riconoscimento del livello (Aura 100 / 250 / 500): un solo badge, il più
// alto sbloccato. In evidenza nel profilo come segno di status sano (traguardo di
// presenza, non di popolarità). Se nessun livello è ancora sbloccato → invito a
// salire. Riceve l'achievement già risolto (highestAuraBadge) via prop.

import { StyleSheet, Text, View } from 'react-native';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';
import type { AchievementView } from '@/hooks/useAchievement';

interface Props {
  /** il badge di livello più alto sbloccato, o null se nessuno */
  badge: AchievementView | null;
  /** colore del tratto dominante per l'accento del bordo */
  color?: string;
}

export function AuraBadge({ badge, color = colors.accent }: Props) {
  if (!badge) {
    return (
      <View style={styles.tile}>
        <Text style={styles.lockedIcon}>✨</Text>
        <View style={styles.body}>
          <Text style={styles.title}>Nessun livello Aura ancora</Text>
          <Text style={styles.subtitle}>Raggiungi 100 di Aura per il primo badge esclusivo.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.tile, { borderColor: color }]}>
      <Text style={styles.icon}>{badge.icon}</Text>
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{badge.name}</Text>
          <View style={[styles.pill, { backgroundColor: color }]}>
            <Text style={styles.pillText}>esclusivo</Text>
          </View>
        </View>
        <Text style={styles.subtitle}>{badge.description}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  icon: { fontSize: 34 },
  lockedIcon: { fontSize: 28, opacity: 0.6 },
  body: { flex: 1, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { color: colors.ink, fontFamily: fontFamily.semibold, fontSize: fontSize.base },
  subtitle: { color: colors.muted, fontFamily: fontFamily.sans, fontSize: fontSize.sm, lineHeight: 18 },
  pill: { borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  pillText: {
    color: colors.base,
    fontFamily: fontFamily.semibold,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
