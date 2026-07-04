// =============================================================================
// DialogHost — host unico dei popup dark (CM6.5).
// =============================================================================
// Un SOLO Modal montato nel root layout: legge lo slot dello store dialoghi e
// renderizza il menu (BottomSheet) o la card centrata (conferma/avviso).
// Il tap fuori e il back Android (onRequestClose) chiudono SEMPRE. Le voci
// chiudono PRIMA di eseguire la onPress: se questa apre un altro dialogo in
// modo sincrono, lo slot viene rimpiazzato nello stesso tick e il Modal resta
// su (menu a due livelli senza flicker).

import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { chiudiDialogo, useDialoghiStore, type VoceMenu } from '@/lib/dialoghi';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';

/** Voce del menu: icona opzionale + etichetta (+ variante distruttiva/muted). */
function Voce({ voce, muted }: { voce: VoceMenu; muted?: boolean }) {
  const color = voce.danger ? colors.danger : muted ? colors.muted : colors.ink;
  return (
    <Pressable
      onPress={() => {
        chiudiDialogo();
        voce.onPress?.();
      }}
      style={({ pressed }) => [styles.voce, pressed && styles.pressed]}
    >
      {voce.icon ? <Ionicons name={voce.icon} size={20} color={color} /> : null}
      <Text style={[styles.voceLabel, { color }]}>{voce.label}</Text>
    </Pressable>
  );
}

export function DialogHost() {
  const dialogo = useDialoghiStore((s) => s.dialogo);

  return (
    <Modal
      visible={dialogo !== null}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={chiudiDialogo}
    >
      {dialogo?.kind === 'menu' ? (
        <BottomSheet onClose={chiudiDialogo}>
          {dialogo.titolo ? <Text style={styles.titolo}>{dialogo.titolo}</Text> : null}
          {dialogo.sottotitolo ? <Text style={styles.sottotitolo}>{dialogo.sottotitolo}</Text> : null}
          <ScrollView bounces={false} style={styles.vociList}>
            {dialogo.voci.map((v, i) => (
              <Voce key={`${v.label}-${i}`} voce={v} />
            ))}
          </ScrollView>
          {/* "Annulla" sempre presente, appesa dal host (separatore + muted). */}
          <View style={styles.separatore} />
          <Voce voce={{ label: 'Annulla', icon: 'close-outline' }} muted />
        </BottomSheet>
      ) : dialogo ? (
        <Pressable style={styles.backdropCentro} onPress={chiudiDialogo}>
          {/* Pressable interno: il tap sulla card NON chiude. */}
          <Pressable style={styles.cardCentro} onPress={() => {}}>
            <Text style={styles.titolo}>{dialogo.titolo}</Text>
            {dialogo.messaggio ? <Text style={styles.messaggio}>{dialogo.messaggio}</Text> : null}
            <View style={styles.bottoni}>
              {dialogo.kind === 'conferma' ? (
                <>
                  <Pressable
                    onPress={chiudiDialogo}
                    style={({ pressed }) => [styles.bottone, pressed && styles.pressed]}
                  >
                    <Text style={styles.bottoneAnnulla}>{dialogo.annullaLabel}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      const { onConferma } = dialogo;
                      chiudiDialogo();
                      onConferma();
                    }}
                    style={({ pressed }) => [styles.bottone, pressed && styles.pressed]}
                  >
                    <Text style={dialogo.distruttiva ? styles.bottoneDanger : styles.bottoneOk}>
                      {dialogo.confermaLabel}
                    </Text>
                  </Pressable>
                </>
              ) : (
                <Pressable
                  onPress={() => {
                    const { onChiudi } = dialogo;
                    chiudiDialogo();
                    onChiudi?.();
                  }}
                  style={({ pressed }) => [styles.bottone, pressed && styles.pressed]}
                >
                  <Text style={styles.bottoneOk}>OK</Text>
                </Pressable>
              )}
            </View>
          </Pressable>
        </Pressable>
      ) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.7 },

  // Testi comuni (menu e card)
  titolo: { color: colors.ink, fontSize: fontSize.lg, fontFamily: fontFamily.semibold },
  sottotitolo: { color: colors.muted, fontSize: fontSize.sm, fontFamily: fontFamily.sans },
  messaggio: { color: colors.muted, fontSize: fontSize.sm, fontFamily: fontFamily.sans },

  // Menu (dentro BottomSheet)
  vociList: { flexGrow: 0 },
  voce: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  voceLabel: { fontSize: fontSize.base, fontFamily: fontFamily.sans },
  separatore: { height: 1, backgroundColor: colors.border },

  // Card centrata (conferma/avviso)
  backdropCentro: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  cardCentro: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  bottoni: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  bottone: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  bottoneAnnulla: { color: colors.muted, fontSize: fontSize.base, fontFamily: fontFamily.medium },
  bottoneOk: { color: colors.accentSoft, fontSize: fontSize.base, fontFamily: fontFamily.semibold },
  bottoneDanger: { color: colors.danger, fontSize: fontSize.base, fontFamily: fontFamily.semibold },
});
