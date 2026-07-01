// =============================================================================
// AuraBreakdown — i tratti che compongono l'Aura della settimana.
// =============================================================================
// L'Aura è multi-tratto: questa è la sua "scomposizione" per carattere (gentile,
// divertente, contributo, accogliente, costante, presente). Barre orizzontali
// colorate col colore del tratto, normalizzate sul valore massimo. Se non ci sono
// ancora dati (utente nuovo / prima del primo ricalcolo), mostra un empty state.

import { StyleSheet, Text, View } from 'react-native';
import {
  AURA_TRAITS,
  AURA_TRAIT_COLOR,
  AURA_TRAIT_LABEL,
  type AuraTrait,
} from '@/constants/aura';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';

interface Props {
  breakdown: Partial<Record<AuraTrait, number>>;
}

export function AuraBreakdown({ breakdown }: Props) {
  const entries = AURA_TRAITS.map((t) => ({
    trait: t,
    value: Math.max(0, breakdown[t] ?? 0),
  }));
  const max = Math.max(...entries.map((e) => e.value), 0);

  if (max <= 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>
          La tua Aura prende forma con la presenza: ricevi prop, partecipa, sii te stesso.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.list}>
      {entries.map(({ trait, value }) => {
        const pct = max > 0 ? value / max : 0;
        const color = AURA_TRAIT_COLOR[trait];
        return (
          <View key={trait} style={styles.rowItem}>
            <Text style={styles.rowLabel}>{AURA_TRAIT_LABEL[trait]}</Text>
            <View style={styles.track}>
              <View
                style={[styles.fill, { width: `${Math.max(pct * 100, value > 0 ? 4 : 0)}%`, backgroundColor: color }]}
              />
            </View>
            <Text style={styles.rowValue}>{value > 0 ? value.toFixed(1) : '—'}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  rowItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowLabel: {
    width: 92,
    color: colors.muted,
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
  },
  track: {
    flex: 1,
    height: 8,
    borderRadius: radius.full,
    backgroundColor: colors.elevated,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: radius.full },
  rowValue: {
    width: 38,
    textAlign: 'right',
    color: colors.faint,
    fontFamily: fontFamily.medium,
    fontSize: fontSize.xs,
  },
  empty: { paddingVertical: spacing.md },
  emptyText: {
    color: colors.faint,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
});
