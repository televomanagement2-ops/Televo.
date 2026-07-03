// =============================================================================
// MessaggioRow — riga di un messaggio nella conversazione.
// =============================================================================
// Gestisce allineamento (miei a destra / altrui a sinistra), il nome del mittente
// nei gruppi, il long-press (menu contestuale), il raggruppamento visivo delle
// bolle consecutive (CM2, RC-10), l'evidenziazione (scroll-to-quoted) e delega
// la bolla a BollaParlante. I messaggi failed rispondono anche al TAP semplice
// (apre Riprova/Elimina senza dover scoprire il long-press).
// CM4: modalità SELEZIONE (check sulla riga, tap = toggle, long-press spento) e
// CHIP delle reazioni sotto la bolla (raggruppate per emoji, la propria
// evidenziata, tap = toggle — RC-07).

import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BollaParlante, type QuotedRef, type SendStatus } from '@/components/chat/BollaParlante';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';
import type { MessageRow, ReactionRow } from '@/types';

interface Props {
  message: MessageRow;
  isMine: boolean;
  isGroup: boolean;
  senderName?: string | null;
  quoted?: QuotedRef | null;
  showTicks: boolean;
  readByPeer: boolean;
  /** Bolla consecutiva dello stesso mittente entro 2 min: margine ridotto. */
  grouped?: boolean;
  /** Evidenziata dopo lo scroll-to-quoted (flash temporaneo). */
  highlighted?: boolean;
  /** Invio ottimistico (CM2). */
  status?: SendStatus;
  audioSeconds?: number | null;
  /** Foto in coda d'invio (CM5): URI locale. */
  mediaLocalUri?: string | null;
  errorMessage?: string | null;
  /** Reazioni di QUESTO messaggio (CM4) — già filtrate dal chiamante. */
  reactions?: ReactionRow[];
  /** Il mio uid: evidenzia la mia reazione nelle chip. */
  myUid?: string | null;
  /** Modalità selezione multipla (CM4, RC-06). */
  selectionMode?: boolean;
  selected?: boolean;
  /** Tap in modalità selezione → toggle. */
  onPressRow?: (m: MessageRow) => void;
  onLongPress: (m: MessageRow) => void;
  /** Tap su una chip reazione → toggle della propria su quell'emoji. */
  onToggleReaction?: (m: MessageRow, emoji: string) => void;
  /** Tap sulla citazione → scroll al messaggio originale. */
  onQuotePress?: (m: MessageRow) => void;
  /** Tap sulla foto → viewer full-screen (CM5). */
  onMediaPress?: (m: MessageRow) => void;
}

function MessaggioRowBase({
  message,
  isMine,
  isGroup,
  senderName,
  quoted,
  showTicks,
  readByPeer,
  grouped,
  highlighted,
  status = null,
  audioSeconds,
  mediaLocalUri,
  errorMessage,
  reactions,
  myUid,
  selectionMode,
  selected,
  onPressRow,
  onLongPress,
  onToggleReaction,
  onQuotePress,
  onMediaPress,
}: Props) {
  // Chip: raggruppa per emoji → { emoji, count, mine } (ordine stabile per emoji).
  const chips = useMemo(() => {
    if (!reactions?.length) return [];
    const byEmoji = new Map<string, { count: number; mine: boolean }>();
    for (const r of reactions) {
      const cur = byEmoji.get(r.emoji) ?? { count: 0, mine: false };
      cur.count += 1;
      if (myUid && r.user_id === myUid) cur.mine = true;
      byEmoji.set(r.emoji, cur);
    }
    return [...byEmoji.entries()]
      .map(([emoji, v]) => ({ emoji, ...v }))
      .sort((a, b) => (a.emoji < b.emoji ? -1 : 1));
  }, [reactions, myUid]);

  return (
    <View
      style={[
        styles.row,
        isMine ? styles.rowMine : styles.rowTheirs,
        grouped && styles.rowGrouped,
        highlighted && styles.rowHighlighted,
        selected && styles.rowSelected,
      ]}
    >
      <View style={styles.col}>
        {isGroup && !isMine && senderName && !grouped ? (
          <Text style={styles.sender}>{senderName}</Text>
        ) : null}
        <Pressable
          onLongPress={selectionMode ? undefined : () => onLongPress(message)}
          onPress={
            selectionMode
              ? () => onPressRow?.(message)
              : status === 'failed'
                ? () => onLongPress(message)
                : undefined
          }
          delayLongPress={250}
        >
          <View style={styles.bubbleRow}>
            {selectionMode ? (
              <Ionicons
                name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                size={22}
                color={selected ? colors.accent : colors.faint}
                style={styles.selectIcon}
              />
            ) : null}
            <BollaParlante
              message={message}
              isMine={isMine}
              quoted={quoted}
              showTicks={showTicks}
              readByPeer={readByPeer}
              status={status}
              audioSeconds={audioSeconds}
              mediaLocalUri={mediaLocalUri}
              errorMessage={errorMessage}
              onQuotePress={
                onQuotePress && message.reply_to ? () => onQuotePress(message) : undefined
              }
              onMediaPress={
                // In modalità selezione il tap sulla riga fa il toggle, non il viewer.
                onMediaPress && !selectionMode ? () => onMediaPress(message) : undefined
              }
            />
          </View>
        </Pressable>
        {chips.length > 0 ? (
          <View style={[styles.chipsRow, isMine ? styles.chipsMine : styles.chipsTheirs]}>
            {chips.map((c) => (
              <Pressable
                key={c.emoji}
                onPress={() => onToggleReaction?.(message, c.emoji)}
                style={({ pressed }) => [
                  styles.chip,
                  c.mine && styles.chipMine,
                  pressed && styles.chipPressed,
                ]}
              >
                <Text style={styles.chipEmoji}>{c.emoji}</Text>
                {c.count > 1 ? <Text style={styles.chipCount}>{c.count}</Text> : null}
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

export const MessaggioRow = memo(MessaggioRowBase);

const styles = StyleSheet.create({
  // `width:'100%'` è essenziale: senza, la riga si stringe al contenuto e il
  // `maxWidth:'80%'` della bolla (BollaParlante) si calcola su una larghezza
  // collassata → bolle strette che vanno a capo a metà parola e si sovrappongono.
  // Con la riga a tutta larghezza, l'80% si riferisce allo schermo (corretto).
  row: { width: '100%', paddingHorizontal: spacing.lg, marginVertical: 3 },
  rowMine: { alignItems: 'flex-end' },
  rowTheirs: { alignItems: 'flex-start' },
  // Raggruppata alla precedente (stesso mittente <2 min): quasi attaccata.
  rowGrouped: { marginTop: -2 },
  // Flash del target dello scroll-to-quoted.
  rowHighlighted: { backgroundColor: 'rgba(90,120,255,0.14)', borderRadius: radius.md },
  // Selezionata (CM4): tinta leggera su tutta la riga.
  rowSelected: { backgroundColor: 'rgba(90,120,255,0.10)', borderRadius: radius.md },
  // Il tetto di larghezza della bolla vive QUI (80% della riga a tutta larghezza):
  // così l'80% si calcola su una base definita (lo schermo) e non su una larghezza
  // collassata. La bolla dentro riempie la colonna (maxWidth:'100%').
  col: { maxWidth: '80%' },
  bubbleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  selectIcon: { marginTop: 2 },
  sender: {
    color: colors.accentSoft,
    fontSize: fontSize.xs,
    fontFamily: fontFamily.semibold,
    marginBottom: 2,
    marginLeft: spacing.sm,
  },
  // Chip reazioni (CM4): sotto la bolla, dallo stesso lato.
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 3 },
  chipsMine: { justifyContent: 'flex-end' },
  chipsTheirs: { justifyContent: 'flex-start' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  chipMine: { borderColor: colors.accent, backgroundColor: 'rgba(90,120,255,0.15)' },
  chipPressed: { opacity: 0.7 },
  chipEmoji: { fontSize: 13 },
  chipCount: { color: colors.muted, fontSize: 11, fontFamily: fontFamily.semibold },
});
