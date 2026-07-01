// =============================================================================
// FeedLiveCard — la card "LIVE" in fondo al feed: una stanza audio in corso.
// Layout orizzontale, compatto: badge LIVE rosso + avatar con anello + nome (✓) +
// luogo + spettatori + bottone "Entra". È a sé rispetto a FeedCard (forma diversa:
// niente rail azioni, niente caption). Per ora segnaposto, nessun join reale.
// =============================================================================

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Avatar } from '@/components/ui/Avatar';
import { FEED_LIVE } from '@/constants/feedItems';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';

export function FeedLiveCard() {
  const live = FEED_LIVE;

  return (
    <View style={styles.card}>
      {/* Avatar con anello rosso + badge LIVE */}
      <View style={styles.avatarWrap}>
        <Avatar uri={live.avatarUrl} name={live.title} size={48} style={styles.avatar} />
        <View style={styles.liveBadge}>
          <Text style={styles.liveText}>LIVE</Text>
        </View>
      </View>

      {/* Testo: titolo + luogo + spettatori */}
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>
            {live.title}
          </Text>
          {live.verified ? (
            <Ionicons name="checkmark-circle" size={15} color={colors.accent} />
          ) : null}
        </View>
        <Text style={styles.place} numberOfLines={1}>
          {live.place}
        </Text>
        <View style={styles.watchRow}>
          <View style={styles.liveDot} />
          <Text style={styles.watch}>{live.watching} stanno guardando</Text>
        </View>
      </View>

      {/* Bottone Entra (no-op per ora) */}
      <Pressable
        style={({ pressed }) => [styles.enter, pressed && styles.enterPressed]}
        onPress={() => Haptics.selectionAsync().catch(() => {})}
      >
        <Text style={styles.enterLabel}>Entra</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    padding: spacing.md,
  },
  avatarWrap: { alignItems: 'center' },
  avatar: { borderWidth: 2, borderColor: colors.danger },
  liveBadge: {
    position: 'absolute',
    top: -6,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.full,
    backgroundColor: colors.danger,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  liveText: { color: '#ffffff', fontSize: 9, fontFamily: fontFamily.semibold, letterSpacing: 0.5 },
  body: { flex: 1, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  title: { color: colors.ink, fontSize: fontSize.base, fontFamily: fontFamily.semibold, flexShrink: 1 },
  place: { color: colors.muted, fontSize: fontSize.sm, fontFamily: fontFamily.sans },
  watchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: 2 },
  liveDot: { width: 6, height: 6, borderRadius: radius.full, backgroundColor: colors.danger },
  watch: { color: colors.muted, fontSize: fontSize.xs, fontFamily: fontFamily.medium },
  enter: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  enterPressed: { opacity: 0.8 },
  enterLabel: { color: colors.ink, fontSize: fontSize.sm, fontFamily: fontFamily.semibold },
});
