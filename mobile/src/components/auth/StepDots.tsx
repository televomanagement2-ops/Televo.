// =============================================================================
// StepDots — progresso minimale del wizard (niente anello: solo puntini). Il
// puntino corrente è una pillola blu; i completati sono blu pieni; i futuri
// sono tenui.
// =============================================================================

import { StyleSheet, View } from 'react-native';
import { colors, spacing } from '@/constants/theme';

interface Props {
  count: number;
  index: number;
}

export function StepDots({ count, index }: Props) {
  return (
    <View style={styles.row}>
      {Array.from({ length: count }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            i === index && styles.current,
            i < index && styles.done,
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.md,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  done: { backgroundColor: colors.accent },
  current: { width: 22, backgroundColor: colors.accent },
});
