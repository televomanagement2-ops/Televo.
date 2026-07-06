// =============================================================================
// CommentoRow — un commento nel dettaglio drop (S3). Testo o vocale, con reply
// indentate di 1 livello (R-07). Contenuto, non contatore: mostra chi parla e
// cosa dice, mai cifre aggregate. Gli item ottimistici (outbox) arrivano con
// status pending/failed: la riga li segnala (opacità/errore); il menu Riprova/
// Elimina lo apre il parent al long-press (pattern bolla outbox chat).
// =============================================================================

import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '@/components/ui/Avatar';
import { CommentoVocale } from './CommentoVocale';
import { tempoRelativo } from '@/lib/datetime';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';

/** Forma unificata di un commento in lista: riga reale (server) o ottimistica
 *  (outbox). Per gli item audio pending il path non esiste ancora (upload in
 *  corso): si mostra un segnaposto invece del player. */
export interface CommentItem {
  /** id reale (uuid) o tempId ("temp-…") per gli item dell'outbox. */
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar: string | null;
  parentId: string | null;
  type: 'text' | 'audio';
  body: string | null;
  /** PATH storage del vocale (null finché non caricato / per il testo). */
  audioUrl: string | null;
  audioSeconds: number | null;
  createdAt: string;
  /** null = confermato dal server; altrimenti item ottimistico dell'outbox. */
  status: 'pending' | 'failed' | null;
  errorMessage?: string | null;
}

interface Props {
  item: CommentItem;
  /** Reply (parentId valorizzato): indentata sotto il proprio top-level. */
  isReply: boolean;
  /** Mostra l'azione "Rispondi" (solo top-level, drop vivo, item confermato). */
  canReply: boolean;
  onReply: (item: CommentItem) => void;
  onLongPress: (item: CommentItem) => void;
}

function CommentoRowComponent({ item, isReply, canReply, onReply, onLongPress }: Props) {
  const pending = item.status === 'pending';
  const failed = item.status === 'failed';

  return (
    <Pressable
      onLongPress={() => onLongPress(item)}
      delayLongPress={300}
      style={[styles.row, isReply && styles.reply, pending && styles.dim]}
    >
      <Avatar uri={item.authorAvatar} name={item.authorName} size={isReply ? 28 : 34} />
      <View style={styles.body}>
        <View style={styles.head}>
          <Text style={styles.nome} numberOfLines={1}>
            {item.authorName}
          </Text>
          <Text style={styles.tempo}>
            {pending ? 'invio…' : failed ? 'non inviato' : tempoRelativo(item.createdAt)}
          </Text>
        </View>

        {item.type === 'audio' ? (
          pending || !item.audioUrl ? (
            <View style={styles.audioStub}>
              <Ionicons name="mic" size={15} color={colors.muted} />
              <Text style={styles.audioStubText}>
                Vocale{item.audioSeconds ? ` · ${item.audioSeconds}s` : ''}
              </Text>
            </View>
          ) : (
            <CommentoVocale path={item.audioUrl} seconds={item.audioSeconds} />
          )
        ) : (
          <Text style={styles.testo}>{item.body}</Text>
        )}

        {failed ? (
          <Text style={styles.errore}>
            {item.errorMessage ?? 'Invio non riuscito'} · tieni premuto per riprovare
          </Text>
        ) : canReply ? (
          <Pressable hitSlop={6} onPress={() => onReply(item)} style={styles.rispondiBtn}>
            <Text style={styles.rispondi}>Rispondi</Text>
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.sm },
  // Reply: rientro + filo a sinistra che la lega al proprio top-level.
  reply: {
    marginLeft: spacing.xl,
    paddingLeft: spacing.md,
    borderLeftWidth: 2,
    borderLeftColor: colors.border,
  },
  dim: { opacity: 0.6 },
  body: { flex: 1, gap: 3 },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  nome: { color: colors.ink, fontSize: fontSize.sm, fontFamily: fontFamily.semibold, flexShrink: 1 },
  tempo: { color: colors.faint, fontSize: fontSize.xs, fontFamily: fontFamily.medium },
  testo: { color: colors.ink, fontSize: fontSize.base, fontFamily: fontFamily.sans, lineHeight: 21 },
  audioStub: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
    backgroundColor: colors.elevated,
    borderRadius: radius.full,
    paddingVertical: 5,
    paddingHorizontal: spacing.md,
  },
  audioStubText: { color: colors.muted, fontSize: fontSize.xs, fontFamily: fontFamily.medium },
  rispondiBtn: { alignSelf: 'flex-start', paddingVertical: 2 },
  rispondi: { color: colors.accentSoft, fontSize: fontSize.xs, fontFamily: fontFamily.semibold },
  errore: { color: colors.danger, fontSize: fontSize.xs, fontFamily: fontFamily.medium },
});

// Memo: la riga si ridisegna solo quando cambia il suo item (liste lunghe fluide).
export const CommentoRow = memo(CommentoRowComponent);
