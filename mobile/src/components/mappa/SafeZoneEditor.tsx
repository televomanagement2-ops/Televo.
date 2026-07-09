// =============================================================================
// SafeZoneEditor — creazione di una Safe Zone dal long-press sulla mappa (MM9).
// =============================================================================
// map.md §4: l'utente tiene premuto un punto → sceglie etichetta e raggio → la
// zona è salvata. Dentro quella zona apparirà «In zona · label», mai nel punto
// esatto (masking server-side, map_publish_location). È una SCELTA (mai default),
// disattivabile dalle impostazioni.
//
// Scelte di UI:
//  · Sheet con VELO LEGGERO (non il BottomSheet a velo 0.55): così il cerchio di
//    anteprima disegnato sulla mappa (ZonesLayer) resta ben visibile mentre si
//    regola il raggio — è il feedback del "quanto è grande".
//  · Raggio a PRESET (100/200/350/500 m) come le durate di ShareSheet: robusto,
//    accessibile e a prova di Modal (QA-3 risolta verso i preset, non lo slider:
//    zero gesture in-Modal, targhe grandi, e il cerchio live mostra la copertura).
//  · Etichetta: chip suggerite (Casa/Lavoro/Palestra) + campo libero.

import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/components/ui/Button';
import { useSafeZones } from '@/hooks/useSafeZones';
import { avvisa } from '@/lib/dialoghi';
import { mapErrorMessage } from '@/lib/errors';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';

/** Preset di raggio in metri (map.md §4: 100–500m). Il default 200 lo tiene il parent. */
export const RAGGI_PRESET = [100, 200, 350, 500] as const;

const SUGGERIMENTI = ['Casa', 'Lavoro', 'Palestra'] as const;
const MAX_LABEL = 40;

interface Props {
  visible: boolean;
  /** Centro scelto col long-press. */
  center: { lat: number; lng: number } | null;
  /** Raggio corrente (posseduto dal parent per pilotare l'anteprima ZonesLayer). */
  radiusM: number;
  onChangeRadius: (m: number) => void;
  onClose: () => void;
  /** Zona salvata: il parent chiude e pulisce il draft. */
  onSaved: () => void;
}

export function SafeZoneEditor({
  visible,
  center,
  radiusM,
  onChangeRadius,
  onClose,
  onSaved,
}: Props) {
  const insets = useSafeAreaInsets();
  const { crea } = useSafeZones();
  const [label, setLabel] = useState('');

  // Riparte pulito a ogni apertura.
  useEffect(() => {
    if (visible) setLabel('');
  }, [visible]);

  const nome = label.trim();
  const puoSalvare = nome.length > 0 && !!center && !crea.isPending;

  const salva = () => {
    if (!center || nome.length === 0) return;
    crea.mutate(
      { label: nome, lat: center.lat, lng: center.lng, radiusM },
      { onSuccess: onSaved, onError: (e) => avvisa('Ops', mapErrorMessage(e)) },
    );
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        {/* Velo leggero: la mappa (col cerchio di anteprima) resta visibile sopra la card. */}
        <Pressable style={styles.backdrop} onPress={onClose}>
          <Pressable
            style={[styles.card, { paddingBottom: Math.max(spacing.xl, insets.bottom + spacing.md) }]}
            onPress={() => {}}
          >
            <View style={styles.header}>
              <Ionicons name="shield-half-outline" size={20} color={colors.accentSoft} />
              <Text style={styles.titolo}>Nuova zona sicura</Text>
            </View>
            <Text style={styles.sub}>
              Dentro questa zona apparirai come «In zona{nome ? ` · ${nome}` : ''}», mai nel punto
              esatto. La vedi solo tu.
            </Text>

            <Text style={styles.sezione}>Nome</Text>
            <View style={styles.chips}>
              {SUGGERIMENTI.map((s) => (
                <Chip
                  key={s}
                  label={s}
                  attivo={nome === s}
                  onPress={() => setLabel(s)}
                />
              ))}
            </View>
            <TextInput
              style={styles.input}
              value={label}
              onChangeText={setLabel}
              placeholder="Nome della zona"
              placeholderTextColor={colors.faint}
              maxLength={MAX_LABEL}
              returnKeyType="done"
              accessibilityLabel="Nome della zona"
            />

            <Text style={styles.sezione}>Raggio</Text>
            <View style={styles.chips}>
              {RAGGI_PRESET.map((m) => (
                <Chip
                  key={m}
                  label={`${m} m`}
                  attivo={radiusM === m}
                  onPress={() => onChangeRadius(m)}
                />
              ))}
            </View>

            <View style={styles.azioni}>
              <Button
                label={crea.isPending ? 'Salvo…' : 'Salva zona'}
                onPress={salva}
                disabled={!puoSalvare}
              />
              <Button label="Annulla" variant="secondary" onPress={onClose} />
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Chip({ label, attivo, onPress }: { label: string; attivo: boolean; onPress: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.chip, attivo && styles.chipAttivo, pressed && styles.chipPressed]}
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: attivo }}
    >
      <Text style={[styles.chipText, attivo && styles.chipTextAttivo]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.28)', justifyContent: 'flex-end' },
  card: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.sm,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  titolo: { color: colors.ink, fontSize: fontSize.lg, fontFamily: fontFamily.semibold },
  sub: { color: colors.muted, fontSize: fontSize.sm, fontFamily: fontFamily.sans, lineHeight: 20 },
  sezione: {
    color: colors.muted,
    fontSize: fontSize.xs,
    fontFamily: fontFamily.semibold,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: spacing.sm,
  },
  chips: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  chip: {
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
  },
  chipAttivo: { borderColor: colors.accent, backgroundColor: 'rgba(59,130,246,0.16)' },
  chipPressed: { opacity: 0.7 },
  chipText: { color: colors.ink, fontSize: fontSize.sm, fontFamily: fontFamily.semibold },
  chipTextAttivo: { color: colors.accentSoft },
  input: {
    color: colors.ink,
    fontSize: fontSize.base,
    fontFamily: fontFamily.medium,
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  azioni: { gap: spacing.sm, marginTop: spacing.md },
});
