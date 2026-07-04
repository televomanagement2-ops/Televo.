// =============================================================================
// StatoErrore — stato di errore uniforme con Riprova (CM8, SRS §14).
// =============================================================================
// Estrae il pattern già usato nell'hub Messaggi: icona + testo muted + bottone
// "Riprova" secondario. Ogni schermata con una query di ingresso lo usa come
// ramo error (niente stati muti).

import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/components/ui/Button';
import { colors, fontFamily, fontSize, spacing } from '@/constants/theme';

interface Props {
  /** Messaggio mostrato (default generico). */
  messaggio?: string;
  onRetry: () => void;
}

export function StatoErrore({ messaggio = 'Qualcosa è andato storto.', onRetry }: Props) {
  return (
    <View style={styles.center}>
      <Ionicons name="cloud-offline-outline" size={40} color={colors.faint} />
      <Text style={styles.testo}>{messaggio}</Text>
      <Button label="Riprova" variant="secondary" onPress={onRetry} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  testo: {
    color: colors.muted,
    fontSize: fontSize.sm,
    fontFamily: fontFamily.sans,
    textAlign: 'center',
    lineHeight: 20,
  },
});
