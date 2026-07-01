// =============================================================================
// PropCard — i riconoscimenti (prop) ricevuti, per tratto.
// =============================================================================
// I prop sono il segnale peer-to-peer dell'Aura: "ti ho visto, sei stato gentile/
// divertente/utile…". Qui li riepiloghiamo per tratto (conteggi). Le soglie dei
// badge di carattere (welcoming 5+, humor/contribution/kindness 10+) sono mostrate
// come piccolo progresso, così l'utente capisce cosa manca al prossimo badge.

import { StyleSheet, Text, View } from 'react-native';
import { AURA_TRAIT_COLOR, AURA_TRAIT_LABEL, type AuraTrait } from '@/constants/aura';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';

interface Props {
  /** conteggio prop ricevuti per tratto (da useReceivedProps) */
  counts: Partial<Record<AuraTrait, number>>;
}

/** Soglia del badge di carattere per tratto (null = nessun badge collegato). */
const BADGE_THRESHOLD: Partial<Record<AuraTrait, number>> = {
  welcoming: 5,
  humor: 10,
  contribution: 10,
  kindness: 10,
};

// Mostriamo solo i tratti che hanno un badge collegato (gli altri non hanno meta).
const SHOWN: AuraTrait[] = ['kindness', 'humor', 'welcoming', 'contribution'];

export function PropCard({ counts }: Props) {
  const total = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);

  if (total === 0) {
    return (
      <Text style={styles.empty}>
        Nessun prop ancora. Arrivano quando gli altri riconoscono i tuoi tratti.
      </Text>
    );
  }

  return (
    <View style={styles.list}>
      {SHOWN.map((trait) => {
        const n = counts[trait] ?? 0;
        const threshold = BADGE_THRESHOLD[trait];
        const reached = threshold != null && n >= threshold;
        return (
          <View key={trait} style={styles.row}>
            <View style={[styles.dot, { backgroundColor: AURA_TRAIT_COLOR[trait] }]} />
            <Text style={styles.label}>{AURA_TRAIT_LABEL[trait]}</Text>
            <Text style={styles.count}>{n}</Text>
            {threshold != null ? (
              <Text style={[styles.meta, reached && styles.metaReached]}>
                {reached ? 'badge sbloccato' : `${n}/${threshold}`}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: radius.full },
  label: { flex: 1, color: colors.ink, fontFamily: fontFamily.medium, fontSize: fontSize.sm },
  count: { color: colors.ink, fontFamily: fontFamily.semibold, fontSize: fontSize.base },
  meta: {
    width: 96,
    textAlign: 'right',
    color: colors.faint,
    fontFamily: fontFamily.medium,
    fontSize: fontSize.xs,
  },
  metaReached: { color: colors.success },
  empty: {
    color: colors.faint,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
});
