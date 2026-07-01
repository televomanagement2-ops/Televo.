// =============================================================================
// ConversazioneRow — una riga della lista chat (hub Messaggi).
// =============================================================================
// Avatar (peer per DM), titolo, anteprima ultimo messaggio, orario, badge non
// letti e streak. Tap → apre la conversazione.

import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import { StreakBadge } from '@/components/chat/StreakBadge';
import { previewText } from '@/lib/chat';
import { hubTimestamp } from '@/lib/datetime';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';
import type { ConversationPreview } from '@/types';

interface Props {
  conv: ConversationPreview;
  onPress: () => void;
  /** Long-press → menu contestuale conversazione (S16-bis). */
  onLongPress?: () => void;
}

export function ConversazioneRow({ conv, onPress, onLongPress }: Props) {
  // Se silenziata, il badge unread resta discreto (nessuna enfasi ansiogena).
  const hasUnread = conv.unreadCount > 0;
  return (
    <Card onPress={onPress} onLongPress={onLongPress} style={styles.card}>
      <View style={styles.row}>
        <Avatar uri={conv.avatarUrl} name={conv.title} size={52} />
        <View style={styles.body}>
          <View style={styles.topRow}>
            {conv.pinnedAt ? (
              <Ionicons name="pin" size={13} color={colors.faint} style={styles.pin} />
            ) : null}
            <Text style={styles.title} numberOfLines={1}>
              {conv.title}
            </Text>
            <Text style={[styles.time, hasUnread && !conv.muted && styles.timeUnread]}>
              {conv.lastMessage ? hubTimestamp(conv.lastMessage.created_at) : ''}
            </Text>
          </View>
          <View style={styles.bottomRow}>
            <Text style={[styles.preview, hasUnread && !conv.muted && styles.previewUnread]} numberOfLines={1}>
              {previewText(conv.lastMessage)}
            </Text>
            <View style={styles.badges}>
              {conv.muted ? (
                <Ionicons name="notifications-off" size={14} color={colors.faint} />
              ) : null}
              {conv.streak ? <StreakBadge count={conv.streak} compact /> : null}
              {hasUnread ? (
                <View style={[styles.unread, conv.muted && styles.unreadMuted]}>
                  <Text style={styles.unreadText}>{conv.unreadCount > 99 ? '99+' : conv.unreadCount}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  body: { flex: 1, gap: 4 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  pin: { marginRight: -4 },
  title: { flex: 1, color: colors.ink, fontSize: fontSize.base, fontFamily: fontFamily.semibold },
  time: { color: colors.faint, fontSize: fontSize.xs, fontFamily: fontFamily.sans },
  timeUnread: { color: colors.accentSoft },
  bottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  preview: { flex: 1, color: colors.muted, fontSize: fontSize.sm, fontFamily: fontFamily.sans },
  previewUnread: { color: colors.ink },
  badges: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  unread: {
    minWidth: 20,
    height: 20,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadMuted: { backgroundColor: colors.faint },
  unreadText: { color: '#ffffff', fontSize: 11, fontFamily: fontFamily.semibold },
});
