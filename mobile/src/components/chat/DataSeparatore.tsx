// =============================================================================
// DataSeparatore — pill centrata con l'etichetta del giorno ("Oggi"/"Ieri"/data).
// =============================================================================

import { StyleSheet, Text, View } from 'react-native';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';

export function DataSeparatore({ label }: { label: string }) {
  return (
    <View style={styles.wrap}>
      <View style={styles.pill}>
        <Text style={styles.text}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', marginVertical: spacing.md },
  pill: {
    backgroundColor: colors.elevated,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  text: { color: colors.muted, fontSize: fontSize.xs, fontFamily: fontFamily.medium },
});
