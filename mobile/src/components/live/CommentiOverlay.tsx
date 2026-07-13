// =============================================================================
// CommentiOverlay — lista commenti a scorrimento in basso a sinistra (M12/LM6).
// =============================================================================
// FlatList `inverted` con viewport ad altezza cap (~7 righe): il più nuovo
// entra in basso, il più vecchio ESCE SCORRENDO quando ne arriva uno nuovo —
// niente sparizione a tempo. I vecchi restano raggiungibili scrollando, fino
// al tetto in memoria di useLive (50). La riga resta a DB per la finestra di
// moderazione (purge server-side a 24h dalla fine). Il fading edge in cima è
// solo polish visivo (dissolvenza dei più vecchi), non logica.
// Long-press su un commento ALTRUI → segnalazione (il parent apre il menu).

import { memo, useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Avatar } from '@/components/ui/Avatar';
import type { CommentoLive } from '@/hooks/useLive';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';

/** Quota di schermo occupabile dalla lista (~7 righe visibili). */
const QUOTA_ALTEZZA = 0.38;
/** Ampiezza della dissolvenza dei commenti più vecchi in cima. */
const FADE_CIMA = 56;

interface Props {
  commenti: CommentoLive[];
  /** Long-press su un commento non proprio (segnalazione, live.md §11). */
  onSegnala?: (commento: CommentoLive) => void;
}

export function CommentiOverlay({ commenti, onSegnala }: Props) {
  const { height: altezzaSchermo } = useWindowDimensions();

  // La lista inverted vuole il più nuovo a indice 0 (= in basso, offset 0):
  // useLive accoda i nuovi in fondo, quindi si rovescia una volta per render.
  const dati = useMemo(() => [...commenti].reverse(), [commenti]);
  if (dati.length === 0) return null;

  return (
    <FlatList
      data={dati}
      keyExtractor={(c) => c.id}
      renderItem={({ item }) => <RigaCommento commento={item} onSegnala={onSegnala} />}
      inverted
      style={[styles.lista, { maxHeight: Math.round(altezzaSchermo * QUOTA_ALTEZZA) }]}
      contentContainerStyle={styles.contenuto}
      showsVerticalScrollIndicator={false}
      fadingEdgeLength={FADE_CIMA}
      keyboardShouldPersistTaps="handled"
    />
  );
}

const RigaCommento = memo(function RigaCommento({
  commento,
  onSegnala,
}: {
  commento: CommentoLive;
  onSegnala?: (commento: CommentoLive) => void;
}) {
  return (
    <Animated.View entering={FadeInDown.duration(220)}>
      <Pressable
        style={styles.riga}
        onLongPress={commento.mio || !onSegnala ? undefined : () => onSegnala(commento)}
        delayLongPress={350}
      >
        <Avatar uri={commento.avatarUrl} name={commento.nome} size={26} />
        <View style={styles.testi}>
          <Text style={styles.nome} numberOfLines={1}>
            {commento.nome}
          </Text>
          <Text style={styles.body}>{commento.body}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  lista: { flexGrow: 0, maxWidth: '80%' },
  contenuto: { gap: spacing.xs },
  riga: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignSelf: 'flex-start',
  },
  testi: { flexShrink: 1, gap: 1 },
  nome: { color: colors.muted, fontSize: fontSize.xs, fontFamily: fontFamily.semibold },
  body: {
    color: colors.ink,
    fontSize: fontSize.sm,
    fontFamily: fontFamily.sans,
    lineHeight: 19,
  },
});
