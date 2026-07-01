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
  /** Pressione lunga (es. menu contestuale). Rende la card pressabile anche da sola. */
  onLongPress?: () => void;
  style?: ViewStyle;
}

export function Card({ children, onPress, onLongPress, style }: Props) {
  if (onPress || onLongPress) {
    return (
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
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
