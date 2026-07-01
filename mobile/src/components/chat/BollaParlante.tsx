// =============================================================================
// BollaParlante — la bolla di un messaggio (presentazionale).
// =============================================================================
// Testo, citazione della risposta, orario e spunte di lettura. I vocali/media
// hanno per ora un placeholder (player veri in M2/M6). Allineamento e long-press
// sono gestiti da MessaggioRow; qui solo il contenuto della bolla.

import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PlayerVocale } from '@/components/chat/PlayerVocale';
import { timeHHmm } from '@/lib/datetime';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';
import type { MessageRow } from '@/types';

export interface QuotedRef {
  author: string | null;
  text: string;
}

interface Props {
  message: MessageRow;
  isMine: boolean;
  quoted?: QuotedRef | null;
  /** DM: mostra le spunte sui miei messaggi. */
  showTicks: boolean;
  /** peer.last_read_at ≥ created_at → doppia spunta (letto). */
  readByPeer: boolean;
}

export function BollaParlante({ message, isMine, quoted, showTicks, readByPeer }: Props) {
  const deleted = !!message.deleted_at;

  return (
    <View style={[styles.bubble, isMine ? styles.mine : styles.theirs]}>
      {quoted ? (
        <View style={[styles.quote, isMine ? styles.quoteMine : styles.quoteTheirs]}>
          {quoted.author ? <Text style={styles.quoteAuthor}>{quoted.author}</Text> : null}
          <Text style={styles.quoteText} numberOfLines={1}>
            {quoted.text}
          </Text>
        </View>
      ) : null}

      {deleted ? (
        <Text style={[styles.body, styles.deleted, isMine && styles.bodyMine]}>
          Messaggio eliminato
        </Text>
      ) : message.type === 'text' ? (
        <Text style={[styles.body, isMine && styles.bodyMine]}>{message.body}</Text>
      ) : message.type === 'audio' || message.type === 'voice_thread' ? (
        <PlayerVocale path={message.audio_url} isMine={isMine} expiresAt={message.expires_at} />
      ) : (
        <Text style={[styles.body, isMine && styles.bodyMine]}>Messaggio</Text>
      )}

      <View style={styles.footer}>
        <Text style={[styles.time, isMine && styles.timeMine]}>{timeHHmm(message.created_at)}</Text>
        {showTicks && isMine && !deleted ? (
          <Ionicons
            name={readByPeer ? 'checkmark-done' : 'checkmark'}
            size={14}
            color={readByPeer ? colors.accentSoft : 'rgba(255,255,255,0.7)'}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    maxWidth: '80%',
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  mine: { backgroundColor: colors.accentDeep, borderTopRightRadius: 6 },
  theirs: {
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  body: { color: colors.ink, fontSize: fontSize.base, fontFamily: fontFamily.sans, lineHeight: 21 },
  bodyMine: { color: '#ffffff' },
  deleted: { fontStyle: 'italic', color: colors.muted },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  time: { color: colors.faint, fontSize: 11, fontFamily: fontFamily.sans },
  timeMine: { color: 'rgba(255,255,255,0.7)' },
  quote: {
    borderLeftWidth: 3,
    paddingLeft: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  quoteMine: { borderLeftColor: colors.accentSoft, backgroundColor: 'rgba(255,255,255,0.10)' },
  quoteTheirs: { borderLeftColor: colors.accent, backgroundColor: 'rgba(255,255,255,0.04)' },
  quoteAuthor: { color: colors.accentSoft, fontSize: fontSize.xs, fontFamily: fontFamily.semibold },
  quoteText: { color: colors.muted, fontSize: fontSize.sm, fontFamily: fontFamily.sans },
});
