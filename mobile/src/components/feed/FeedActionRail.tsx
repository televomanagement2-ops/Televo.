// =============================================================================
// FeedActionRail — la colonna di azioni sovrapposta a destra del media:
//   avatar + "+" (segui) · cuore (like) · commento · condividi.
// Per ora le azioni sono SOLO visive (haptic di cortesia, nessuna logica):
// la vera interazione arriva quando il feed sarà collegato ai dati reali.
// =============================================================================

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Avatar } from '@/components/ui/Avatar';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';

interface Props {
  avatarUrl?: string | null;
  username: string;
  likes: string;
  comments: string;
  shares: string;
}

/** Un'azione (icona + conteggio). onPress no-op con feedback aptico. */
function Action({
  icon,
  count,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  count: string;
}) {
  return (
    <Pressable
      style={styles.action}
      hitSlop={8}
      onPress={() => Haptics.selectionAsync().catch(() => {})}
    >
      <Ionicons name={icon} size={28} color="#ffffff" />
      <Text style={styles.count}>{count}</Text>
    </Pressable>
  );
}

export function FeedActionRail({ avatarUrl, username, likes, comments, shares }: Props) {
  return (
    <View style={styles.rail} pointerEvents="box-none">
      {/* Avatar con il "+" segui sovrapposto in basso */}
      <Pressable
        style={styles.followWrap}
        hitSlop={8}
        onPress={() => Haptics.selectionAsync().catch(() => {})}
      >
        <Avatar uri={avatarUrl} name={username} size={44} style={styles.followAvatar} />
        <View style={styles.followBadge}>
          <Ionicons name="add" size={14} color="#ffffff" />
        </View>
      </Pressable>

      <Action icon="heart-outline" count={likes} />
      <Action icon="chatbubble-outline" count={comments} />
      <Action icon="paper-plane-outline" count={shares} />
    </View>
  );
}

const styles = StyleSheet.create({
  rail: {
    position: 'absolute',
    right: spacing.md,
    bottom: spacing.lg,
    alignItems: 'center',
    gap: spacing.lg,
  },
  followWrap: { alignItems: 'center', marginBottom: spacing.xs },
  followAvatar: { borderWidth: 2, borderColor: '#ffffff' },
  followBadge: {
    position: 'absolute',
    bottom: -8,
    width: 22,
    height: 22,
    borderRadius: radius.full,
    backgroundColor: colors.accentDeep,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.base,
  },
  action: { alignItems: 'center', gap: 2 },
  count: {
    color: '#ffffff',
    fontSize: fontSize.xs,
    fontFamily: fontFamily.semibold,
  },
});
