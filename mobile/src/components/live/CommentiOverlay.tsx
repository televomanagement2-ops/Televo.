// =============================================================================
// CommentiOverlay — colonna commenti effimeri in basso a sinistra (M12 / LM6).
// =============================================================================
// I commenti appaiono e dopo alcuni secondi SFUMANO per non sporcare lo schermo
// (live.md §6). Il fade è SOLO visivo: la riga resta a DB per la finestra di
// moderazione (purge server-side a 24h dalla fine). La finestra di scadenza
// parte dall'ARRIVO sul device (mount della riga), non da created_at: niente
// dipendenza dal clock del telefono.
// Long-press su un commento ALTRUI → segnalazione (il parent apre il menu).

import { memo, useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';
import { Avatar } from '@/components/ui/Avatar';
import type { CommentoLive } from '@/hooks/useLive';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';

/** Quanti commenti al massimo restano a schermo contemporaneamente. */
const MAX_VISIBILI = 4;
/** Dopo quanto un commento sfuma (dall'arrivo sul device). */
const VISIBILE_MS = 10_000;

interface Props {
  commenti: CommentoLive[];
  /** Long-press su un commento non proprio (segnalazione, live.md §11). */
  onSegnala?: (commento: CommentoLive) => void;
}

export function CommentiOverlay({ commenti, onSegnala }: Props) {
  // Id già sfumati: filtrati via (il fade è irreversibile, come su TikTok).
  const [scaduti, setScaduti] = useState<ReadonlySet<string>>(() => new Set());

  const segnaScaduto = useCallback((id: string) => {
    setScaduti((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const visibili = commenti.filter((c) => !scaduti.has(c.id)).slice(-MAX_VISIBILI);
  if (visibili.length === 0) return null;

  return (
    <View style={styles.colonna} pointerEvents="box-none">
      {visibili.map((c) => (
        <RigaCommento key={c.id} commento={c} onScaduto={segnaScaduto} onSegnala={onSegnala} />
      ))}
    </View>
  );
}

const RigaCommento = memo(function RigaCommento({
  commento,
  onScaduto,
  onSegnala,
}: {
  commento: CommentoLive;
  onScaduto: (id: string) => void;
  onSegnala?: (commento: CommentoLive) => void;
}) {
  useEffect(() => {
    const t = setTimeout(() => onScaduto(commento.id), VISIBILE_MS);
    return () => clearTimeout(t);
  }, [commento.id, onScaduto]);

  return (
    <Animated.View
      entering={FadeInDown.duration(220)}
      exiting={FadeOut.duration(600)}
      layout={LinearTransition.duration(180)}
    >
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
  colonna: { gap: spacing.xs, maxWidth: '80%' },
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
