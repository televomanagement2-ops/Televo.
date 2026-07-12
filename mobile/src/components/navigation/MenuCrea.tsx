// =============================================================================
// MenuCrea — bottom sheet di creazione aperto dal + centrale (S0, R-16).
// =============================================================================
// Sostituisce la schermata-frame `crea.tsx`: dal + si crea TUTTO in due tap.
// In testa la sezione DROP (Foto · Audio · Testo, attive) → apre il composer
// (S2) col formato preselezionato; sotto le altre creazioni con badge "presto".
// Montato UNA volta nella shell autenticata; la visibilità vive in creaMenuStore
// (il + chiama open(), backdrop/voce chiudono). Riusa il primitive BottomSheet e
// il linguaggio visivo del sistema dialoghi (CM6.5).

import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { CREATE_ALTRO, CREATE_DROPS, type CreateType } from '@/constants/createTypes';
import { useCreaMenuStore } from '@/store/creaMenuStore';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';

export function MenuCrea() {
  const visible = useCreaMenuStore((s) => s.visible);
  const close = useCreaMenuStore((s) => s.close);

  const scegli = (o: CreateType) => {
    if (!o.enabled || (!o.dropTipo && !o.route)) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    close();
    // Chiude il menu poi apre la destinazione: composer drop col formato
    // preselezionato (S2) oppure la rotta della voce (es. composer live, M12).
    if (o.dropTipo) {
      router.push({ pathname: '/drop/nuovo', params: { tipo: o.dropTipo } });
    } else if (o.route) {
      router.push(o.route);
    }
  };

  if (!visible) return null;

  return (
    <Modal transparent visible animationType="fade" onRequestClose={close} statusBarTranslucent>
      <BottomSheet onClose={close}>
        <Text style={styles.titolo}>Cosa vuoi creare?</Text>

        <Text style={styles.sezione}>Drop</Text>
        {CREATE_DROPS.map((o) => (
          <Riga key={o.key} o={o} onPress={() => scegli(o)} />
        ))}

        <Text style={[styles.sezione, styles.sezioneAltro]}>Altro</Text>
        {CREATE_ALTRO.map((o) => (
          <Riga key={o.key} o={o} onPress={() => scegli(o)} />
        ))}
      </BottomSheet>
    </Modal>
  );
}

function Riga({ o, onPress }: { o: CreateType; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!o.enabled}
      style={({ pressed }) => [styles.riga, pressed && o.enabled && styles.rigaPressed]}
    >
      <View style={[styles.iconWrap, !o.enabled && styles.iconWrapOff]}>
        <Ionicons name={o.icon} size={22} color={o.enabled ? colors.ink : colors.faint} />
      </View>
      <View style={styles.testo}>
        <Text style={[styles.rigaTitolo, !o.enabled && styles.rigaTitoloOff]}>{o.title}</Text>
        <Text style={styles.rigaSub} numberOfLines={1}>
          {o.subtitle}
        </Text>
      </View>
      {o.enabled ? (
        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      ) : (
        <Text style={styles.presto}>presto</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  titolo: { color: colors.ink, fontSize: fontSize.lg, fontFamily: fontFamily.displayBold, marginBottom: spacing.xs },
  sezione: {
    color: colors.faint,
    fontSize: fontSize.xs,
    fontFamily: fontFamily.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.sm,
  },
  sezioneAltro: { marginTop: spacing.md },
  riga: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  rigaPressed: { opacity: 0.7 },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.elevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapOff: { opacity: 0.6 },
  testo: { flex: 1, gap: 2 },
  rigaTitolo: { color: colors.ink, fontSize: fontSize.base, fontFamily: fontFamily.semibold },
  rigaTitoloOff: { color: colors.muted },
  rigaSub: { color: colors.muted, fontSize: fontSize.sm, fontFamily: fontFamily.sans },
  presto: { color: colors.faint, fontSize: fontSize.xs, fontFamily: fontFamily.medium },
});
