// =============================================================================
// MenuClassifica — il menu ⋮ della Classifica Aura (M16 / AC3, classifica.md §5).
// =============================================================================
// Bottom sheet scuro (Modal transparent + BottomSheet, gerarchia visiva di
// MenuMessaggio/ShareSheet) con due voci (§5): 1) uno Switch legato a
// `show_in_leaderboard`, col copy della RECIPROCITÀ sempre in vista (AC-2:
// nascondersi = sparire dalle classifiche altrui E perdere la propria);
// 2) «Condividi la tua posizione» (AC4 — punto d'ingresso 2 della share card),
// disabilitata se non listed o senza dati.

import { Modal, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { colors, fontFamily, fontSize, spacing } from '@/constants/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Stato corrente (da `listed` nell'envelope, MAI letto da profiles). */
  listed: boolean;
  onCambia: (mostra: boolean) => void;
  /** True mentre il flip è in volo (lo Switch resta interattivo ma coerente). */
  inCorso: boolean;
  /** Avvia la share card (AC4). Il flusso parte DOPO la chiusura del sheet:
   *  la card off-screen vive nel container, non dentro il Modal. */
  onCondividi: () => void;
  /** False se non listed o senza dati (§5): la voce resta visibile ma spenta. */
  shareAbilitato: boolean;
}

export function MenuClassifica({
  visible,
  onClose,
  listed,
  onCambia,
  inCorso,
  onCondividi,
  shareAbilitato,
}: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <BottomSheet onClose={onClose}>
        <Text style={styles.titolo}>Classifica Aura</Text>

        <View style={styles.rigaSwitch}>
          <View style={styles.testi}>
            <Text style={styles.voce}>Mostra la mia posizione in classifica</Text>
            <Text style={styles.sottotitolo}>
              Se ti nascondi, sparisci dalla classifica dei tuoi amici e non vedrai la loro.
            </Text>
          </View>
          <Switch
            value={listed}
            onValueChange={onCambia}
            disabled={inCorso}
            trackColor={{ false: colors.elevated, true: colors.accent }}
            thumbColor="#ffffff"
            accessibilityLabel="Mostra la mia posizione in classifica"
          />
        </View>

        <Pressable
          onPress={() => {
            onClose();
            onCondividi();
          }}
          disabled={!shareAbilitato}
          style={({ pressed }) => [styles.rigaShare, pressed && styles.premuta]}
          accessibilityRole="button"
          accessibilityLabel="Condividi la tua posizione"
        >
          <Ionicons
            name="share-outline"
            size={20}
            color={shareAbilitato ? colors.ink : colors.faint}
          />
          <Text style={[styles.voce, !shareAbilitato && styles.voceSpenta]}>
            Condividi la tua posizione
          </Text>
        </Pressable>
      </BottomSheet>
    </Modal>
  );
}

const styles = StyleSheet.create({
  titolo: {
    color: colors.ink,
    fontSize: fontSize.lg,
    fontFamily: fontFamily.semibold,
    marginBottom: spacing.xs,
  },
  rigaSwitch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  testi: { flex: 1, gap: 2 },
  voce: { color: colors.ink, fontSize: fontSize.base, fontFamily: fontFamily.medium },
  voceSpenta: { color: colors.faint },
  rigaShare: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: spacing.xs,
  },
  premuta: { opacity: 0.7 },
  sottotitolo: {
    color: colors.muted,
    fontSize: fontSize.xs,
    fontFamily: fontFamily.sans,
    lineHeight: 16,
  },
});
