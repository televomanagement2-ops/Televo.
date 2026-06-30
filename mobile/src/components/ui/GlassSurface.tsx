// =============================================================================
// Surface — superficie scura PIATTA (ex "glass"): nessun blur, nessun gradiente.
// Solo `surface` scuro + bordo `border` sottile. Base sobria per card e bottoni
// del flow di accesso, coerente col look "vero social" pulito.
// =============================================================================

import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius } from '@/constants/theme';

interface Props {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  borderRadius?: number;
}

export function GlassSurface({ children, style, borderRadius = radius['2xl'] }: Props) {
  return <View style={[styles.wrap, { borderRadius }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
});
