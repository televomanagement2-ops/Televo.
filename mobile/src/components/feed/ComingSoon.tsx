// =============================================================================
// ComingSoon — stato "Prossimamente" INLINE per il corpo del feed (non una
// schermata intera, a differenza di ui/Placeholder). Usato per le categorie
// senza contenuto ancora collegato (sport) o non ancora costruite (live/map/aura).
// =============================================================================

import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontFamily, fontSize, spacing } from '@/constants/theme';

interface Props {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
}

export function ComingSoon({ icon = 'sparkles-outline', title, subtitle }: Props) {
  return (
    <View style={styles.wrap}>
      <Ionicons name={icon} size={40} color={colors.faint} />
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing['4xl'],
    gap: spacing.sm,
  },
  title: {
    color: colors.ink,
    fontSize: fontSize.lg,
    fontFamily: fontFamily.semibold,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  subtitle: {
    color: colors.muted,
    fontSize: fontSize.sm,
    fontFamily: fontFamily.sans,
    textAlign: 'center',
    lineHeight: 20,
  },
});
