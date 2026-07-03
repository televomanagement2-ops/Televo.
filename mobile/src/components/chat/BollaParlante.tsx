// =============================================================================
// BollaParlante — la bolla di un messaggio (presentazionale).
// =============================================================================
// Testo (con linkify degli URL), citazione della risposta (tappabile →
// scroll-to-quoted), orario, spunte di lettura e stati d'invio ottimistico
// (CM2): pending = orologio, failed = avviso rosso con motivo. I vocali in
// invio mostrano un placeholder (il player vero serve il path remoto).
// Allineamento e long-press sono gestiti da MessaggioRow; qui solo il contenuto.

import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BollaMedia } from '@/components/chat/BollaMedia';
import { PlayerVocale } from '@/components/chat/PlayerVocale';
import { timeHHmm } from '@/lib/datetime';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';
import type { MessageRow } from '@/types';

export interface QuotedRef {
  author: string | null;
  text: string;
}

/** Stato d'invio ottimistico della bolla (null = messaggio confermato). */
export type SendStatus = 'pending' | 'failed' | null;

interface Props {
  message: MessageRow;
  isMine: boolean;
  quoted?: QuotedRef | null;
  /** DM: mostra le spunte sui miei messaggi. */
  showTicks: boolean;
  /** peer.last_read_at ≥ created_at → doppia spunta (letto). */
  readByPeer: boolean;
  /** Invio ottimistico (CM2): pending/failed. */
  status?: SendStatus;
  /** Durata del vocale in coda d'invio (placeholder, niente player). */
  audioSeconds?: number | null;
  /** Foto in coda d'invio (CM5): URI locale mostrata con overlay upload. */
  mediaLocalUri?: string | null;
  /** Motivo del fallimento (mostrato sotto il contenuto quando failed). */
  errorMessage?: string | null;
  /** Tap sulla citazione → scroll al messaggio originale. */
  onQuotePress?: () => void;
  /** Tap sulla foto → viewer full-screen (solo messaggi confermati). */
  onMediaPress?: () => void;
}

/** secondi → "m:ss" (per il placeholder del vocale in invio). */
function mmss(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Cattura gli URL http/https nel testo (linkify, RC-10).
const URL_SPLIT_RE = /(https?:\/\/[^\s]+)/g;

/** Corpo testuale con gli URL tappabili (apre il browser). */
function TestoConLink({ body, isMine }: { body: string; isMine: boolean }) {
  const parti = body.split(URL_SPLIT_RE);
  return (
    <Text style={[styles.body, isMine && styles.bodyMine]}>
      {parti.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <Text
            key={`${i}-${p}`}
            style={[styles.link, isMine && styles.linkMine]}
            onPress={() => Linking.openURL(p).catch(() => {})}
          >
            {p}
          </Text>
        ) : (
          p
        ),
      )}
    </Text>
  );
}

export function BollaParlante({
  message,
  isMine,
  quoted,
  showTicks,
  readByPeer,
  status = null,
  audioSeconds,
  mediaLocalUri,
  errorMessage,
  onQuotePress,
  onMediaPress,
}: Props) {
  const deleted = !!message.deleted_at;
  // Foto (CM5): la thumbnail rompe il padding della bolla (edge-to-edge nel
  // border radius); caption, errori e footer stanno in una sub-view che
  // riprende il padding normale.
  const isMedia = message.type === 'media' && !deleted;

  return (
    <View
      style={[styles.bubble, isMine ? styles.mine : styles.theirs, isMedia && styles.bubbleMedia]}
    >
      {message.forwarded_from && !deleted ? (
        // Inoltro (CM4, RC-06): provenienza sempre dichiarata (trasparenza).
        <View style={[styles.forwarded, isMedia && styles.mediaPad]}>
          <Ionicons
            name="arrow-redo-outline"
            size={12}
            color={isMine ? 'rgba(255,255,255,0.7)' : colors.muted}
          />
          <Text style={[styles.forwardedText, isMine && styles.forwardedTextMine]}>Inoltrato</Text>
        </View>
      ) : null}
      {quoted ? (
        <Pressable
          onPress={onQuotePress}
          disabled={!onQuotePress}
          style={[
            styles.quote,
            isMine ? styles.quoteMine : styles.quoteTheirs,
            isMedia && styles.mediaPad,
          ]}
        >
          {quoted.author ? <Text style={styles.quoteAuthor}>{quoted.author}</Text> : null}
          <Text style={styles.quoteText} numberOfLines={1}>
            {quoted.text}
          </Text>
        </Pressable>
      ) : null}

      {deleted ? (
        <Text style={[styles.body, styles.deleted, isMine && styles.bodyMine]}>
          Messaggio eliminato
        </Text>
      ) : message.type === 'text' ? (
        <TestoConLink body={message.body ?? ''} isMine={isMine} />
      ) : message.type === 'media' ? (
        // Foto (CM5): thumbnail (+ caption opzionale). In coda d'invio mostra
        // il file locale; il viewer si apre solo sui messaggi confermati.
        <>
          <BollaMedia
            path={message.media_url}
            localUri={status ? mediaLocalUri : null}
            uploading={status === 'pending'}
            isMine={isMine}
            onPress={status ? undefined : onMediaPress}
          />
          {message.body ? (
            <View style={styles.mediaPad}>
              <TestoConLink body={message.body} isMine={isMine} />
            </View>
          ) : null}
        </>
      ) : message.type === 'audio' || message.type === 'voice_thread' ? (
        status ? (
          // Vocale ancora in coda: il file è locale → placeholder senza player.
          <View style={styles.audioPending}>
            <Ionicons name="mic" size={18} color={isMine ? '#ffffff' : colors.ink} />
            <Text style={[styles.body, isMine && styles.bodyMine]}>
              Vocale {audioSeconds != null ? mmss(audioSeconds) : ''}
            </Text>
          </View>
        ) : (
          <PlayerVocale path={message.audio_url} isMine={isMine} expiresAt={message.expires_at} />
        )
      ) : (
        <Text style={[styles.body, isMine && styles.bodyMine]}>Messaggio</Text>
      )}

      {status === 'failed' && errorMessage ? (
        <Text style={[styles.errorText, isMedia && styles.mediaPad]}>{errorMessage}</Text>
      ) : null}

      <View style={[styles.footer, isMedia && styles.mediaPad]}>
        {message.edited_at && !deleted ? (
          // Edit tracciato (RC-05/R-15): l'indicatore è SEMPRE visibile.
          <Text style={[styles.time, isMine && styles.timeMine]}>modificato</Text>
        ) : null}
        <Text style={[styles.time, isMine && styles.timeMine]}>{timeHHmm(message.created_at)}</Text>
        {status === 'pending' ? (
          <Ionicons name="time-outline" size={13} color="rgba(255,255,255,0.7)" />
        ) : status === 'failed' ? (
          <Ionicons name="alert-circle" size={14} color={colors.danger} />
        ) : showTicks && isMine && !deleted ? (
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
    // Il tetto di larghezza (80%) è imposto dalla colonna in MessaggioRow; qui la
    // bolla riempie la colonna. `alignSelf:'flex-start'` evita che si stiri a
    // tutta larghezza per i messaggi corti (deve avvolgere il testo).
    maxWidth: '100%',
    alignSelf: 'flex-start',
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  // Bolla-foto: cornice sottile attorno alla thumbnail (edge-to-edge); gli
  // elementi testuali riprendono il rientro con mediaPad.
  bubbleMedia: { paddingHorizontal: 4, paddingTop: 4, paddingBottom: 6 },
  mediaPad: { marginHorizontal: spacing.md - 4 },
  mine: { backgroundColor: colors.accentDeep, borderTopRightRadius: 6 },
  theirs: {
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  body: { color: colors.ink, fontSize: fontSize.base, fontFamily: fontFamily.sans, lineHeight: 21 },
  bodyMine: { color: '#ffffff' },
  deleted: { fontStyle: 'italic', color: colors.muted },
  link: { textDecorationLine: 'underline', color: colors.accentSoft },
  linkMine: { color: '#dbe6ff' },
  audioPending: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 2 },
  errorText: { color: colors.danger, fontSize: fontSize.xs, fontFamily: fontFamily.sans },
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
  forwarded: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  forwardedText: {
    color: colors.muted,
    fontSize: fontSize.xs,
    fontFamily: fontFamily.sans,
    fontStyle: 'italic',
  },
  forwardedTextMine: { color: 'rgba(255,255,255,0.7)' },
});
