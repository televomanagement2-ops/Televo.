// =============================================================================
// AuthHeader — header persistente delle schermate di accesso/onboarding: il
// marchio (BrandLockup) in alto al centro, un eventuale "indietro" a sinistra e
// il pulsante "Aiuto" nell'angolo in alto a destra.
// =============================================================================

import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BrandLockup } from '@/components/brand/BrandLockup';
import { HelpButton } from './HelpButton';
import { colors, fontSize, spacing } from '@/constants/theme';

interface Props {
  onBack?: () => void;
  /** Mostra "Aiuto" in alto a destra (default true). */
  showHelp?: boolean;
}

export function AuthHeader({ onBack, showHelp = true }: Props) {
  return (
    <View style={styles.row}>
      <View style={styles.side}>
        {onBack ? (
          <Pressable onPress={onBack} hitSlop={12}>
            <Ionicons name="chevron-back" size={24} color={colors.ink} />
          </Pressable>
        ) : null}
      </View>

      <BrandLockup size={fontSize.xl} />

      <View style={[styles.side, styles.right]}>{showHelp ? <HelpButton /> : null}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.sm,
    height: 48,
  },
  side: { width: 64, justifyContent: 'center' },
  right: { alignItems: 'flex-end' },
});
