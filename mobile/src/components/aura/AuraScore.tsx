// =============================================================================
// AuraScore — progresso verso la prossima milestone Aura (100 / 250 / 500).
// =============================================================================
// Mostra quanto manca alla prossima soglia (che sblocca un badge esclusivo). Se
// l'utente ha superato l'ultima milestone, celebra il traguardo massimo. La barra
// usa il colore del tratto dominante, per coerenza con l'anello.

import { StyleSheet, Text, View } from 'react-native';
import { AURA_MILESTONES } from '@/constants/aura';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';

interface Props {
  score: number;
  /** colore del tratto dominante (per la barra), default accento */
  color?: string;
}

/** Prossima milestone non ancora raggiunta, o null se le ha superate tutte. */
function nextMilestone(score: number): number | null {
  for (const m of AURA_MILESTONES) {
    if (score < m) return m;
  }
  return null;
}

/** Milestone precedente (base della barra) per il calcolo della percentuale. */
function prevMilestone(score: number): number {
  let prev = 0;
  for (const m of AURA_MILESTONES) {
    if (score >= m) prev = m;
    else break;
  }
  return prev;
}

export function AuraScore({ score, color = colors.accent }: Props) {
  const next = nextMilestone(score);

  if (next === null) {
    return (
      <View style={styles.container}>
        <Text style={styles.maxedLabel}>Hai raggiunto la vetta dell&apos;Aura ✨</Text>
        <View style={styles.track}>
          <View style={[styles.fill, { width: '100%', backgroundColor: color }]} />
        </View>
      </View>
    );
  }

  const base = prevMilestone(score);
  const span = next - base;
  const pct = span > 0 ? Math.min(1, Math.max(0, (score - base) / span)) : 0;
  const remaining = Math.max(0, Math.ceil(next - score));

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Text style={styles.label}>Prossimo traguardo</Text>
        <Text style={styles.value}>{next}</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct * 100}%`, backgroundColor: color }]} />
      </View>
      <Text style={styles.hint}>Mancano {remaining} di Aura</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  label: { color: colors.muted, fontFamily: fontFamily.medium, fontSize: fontSize.sm },
  value: { color: colors.ink, fontFamily: fontFamily.semibold, fontSize: fontSize.base },
  track: {
    height: 8,
    borderRadius: radius.full,
    backgroundColor: colors.elevated,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: radius.full },
  hint: { color: colors.faint, fontFamily: fontFamily.sans, fontSize: fontSize.xs },
  maxedLabel: { color: colors.ink, fontFamily: fontFamily.semibold, fontSize: fontSize.base },
});
