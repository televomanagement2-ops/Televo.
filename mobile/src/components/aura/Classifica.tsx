// =============================================================================
// Classifica — la posizione dell'utente nelle classifiche per carattere/scuola.
// =============================================================================
// Le classifiche premiano il CARATTERE (Most Kind, Best Humor…), non la
// popolarità. Qui mostriamo le posizioni dell'utente; la lista completa è una
// schermata a parte (prossima milestone). Componente "stupido": riceve già le
// posizioni calcolate dagli hook (useMyRank/useSchoolRank).

import { StyleSheet, Text, View } from 'react-native';
import { AURA_TRAIT_COLOR, LEADERBOARD_LABEL, type AuraTrait } from '@/constants/aura';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';

export interface RankRow {
  trait: AuraTrait;
  rank: number | null;
}

interface Props {
  /** posizioni per carattere (solo i tratti con classifica) */
  characterRanks: RankRow[];
  /** posizione nella classifica scuola (null se senza scuola/non in classifica) */
  schoolRank?: number | null;
  schoolName?: string | null;
}

export function Classifica({ characterRanks, schoolRank, schoolName }: Props) {
  const ranked = characterRanks.filter((r) => r.rank !== null);

  if (ranked.length === 0 && (schoolRank == null)) {
    return (
      <Text style={styles.empty}>
        Non sei ancora in classifica. Ricevi prop dai tuoi tratti per scalare.
      </Text>
    );
  }

  return (
    <View style={styles.list}>
      {ranked.map(({ trait, rank }) => (
        <View key={trait} style={styles.row}>
          <View style={[styles.dot, { backgroundColor: AURA_TRAIT_COLOR[trait] }]} />
          <Text style={styles.label}>{LEADERBOARD_LABEL[trait as keyof typeof LEADERBOARD_LABEL] ?? trait}</Text>
          <Text style={styles.rank}>#{rank}</Text>
        </View>
      ))}
      {schoolRank != null ? (
        <View style={styles.row}>
          <View style={[styles.dot, { backgroundColor: colors.accent }]} />
          <Text style={styles.label}>{schoolName ? `Scuola · ${schoolName}` : 'La tua scuola'}</Text>
          <Text style={styles.rank}>#{schoolRank}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: radius.full },
  label: { flex: 1, color: colors.ink, fontFamily: fontFamily.medium, fontSize: fontSize.sm },
  rank: { color: colors.ink, fontFamily: fontFamily.semibold, fontSize: fontSize.base },
  empty: {
    color: colors.faint,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
});
