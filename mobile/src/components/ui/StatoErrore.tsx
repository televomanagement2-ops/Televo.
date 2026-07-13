// =============================================================================
// StatoErrore — stato di errore/offline uniforme con Riprova (CM8, SRS §14).
// =============================================================================
// Estrae il pattern già usato nell'hub Messaggi: icona + testo muted + bottone
// "Riprova" secondario. Ogni schermata con una query di ingresso lo usa come
// ramo error (niente stati muti).
//
// M13/P1: due varianti. `errore` (default) = qualcosa è andato storto, icona di
// allerta. `offline` = niente rete e niente cache: icona cloud-offline dedicata
// (l'icona "offline" appartiene qui, non all'errore generico) + "Sei offline".
// La distinzione dà allo SWR uno stato onesto quando non c'è nulla da mostrare.

import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/components/ui/Button';
import { colors, fontFamily, fontSize, spacing } from '@/constants/theme';

interface Props {
  /** Variante: errore generico (default) oppure assenza di rete. */
  variante?: 'errore' | 'offline';
  /** Messaggio mostrato (default in base alla variante). */
  messaggio?: string;
  onRetry: () => void;
}

export function StatoErrore({ variante = 'errore', messaggio, onRetry }: Props) {
  const offline = variante === 'offline';
  const icona = offline ? 'cloud-offline-outline' : 'alert-circle-outline';
  const testo = messaggio ?? (offline ? 'Sei offline' : 'Qualcosa è andato storto.');
  return (
    <View style={styles.center}>
      <Ionicons name={icona} size={40} color={colors.faint} />
      <Text style={styles.testo}>{testo}</Text>
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
