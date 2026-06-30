// =============================================================================
// SafeScreen — contenitore base delle schermate: safe area + sfondo dark +
// gestione tastiera. Tiene fuori il "rumore": padding coerente, niente sorprese.
// =============================================================================

import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { colors, spacing } from '@/constants/theme';

interface Props {
  children: ReactNode;
  /** Se true, il contenuto è scrollabile (utile con la tastiera aperta). */
  scroll?: boolean;
  /** Padding orizzontale di default (lg). Disattivabile per schermate full-bleed. */
  padded?: boolean;
  edges?: readonly Edge[];
  contentStyle?: ViewStyle;
}

export function SafeScreen({
  children,
  scroll = false,
  padded = true,
  edges = ['top', 'bottom'],
  contentStyle,
}: Props) {
  const inner = (
    <View style={[styles.inner, padded && styles.padded, contentStyle]}>{children}</View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={edges}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {scroll ? (
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {inner}
          </ScrollView>
        ) : (
          inner
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.base },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  inner: { flex: 1 },
  padded: { paddingHorizontal: spacing.xl },
});
