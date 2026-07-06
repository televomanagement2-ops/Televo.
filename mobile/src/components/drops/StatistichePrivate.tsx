// =============================================================================
// StatistichePrivate — il pannello dei numeri VISIBILE SOLO ALL'AUTORE (S3,
// R-04/D-2). Tutta la gratificazione, zero vetrina: like (con CHI), commenti,
// salvataggi (solo il numero, mai chi — R-14), reaction per tratto. Un
// non-autore non arriva mai qui (la RPC non valorizza i contatori e la RLS non
// mostra i liker). Alla scadenza gli stessi numeri vengono congelati nei Ricordi.
// =============================================================================

import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '@/components/ui/Avatar';
import { DROP_REACTION_EMOJI } from '@/constants/drops';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';
import type { DropFeedRow, DropLiker, DropReactionTrait } from '@/types/supabase';

interface Props {
  row: DropFeedRow;
  /** Chi ha messo like (solo per l'autore): avatar in fila. */
  likers: DropLiker[] | undefined;
}

/** Quanti avatar di liker mostrare prima del "+N". */
const MAX_LIKER_AVATARS = 6;

export function StatistichePrivate({ row, likers }: Props) {
  const reazioni = row.reaction_counts ?? {};
  const reazioniAttive = (Object.keys(reazioni) as DropReactionTrait[]).filter(
    (t) => (reazioni[t] ?? 0) > 0,
  );
  const visibili = likers?.slice(0, MAX_LIKER_AVATARS) ?? [];
  const extra = (likers?.length ?? 0) - visibili.length;

  return (
    <View style={styles.card}>
      <View style={styles.titleRow}>
        <Ionicons name="lock-closed" size={13} color={colors.muted} />
        <Text style={styles.title}>Solo per te</Text>
      </View>

      <View style={styles.stats}>
        <Stat icon="heart" value={row.like_count} tint={colors.danger} />
        <Stat icon="chatbubble" value={row.comment_count} />
        <Stat icon="bookmark" value={row.save_count} tint={colors.accentSoft} />
        {reazioniAttive.map((t) => (
          <View key={t} style={styles.stat}>
            <Text style={styles.emoji}>{DROP_REACTION_EMOJI[t]}</Text>
            <Text style={styles.num}>{reazioni[t]}</Text>
          </View>
        ))}
      </View>

      {/* Chi ha messo like (R-04: i salvataggi NON hanno l'equivalente, R-14). */}
      {visibili.length > 0 ? (
        <View style={styles.likers}>
          {visibili.map((l) => (
            <View key={l.user_id} style={styles.likerAvatar}>
              <Avatar
                uri={l.user.avatar_url}
                name={l.user.display_name?.trim() || l.user.username}
                size={26}
              />
            </View>
          ))}
          {extra > 0 ? <Text style={styles.extra}>+{extra}</Text> : null}
          <Text style={styles.likersLabel}>hanno messo like</Text>
        </View>
      ) : null}
    </View>
  );
}

function Stat({
  icon,
  value,
  tint,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  value: number | null;
  tint?: string;
}) {
  return (
    <View style={styles.stat}>
      <Ionicons name={icon} size={16} color={tint ?? colors.muted} />
      <Text style={styles.num}>{value ?? 0}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  title: { color: colors.muted, fontSize: fontSize.xs, fontFamily: fontFamily.semibold, textTransform: 'uppercase', letterSpacing: 0.5 },
  stats: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.lg },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  emoji: { fontSize: 15 },
  num: { color: colors.ink, fontSize: fontSize.sm, fontFamily: fontFamily.semibold },
  likers: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  // Avatar leggermente sovrapposti (stile "chi c'è").
  likerAvatar: { marginRight: -6 },
  extra: { color: colors.muted, fontSize: fontSize.xs, fontFamily: fontFamily.semibold, marginLeft: spacing.sm },
  likersLabel: { color: colors.faint, fontSize: fontSize.xs, fontFamily: fontFamily.medium, marginLeft: spacing.xs },
});
