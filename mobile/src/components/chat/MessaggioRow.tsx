// =============================================================================
// MessaggioRow — riga di un messaggio nella conversazione.
// =============================================================================
// Gestisce allineamento (miei a destra / altrui a sinistra), il nome del mittente
// nei gruppi, il long-press (menu contestuale) e delega la bolla a BollaParlante.

import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BollaParlante, type QuotedRef } from '@/components/chat/BollaParlante';
import { colors, fontFamily, fontSize, spacing } from '@/constants/theme';
import type { MessageRow } from '@/types';

interface Props {
  message: MessageRow;
  isMine: boolean;
  isGroup: boolean;
  senderName?: string | null;
  quoted?: QuotedRef | null;
  showTicks: boolean;
  readByPeer: boolean;
  onLongPress: (m: MessageRow) => void;
}

function MessaggioRowBase({
  message,
  isMine,
  isGroup,
  senderName,
  quoted,
  showTicks,
  readByPeer,
  onLongPress,
}: Props) {
  return (
    <View style={[styles.row, isMine ? styles.rowMine : styles.rowTheirs]}>
      <View style={styles.col}>
        {isGroup && !isMine && senderName ? (
          <Text style={styles.sender}>{senderName}</Text>
        ) : null}
        <Pressable onLongPress={() => onLongPress(message)} delayLongPress={250}>
          <BollaParlante
            message={message}
            isMine={isMine}
            quoted={quoted}
            showTicks={showTicks}
            readByPeer={readByPeer}
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
