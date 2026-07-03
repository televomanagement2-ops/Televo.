// =============================================================================
// MenuMessaggio — menu contestuale del messaggio (S16, CM4).
// =============================================================================
// Sostituisce l'Alert nativo: con reazioni, prop e segnalazione le voci sono
// troppe per un Alert e la barra emoji non ci starebbe. Un SOLO Modal con step
// interni (menu → prop/info/segnala): i modali impilati su Android sono
// inaffidabili. La visibilità delle voci segue la SRS S16:
//   Rispondi/Salva (non cancellati) · Copia (testo) · Modifica (miei, testo,
//   <48h — R-15) · Inoltra (testo — i vocali sono effimeri, RC-06) · Dai un
//   prop / Segnala (altrui) · Info messaggio (miei, nei gruppi — RC-09) ·
//   Seleziona · Elimina (miei).

import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { timeHHmm } from '@/lib/datetime';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';
import { EDIT_WINDOW_MS, REACTION_EMOJIS, type ReactionEmoji } from '@/constants/chat';
import { AURA_TRAITS, AURA_TRAIT_COLOR, AURA_TRAIT_LABEL, type AuraTrait } from '@/constants/aura';
import type { MessageRow } from '@/types';

/** Chi ha letto il messaggio (gruppi): nome + orario di lettura implicito. */
export interface ReadByEntry {
  name: string;
  readAt: string;
}

/** Motivi di segnalazione proposti (il dettaglio libero arriva con la UI M10). */
const REPORT_REASONS = ['Spam', 'Contenuto offensivo', 'Bullismo', 'Altro'] as const;

type Step = 'menu' | 'prop' | 'info' | 'segnala';

interface Props {
  visible: boolean;
  message: MessageRow | null;
  isMine: boolean;
  isGroup: boolean;
  /** Emoji della MIA reazione su questo messaggio (null = nessuna). */
  myReaction: string | null;
  /** Gruppi: chi ha già letto (per "Info messaggio"). */
  readBy?: ReadByEntry[];
  /** Gruppi: destinatari totali (membri escluso il mittente). */
  recipientCount?: number;
  onClose: () => void;
  onReact: (emoji: ReactionEmoji) => void;
  onReply: () => void;
  onCopy: () => void;
  onEdit: () => void;
  onForward: () => void;
  onSave: () => void;
  onSelect: () => void;
  onDelete: () => void;
  onProp: (trait: AuraTrait) => void;
  onReport: (reason: string) => void;
}

/** Voce del menu: icona + etichetta (+ variante destructive). */
function Voce({
  icon,
  label,
  danger,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  danger?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.voce, pressed && styles.pressed]}>
      <Ionicons name={icon} size={20} color={danger ? colors.danger : colors.ink} />
      <Text style={[styles.voceLabel, danger && styles.voceDanger]}>{label}</Text>
    </Pressable>
  );
}

export function MenuMessaggio({
  visible,
  message,
  isMine,
  isGroup,
  myReaction,
  readBy = [],
  recipientCount = 0,
  onClose,
  onReact,
  onReply,
  onCopy,
  onEdit,
  onForward,
  onSave,
  onSelect,
  onDelete,
  onProp,
  onReport,
}: Props) {
  const [step, setStep] = useState<Step>('menu');

  // Ogni apertura riparte dal menu principale (+ haptic leggero).
  useEffect(() => {
    if (visible) {
      setStep('menu');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  }, [visible]);

  if (!message) return null;

  const deleted = !!message.deleted_at;
  const isText = message.type === 'text' && !!message.body;
  const inEditWindow = Date.now() - new Date(message.created_at).getTime() < EDIT_WINDOW_MS;

  const chiudiE = (fn: () => void) => () => {
    onClose();
    fn();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* Pressable interno: il tap sul contenuto NON chiude. */}
        <Pressable style={styles.card} onPress={() => {}}>
          {step === 'menu' ? (
            <>
              {/* Barra reazioni: la propria è evidenziata, tap = toggle. */}
              {!deleted ? (
                <View style={styles.emojiBar}>
                  {REACTION_EMOJIS.map((e) => (
                    <Pressable
                      key={e}
                      onPress={chiudiE(() => onReact(e))}
                      style={({ pressed }) => [
                        styles.emojiChip,
                        myReaction === e && styles.emojiChipMine,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text style={styles.emoji}>{e}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}

              <ScrollView bounces={false} style={styles.vociList}>
                {!deleted ? <Voce icon="arrow-undo-outline" label="Rispondi" onPress={chiudiE(onReply)} /> : null}
                {isText && !deleted ? <Voce icon="copy-outline" label="Copia" onPress={chiudiE(onCopy)} /> : null}
                {isMine && isText && !deleted && inEditWindow ? (
                  <Voce icon="pencil-outline" label="Modifica" onPress={chiudiE(onEdit)} />
                ) : null}
                {isText && !deleted ? (
                  <Voce icon="arrow-redo-outline" label="Inoltra" onPress={chiudiE(onForward)} />
                ) : null}
                {!deleted ? <Voce icon="bookmark-outline" label="Salva" onPress={chiudiE(onSave)} /> : null}
                {!isMine && !deleted ? (
                  <Voce icon="sparkles-outline" label="Dai un prop" onPress={() => setStep('prop')} />
                ) : null}
                {isMine && isGroup ? (
                  <Voce
                    icon="information-circle-outline"
                    label="Info messaggio"
                    onPress={() => setStep('info')}
                  />
                ) : null}
                {!isMine && !deleted ? (
                  <Voce icon="flag-outline" label="Segnala" onPress={() => setStep('segnala')} />
                ) : null}
                <Voce icon="checkmark-circle-outline" label="Seleziona" onPress={chiudiE(onSelect)} />
                {isMine && !deleted ? (
                  <Voce icon="trash-outline" label="Elimina" danger onPress={chiudiE(onDelete)} />
                ) : null}
              </ScrollView>
            </>
          ) : step === 'prop' ? (
            <>
              <Text style={styles.stepTitle}>Dai un prop</Text>
              <Text style={styles.stepSub}>
                Un riconoscimento vero: alimenta l’Aura di chi lo riceve.
              </Text>
              <View style={styles.traitGrid}>
                {AURA_TRAITS.map((t) => (
                  <Pressable
                    key={t}
                    onPress={chiudiE(() => onProp(t))}
                    style={({ pressed }) => [
                      styles.traitChip,
                      { borderColor: AURA_TRAIT_COLOR[t] },
                      pressed && styles.pressed,
                    ]}
                  >
                    <View style={[styles.traitDot, { backgroundColor: AURA_TRAIT_COLOR[t] }]} />
                    <Text style={styles.traitLabel}>{AURA_TRAIT_LABEL[t]}</Text>
                  </Pressable>
                ))}
              </View>
              <Voce icon="chevron-back" label="Indietro" onPress={() => setStep('menu')} />
            </>
          ) : step === 'info' ? (
            <>
              <Text style={styles.stepTitle}>Info messaggio</Text>
              <Text style={styles.stepSub}>
                Inviato alle {timeHHmm(message.created_at)}
                {message.edited_at ? ` · modificato alle ${timeHHmm(message.edited_at)}` : ''}
              </Text>
              <Text style={styles.readByCount}>
                Letto da {readBy.length} su {recipientCount}
              </Text>
              <ScrollView bounces={false} style={styles.vociList}>
                {readBy.length === 0 ? (
                  <Text style={styles.readByEmpty}>Ancora nessuna lettura.</Text>
                ) : (
                  readBy.map((r) => (
                    <View key={`${r.name}-${r.readAt}`} style={styles.readByRow}>
                      <Ionicons name="checkmark-done" size={16} color={colors.accentSoft} />
                      <Text style={styles.readByName}>{r.name}</Text>
                    </View>
                  ))
                )}
              </ScrollView>
              <Voce icon="chevron-back" label="Indietro" onPress={() => setStep('menu')} />
            </>
          ) : (
            <>
              <Text style={styles.stepTitle}>Segnala messaggio</Text>
              <Text style={styles.stepSub}>
                La segnalazione è anonima e va ai moderatori.
              </Text>
              <ScrollView bounces={false} style={styles.vociList}>
                {REPORT_REASONS.map((r) => (
                  <Voce key={r} icon="flag-outline" label={r} onPress={chiudiE(() => onReport(r))} />
                ))}
              </ScrollView>
              <Voce icon="chevron-back" label="Indietro" onPress={() => setStep('menu')} />
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
    maxHeight: '75%',
  },
  pressed: { opacity: 0.7 },

  // Barra reazioni
  emojiBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.xs,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  emojiChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  emojiChipMine: { borderColor: colors.accent, backgroundColor: 'rgba(90,120,255,0.12)' },
  emoji: { fontSize: 24 },

  // Voci
  vociList: { flexGrow: 0 },
  voce: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  voceLabel: { color: colors.ink, fontSize: fontSize.base, fontFamily: fontFamily.sans },
  voceDanger: { color: colors.danger },

  // Step secondari
  stepTitle: { color: colors.ink, fontSize: fontSize.lg, fontFamily: fontFamily.semibold },
  stepSub: { color: colors.muted, fontSize: fontSize.sm, fontFamily: fontFamily.sans },

  // Prop (griglia tratti)
  traitGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  traitChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  traitDot: { width: 8, height: 8, borderRadius: 4 },
  traitLabel: { color: colors.ink, fontSize: fontSize.sm, fontFamily: fontFamily.sans },

  // Info messaggio
  readByCount: { color: colors.ink, fontSize: fontSize.sm, fontFamily: fontFamily.semibold },
  readByRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  readByName: { color: colors.ink, fontSize: fontSize.sm, fontFamily: fontFamily.sans },
  readByEmpty: { color: colors.muted, fontSize: fontSize.sm, fontFamily: fontFamily.sans },
});
