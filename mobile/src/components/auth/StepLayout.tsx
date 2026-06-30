// =============================================================================
// StepLayout — impalcatura comune di uno step del wizard: titolo grande
// (stile BeReal), sottotitolo, corpo (input) e footer (CTA) ancorato in basso.
// =============================================================================

import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fontFamily, fontSize, spacing } from '@/constants/theme';

interface Props {
  title: string;
  subtitle?: string;
  children?: ReactNode;
  footer: ReactNode;
}

export function StepLayout({ title, subtitle, children, footer }: Props) {
  return (
    <View style={styles.root}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {children ? <View style={styles.body}>{children}</View> : null}
      <View style={styles.spacer} />
      <View style={styles.footer}>{footer}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: spacing.xl },
  title: {
    color: colors.ink,
    fontSize: fontSize['3xl'],
    fontFamily: fontFamily.displayBold,
    letterSpacing: 0.2,
  },
  subtitle: {
    color: colors.muted,
    fontSize: fontSize.base,
    fontFamily: fontFamily.sans,
    marginTop: spacing.sm,
    lineHeight: 22,
  },
  body: { marginTop: spacing['2xl'] },
  spacer: { flex: 1, minHeight: spacing.xl },
  footer: { gap: spacing.sm, marginBottom: spacing.lg },
});
