// =============================================================================
// MessaggioRow — riga di un messaggio nella conversazione.
// =============================================================================
// Gestisce allineamento (miei a destra / altrui a sinistra), il nome del mittente
// nei gruppi, il long-press (menu contestuale), il raggruppamento visivo delle
// bolle consecutive (CM2, RC-10), l'evidenziazione (scroll-to-quoted) e delega
// la bolla a BollaParlante. I messaggi failed rispondono anche al TAP semplice
// (apre Riprova/Elimina senza dover scoprire il long-press).

import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BollaParlante, type QuotedRef, type SendStatus } from '@/components/chat/BollaParlante';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';
import type { MessageRow } from '@/types';

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
  errorMessage?: string | null;
  onLongPress: (m: MessageRow) => void;
  /** Tap sulla citazione → scroll al messaggio originale. */
  onQuotePress?: (m: MessageRow) => void;
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
  errorMessage,
  onLongPress,
  onQuotePress,
}: Props) {
  return (
    <View
      style={[
        styles.row,
        isMine ? styles.rowMine : styles.rowTheirs,
        grouped && styles.rowGrouped,
        highlighted && styles.rowHighlighted,
      ]}
    >
      <View style={styles.col}>
        {isGroup && !isMine && senderName && !grouped ? (
          <Text style={styles.sender}>{senderName}</Text>
        ) : null}
        <Pressable
          onLongPress={() => onLongPress(message)}
          // I failed si aprono anche con un tap (retry veloce).
          onPress={status === 'failed' ? () => onLongPress(message) : undefined}
          delayLongPress={250}
        >
          <BollaParlante
            message={message}
            isMine={isMine}
            quoted={quoted}
            showTicks={showTicks}
            readByPeer={readByPeer}
            status={status}
            audioSeconds={audioSeconds}
            errorMessage={errorMessage}
            onQuotePress={
              onQuotePress && message.reply_to ? () => onQuotePress(message) : undefined
            }
          />
        </Pressable>
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
  // Il tetto di larghezza della bolla vive QUI (80% della riga a tutta larghezza):
  // così l'80% si calcola su una base definita (lo schermo) e non su una larghezza
  // collassata. La bolla dentro riempie la colonna (maxWidth:'100%').
  col: { maxWidth: '80%' },
  sender: {
    color: colors.accentSoft,
    fontSize: fontSize.xs,
    fontFamily: fontFamily.semibold,
    marginBottom: 2,
    marginLeft: spacing.sm,
  },
});
