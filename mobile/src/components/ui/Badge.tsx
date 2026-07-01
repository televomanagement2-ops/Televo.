// =============================================================================
// Badge — un traguardo (achievement) in forma di tessera quadrata.
// =============================================================================
// Sbloccato: icona a colori + nome nitido. Bloccato: tutto smorzato (grigio,
// opacità ridotta) per dare il senso del "da conquistare" senza pressione. Usato
// nella griglia achievement del profilo.

import { StyleSheet, Text, View } from 'react-native';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';

interface Props {
  icon: string; // emoji dal catalogo achievements
  name: string;
  unlocked: boolean;
}

export function Badge({ icon, name, unlocked }: Props) {
  return (
    <View style={[styles.tile, !unlocked && styles.tileLocked]}>
      <Text style={[styles.icon, !unlocked && styles.iconLocked]}>{unlocked ? icon : '🔒'}</Text>
      <Text style={[styles.name, !unlocked && styles.nameLocked]} numberOfLines={2}>
        {name}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: 96,
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  tileLocked: { opacity: 0.5 },
  icon: { fontSize: 28 },
  iconLocked: { fontSize: 24 },
  name: {
    color: colors.ink,
    fontFamily: fontFamily.medium,
    fontSize: fontSize.xs,
    textAlign: 'center',
  },
  nameLocked: { color: colors.muted },
});
