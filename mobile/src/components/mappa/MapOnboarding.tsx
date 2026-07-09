// =============================================================================
// MapOnboarding — primo opt-in della Mappa: consenso GDPR + permesso OS (MM6).
// =============================================================================
// Sheet dark mostrato SOLO la prima volta (o finché manca consenso/permesso).
// Spiega la lente PRIMA di toccare il GPS (map.md §3): appari solo agli amici,
// posizione esatta di default, revoca istantanea. "Continua" registra il
// consenso 'location' (record_consent) e chiede il permesso When-In-Use; se
// concesso passa allo sheet delle durate (onPronto), se negato mostra lo stato
// spiegato con link alle impostazioni (pattern contatti CM7).

import { useEffect, useState } from 'react';
import { Linking, Modal, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { useCondivisionePosizione } from '@/hooks/useCondivisionePosizione';
import { avvisa } from '@/lib/dialoghi';
import { mapErrorMessage } from '@/lib/errors';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Consenso dato + permesso concesso → il parent apre lo sheet delle durate. */
  onPronto: () => void;
}

export function MapOnboarding({ visible, onClose, onPronto }: Props) {
  const { registraConsenso, richiediPermesso } = useCondivisionePosizione();
  const [negato, setNegato] = useState(false);
  const [inCorso, setInCorso] = useState(false);

  // Riparte sempre dall'intro a ogni apertura.
  useEffect(() => {
    if (visible) {
      setNegato(false);
      setInCorso(false);
    }
  }, [visible]);

  const attiva = async () => {
    setInCorso(true);
    try {
      await registraConsenso.mutateAsync();
      const p = await richiediPermesso();
      if (p === 'granted') {
        onPronto();
      } else {
        setNegato(true);
      }
    } catch (e) {
      avvisa('Ops', mapErrorMessage(e));
    } finally {
      setInCorso(false);
    }
  };

  const riprova = async () => {
    const p = await richiediPermesso();
    if (p === 'granted') onPronto();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <BottomSheet onClose={onClose}>
        {negato ? (
          <View style={styles.body}>
            <View style={styles.icona}>
              <Ionicons name="location-outline" size={40} color={colors.warning} />
            </View>
            <Text style={styles.titolo}>Serve l’accesso alla posizione</Text>
            <Text style={styles.testo}>
              Hai negato il permesso: per apparire sulla mappa consenti l’accesso alla posizione nelle
              impostazioni del telefono. Nessuno oltre ai tuoi amici la vedrà.
            </Text>
            <Button label="Apri impostazioni" onPress={() => void Linking.openSettings()} />
            <Button label="Riprova" variant="secondary" onPress={() => void riprova()} />
          </View>
        ) : (
          <View style={styles.body}>
            <View style={styles.icona}>
              <Ionicons name="navigate-circle-outline" size={40} color={colors.accent} />
            </View>
            <Text style={styles.titolo}>Accendi la tua Aura sulla mappa</Text>
            <Text style={styles.testo}>
              Appari sulla Mappa della Città solo ai tuoi amici e solo per il tempo che scegli. La
              posizione è esatta di default, ma la spegni quando vuoi. Chi non è tuo amico non vede
              nulla, mai.
            </Text>
            <Text style={styles.nota}>
              Continuando condividi la tua posizione con i soli amici, con revoca istantanea in ogni
              momento.
            </Text>
            <Button label="Continua" onPress={() => void attiva()} loading={inCorso} />
          </View>
        )}
      </BottomSheet>
    </Modal>
  );
}

const styles = StyleSheet.create({
  body: { alignItems: 'center', gap: spacing.md, paddingTop: spacing.sm },
  icona: {
    width: 76,
    height: 76,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  titolo: {
    color: colors.ink,
    fontSize: fontSize.lg,
    fontFamily: fontFamily.semibold,
    textAlign: 'center',
  },
  testo: {
    color: colors.muted,
    fontSize: fontSize.sm,
    fontFamily: fontFamily.sans,
    textAlign: 'center',
    lineHeight: 20,
  },
  nota: {
    color: colors.faint,
    fontSize: fontSize.xs,
    fontFamily: fontFamily.sans,
    textAlign: 'center',
    lineHeight: 17,
  },
});
