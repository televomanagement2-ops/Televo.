// =============================================================================
// ShareSheet — accensione/gestione dell'Aura sulla mappa (M7 / MM6).
// =============================================================================
// Bottom sheet a DUE volti, guidati dallo stato reale della sessione:
//  · SPENTA → "Per quanto vuoi essere visibile?" + durate 1h/4h/8h (cap server
//    12h) → map_start_sharing. Restando aperto diventa il pannello ACCESO.
//  · ACCESA → countdown live (ancora Xh Ym), hint "In zona" se mascherato,
//    "Estendi" con le stesse durate (riscrive sharing_until) e "Spegni ora"
//    (revoca istantanea = sparizione fisica). Il tempo è derivato dal solo
//    sharing_until UTC: niente calcoli su ora locale.

import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { useCondivisionePosizione } from '@/hooks/useCondivisionePosizione';
import { sessioneAttiva } from '@/store/mapStore';
import { residuoCompatto } from '@/lib/datetime';
import { avvisa } from '@/lib/dialoghi';
import { mapErrorMessage } from '@/lib/errors';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';

const DURATE: { ore: number; label: string }[] = [
  { ore: 1, label: '1 ora' },
  { ore: 4, label: '4 ore' },
  { ore: 8, label: '8 ore' },
];

export function ShareSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { sessione, avvia, spegni } = useCondivisionePosizione();

  // Tick per il countdown live mentre lo sheet è aperto.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!visible) return;
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, [visible]);

  const accesa = sessioneAttiva(sessione, Date.now());

  const scegli = (ore: number) =>
    avvia.mutate(ore, { onError: (e) => avvisa('Ops', mapErrorMessage(e)) });

  const spegniOra = () =>
    spegni.mutate(undefined, {
      onSuccess: onClose,
      onError: (e) => avvisa('Ops', mapErrorMessage(e)),
    });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <BottomSheet onClose={onClose}>
        {accesa && sessione ? (
          <View style={styles.body}>
            <View style={styles.headerOn}>
              <View style={styles.dot} />
              <Text style={styles.titolo}>Sei visibile ai tuoi amici</Text>
            </View>
            <Text style={styles.sub}>Ancora {residuoCompatto(sessione.sharingUntil)}</Text>
            {sessione.masked ? (
              <View style={styles.hint}>
                <Ionicons name="shield-half-outline" size={14} color={colors.accentSoft} />
                <Text style={styles.hintText}>Appari come «In zona», non nel punto esatto.</Text>
              </View>
            ) : null}

            <Text style={styles.sezione}>Estendi</Text>
            <View style={styles.chips}>
              {DURATE.map((d) => (
                <ChipDurata
                  key={d.ore}
                  label={d.label}
                  loading={avvia.isPending && avvia.variables === d.ore}
                  onPress={() => scegli(d.ore)}
                />
              ))}
            </View>

            <View style={styles.divisore} />
            <Button
              label={spegni.isPending ? 'Spengo…' : 'Spegni ora'}
              variant="secondary"
              onPress={spegniOra}
            />
            <Text style={styles.nota}>
              Spegnendo sparisci del tutto, subito: nessun «visto poco fa».
            </Text>
          </View>
        ) : (
          <View style={styles.body}>
            <Text style={styles.titolo}>Per quanto vuoi essere visibile?</Text>
            <Text style={styles.sub}>
              La tua Aura si accende sulla mappa per il tempo scelto, poi si spegne da sola.
            </Text>
            <View style={styles.chips}>
              {DURATE.map((d) => (
                <ChipDurata
                  key={d.ore}
                  label={d.label}
                  loading={avvia.isPending && avvia.variables === d.ore}
                  onPress={() => scegli(d.ore)}
                />
              ))}
            </View>
          </View>
        )}
      </BottomSheet>
    </Modal>
  );
}

function ChipDurata({
  label,
  loading,
  onPress,
}: {
  label: string;
  loading: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
      onPress={onPress}
      disabled={loading}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={styles.chipText}>{loading ? '…' : label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.md, paddingTop: spacing.xs },
  headerOn: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent },
  titolo: { color: colors.ink, fontSize: fontSize.lg, fontFamily: fontFamily.semibold },
  sub: { color: colors.muted, fontSize: fontSize.sm, fontFamily: fontFamily.sans, lineHeight: 20 },
  hint: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  hintText: { color: colors.accentSoft, fontSize: fontSize.xs, fontFamily: fontFamily.medium },
  sezione: {
    color: colors.muted,
    fontSize: fontSize.xs,
    fontFamily: fontFamily.semibold,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: spacing.xs,
  },
  chips: { flexDirection: 'row', gap: spacing.sm },
  chip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
  },
  chipPressed: { opacity: 0.7, borderColor: colors.accent },
  chipText: { color: colors.ink, fontSize: fontSize.base, fontFamily: fontFamily.semibold },
  divisore: { height: 1, backgroundColor: colors.border, marginTop: spacing.xs },
  nota: {
    color: colors.faint,
    fontSize: fontSize.xs,
    fontFamily: fontFamily.sans,
    textAlign: 'center',
    lineHeight: 16,
  },
});
