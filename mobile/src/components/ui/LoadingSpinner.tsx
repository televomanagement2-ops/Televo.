// =============================================================================
// LoadingSpinner — spinner centrato riusabile, con etichetta opzionale.
// =============================================================================

import { ActivityIndicator, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { colors, fontFamily, fontSize, spacing } from '@/constants/theme';

interface Props {
  label?: string;
  style?: ViewStyle;
}

export function LoadingSpinner({ label, style }: Props) {
  return (
    <View style={[styles.box, style]}>
      <ActivityIndicator color={colors.muted} />
      {label ? <Text style={styles.label}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  label: { color: colors.muted, fontSize: fontSize.sm, fontFamily: fontFamily.sans },
});
