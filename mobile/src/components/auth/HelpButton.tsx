// =============================================================================
// HelpButton — pulsante "Aiuto" senza contorno. Per ora porta alla pagina di
// aiuto (non ancora costruita): mostra un placeholder gentile, niente crash.
// =============================================================================

import { Alert, Pressable, StyleSheet, Text } from 'react-native';
import { colors, fontFamily, fontSize, spacing } from '@/constants/theme';

interface Props {
  /** Etichetta personalizzabile (default "Aiuto"). */
  label?: string;
}

export function HelpButton({ label = 'Aiuto' }: Props) {
  const onPress = () => {
    // TODO: navigare alla pagina di aiuto quando esisterà.
    Alert.alert('Aiuto', 'La sezione di aiuto arriverà a breve.');
  };

  return (
    <Pressable onPress={onPress} hitSlop={10} style={styles.btn}>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  label: { color: colors.muted, fontSize: fontSize.sm, fontFamily: fontFamily.medium },
});
