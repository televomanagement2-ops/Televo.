// =============================================================================
// DropReactionBar — barra delle reaction-tratto (S6, gesto forte). Compare col
// long-press sul ♥: quattro tratti (Gentile 💛 / Divertente 😂 / Accogliente 🤗 /
// Utile 🧠). Toccarne uno lo dà/toglie (→ prop → Aura). I tratti già dati (dal
// mio punto di vista) restano evidenziati. È un overlay controllato dalla card.
// =============================================================================

import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { DROP_REACTION_TRAITS } from '@/constants/drops';
import { AURA_TRAIT_COLOR } from '@/constants/aura';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import type { DropReactionTrait } from '@/types/supabase';

interface Props {
  /** Tratti già dati da me a questo drop (evidenziati). */
  mine: DropReactionTrait[];
  onPick: (trait: DropReactionTrait, next: boolean) => void;
}

export function DropReactionBar({ mine, onPick }: Props) {
  return (
    <View style={styles.bar}>
      {DROP_REACTION_TRAITS.map(({ trait, emoji, label }) => {
        const attivo = mine.includes(trait);
        return (
          <Pressable
            key={trait}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ selected: attivo }}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              onPick(trait, !attivo);
            }}
            style={[
              styles.pill,
              attivo && { borderColor: AURA_TRAIT_COLOR[trait], backgroundColor: colors.elevated },
            ]}
          >
            <Text style={styles.emoji}>{emoji}</Text>
            <Text style={[styles.label, attivo && { color: colors.ink }]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.sm,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: colors.elevated,
  },
  emoji: { fontSize: 16 },
  label: { color: colors.muted, fontSize: 13, fontFamily: fontFamily.medium },
});
