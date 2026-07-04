// =============================================================================
// BottomSheet — foglio dark ancorato in basso (CM6.5).
// =============================================================================
// Presentazionale puro: backdrop che chiude al tap + card scura ancorata in
// basso. Stili identici a MenuMessaggio (che resta autonomo per i suoi step
// interni): stessa gerarchia visiva per TUTTI i menu dell'app. Va montato
// dentro un <Modal transparent> (ci pensa DialogHost); il contenuto lo passa
// il chiamante come children.

import type { ReactNode } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing } from '@/constants/theme';

interface Props {
  onClose: () => void;
  children: ReactNode;
}

export function BottomSheet({ onClose, children }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <Pressable style={styles.backdrop} onPress={onClose}>
      {/* Pressable interno: il tap sul contenuto NON chiude. */}
      <Pressable
        style={[styles.card, { paddingBottom: Math.max(spacing.xl, insets.bottom + spacing.md) }]}
        onPress={() => {}}
      >
        {children}
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.sm,
    maxHeight: '75%',
  },
});
