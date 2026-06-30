// =============================================================================
// Card — superficie base scura per i contenuti del feed e delle liste. Sobria:
// sfondo elevato, bordo sottile, angoli arrotondati. Opzionalmente pressabile.
// =============================================================================

import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { colors, radius, spacing } from '@/constants/theme';

interface Props {
  children: ReactNode;
  /** Se presente, la card diventa pressabile (con feedback). */
  onPress?: () => void;
  style?: ViewStyle;
}

export function Card({ children, onPress, style }: Props) {
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.card, pressed && styles.pressed, style]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  pressed: { opacity: 0.85 },
});
