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
  row: { paddingHorizontal: spacing.lg, marginVertical: 3 },
  rowMine: { alignItems: 'flex-end' },
  rowTheirs: { alignItems: 'flex-start' },
  col: { maxWidth: '100%' },
  sender: {
    color: colors.accentSoft,
    fontSize: fontSize.xs,
    fontFamily: fontFamily.semibold,
    marginBottom: 2,
    marginLeft: spacing.sm,
  },
});
