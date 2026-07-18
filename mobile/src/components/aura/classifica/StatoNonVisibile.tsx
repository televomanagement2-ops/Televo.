// =============================================================================
// StatoNonVisibile — lo stato «Sei fuori dalla classifica» (M16 / AC3, §5).
// =============================================================================
// Mostrato quando il CHIAMANTE si è nascosto (envelope corto `listed:false`,
// cancello server-side §2.3): non è un errore, è uno stato di prodotto — con
// il copy della reciprocità e la CTA di rientro (flip del flag + refetch).

import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/components/ui/Button';
import { colors, fontFamily, fontSize, spacing } from '@/constants/theme';

interface Props {
  onRientra: () => void;
  inCorso: boolean;
}

export function StatoNonVisibile({ onRientra, inCorso }: Props) {
  return (
    <View style={styles.wrap}>
      <Ionicons name="eye-off-outline" size={44} color={colors.muted} />
      <Text style={styles.titolo}>Sei fuori dalla classifica</Text>
      <Text style={styles.testo}>
        Hai scelto di non apparire: non sei nella classifica dei tuoi amici e non vedi la loro.
      </Text>
      <View style={styles.cta}>
        <Button label="Rientra in classifica" onPress={onRientra} loading={inCorso} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  titolo: { color: colors.ink, fontSize: fontSize.lg, fontFamily: fontFamily.semibold },
  testo: {
    color: colors.muted,
    fontSize: fontSize.sm,
    fontFamily: fontFamily.sans,
    textAlign: 'center',
    lineHeight: 20,
  },
  cta: { marginTop: spacing.md, alignSelf: 'stretch' },
});
