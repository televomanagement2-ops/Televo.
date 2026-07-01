// =============================================================================
// FeedCard — la card grande del feed "Discover" (stile feed sociale). Struttura:
//   header: avatar + username + ✓ verificato + tempo + "…"
//   media:  blocco grigio segnaposto (MediaPlaceholder) con la rail azioni sopra
//   footer: caption + hashtag (viola) + tag musicale + "…" + dots
// È UNICA per tutti i tipi: la varianza per `kind` sta solo nel chip del media e
// nel colore dell'hashtag (dal meta del tipo). Niente dati reali in questo round.
// =============================================================================

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Avatar } from '@/components/ui/Avatar';
import { MediaPlaceholder } from './MediaPlaceholder';
import { FeedActionRail } from './FeedActionRail';
import { FeedPaginationDots } from './FeedPaginationDots';
import { FEED_KIND_META, type FeedItem } from '@/constants/feedItems';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';

export function FeedCard({ item }: { item: FeedItem }) {
  const accent = FEED_KIND_META[item.kind].accent;

  return (
    <View style={styles.card}>
      {/* Header: chi ha pubblicato */}
      <View style={styles.header}>
        <Avatar uri={item.avatarUrl} name={item.username} size={36} />
        <View style={styles.headerText}>
          <View style={styles.nameRow}>
            <Text style={styles.username} numberOfLines={1}>
              {item.username}
            </Text>
            {item.verified ? (
              <Ionicons name="checkmark-circle" size={15} color={colors.accent} />
            ) : null}
          </View>
          <Text style={styles.time}>{item.timeAgo}</Text>
        </View>
        <Pressable hitSlop={8} onPress={() => Haptics.selectionAsync().catch(() => {})}>
          <Ionicons name="ellipsis-horizontal" size={20} color={colors.muted} />
        </Pressable>
      </View>

      {/* Media segnaposto + rail azioni sovrapposta */}
      <View style={styles.mediaWrap}>
        <MediaPlaceholder kind={item.kind} />
        <FeedActionRail
          avatarUrl={item.avatarUrl}
          username={item.username}
          likes={item.likes}
          comments={item.comments}
          shares={item.shares}
        />
      </View>

      {/* Footer: caption, hashtag, musica, dots */}
      <View style={styles.footer}>
        <View style={styles.footerRow}>
          <View style={styles.footerText}>
            <Text style={styles.caption}>{item.caption}</Text>
            <Text style={[styles.hashtag, { color: accent }]}>{item.hashtag}</Text>
          </View>
          <Pressable hitSlop={8} onPress={() => Haptics.selectionAsync().catch(() => {})}>
            <Ionicons name="ellipsis-horizontal" size={18} color={colors.muted} />
          </Pressable>
        </View>

        {item.music ? (
          <View style={styles.musicRow}>
            <Ionicons name="musical-notes" size={13} color={colors.muted} />
            <Text style={styles.music} numberOfLines={1}>
              {item.music}
            </Text>
          </View>
        ) : null}

        <FeedPaginationDots count={item.pages} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    padding: spacing.md,
    gap: spacing.md,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerText: { flex: 1, gap: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  username: { color: colors.ink, fontSize: fontSize.base, fontFamily: fontFamily.semibold },
  time: { color: colors.faint, fontSize: fontSize.xs, fontFamily: fontFamily.medium },
  mediaWrap: { position: 'relative' },
  footer: { gap: spacing.sm },
  footerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  footerText: { flex: 1, gap: 2 },
  caption: { color: colors.ink, fontSize: fontSize.sm, fontFamily: fontFamily.medium },
  hashtag: { fontSize: fontSize.sm, fontFamily: fontFamily.medium },
  musicRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  music: { color: colors.muted, fontSize: fontSize.xs, fontFamily: fontFamily.medium, flex: 1 },
});
