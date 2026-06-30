// =============================================================================
// Placeholder — schermata "Prossimamente". Usata dalle route già scaffoldate ma
// non ancora costruite in questo round (live, mappa, chat, ...), così la
// navigazione resta valida e l'app non mostra errori di route mancante.
// =============================================================================

import { StyleSheet, Text, View } from 'react-native';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { Wordmark } from '@/components/brand/Wordmark';
import { colors, fontFamily, fontSize, spacing } from '@/constants/theme';

export default function Placeholder() {
  return (
    <SafeScreen>
      <View style={styles.center}>
        <Wordmark size={fontSize.xl} />
        <Text style={styles.text}>Prossimamente</Text>
      </View>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  text: { color: colors.muted, fontSize: fontSize.base, fontFamily: fontFamily.sans },
});
