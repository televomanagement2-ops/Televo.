// =============================================================================
// LiveStrip — la striscia orizzontale "chi è in diretta ora" (M12 / LM7,
// estesa M15 / LR6 con le terminate <24h).
// =============================================================================
// In cima alla categoria Live della Home (live.md §7A): scroll orizzontale di
// cerchi, in DUE metà ordinate (RW-1):
//  1. live ATTIVE — foto profilo + ANELLO ROSSO PULSANTE (colors.danger,
//     motion.pulse) + etichetta "LIVE"; in pausa l'anello resta pieno ma smette
//     di pulsare e l'etichetta dice "PAUSA". Tap → apre quella live.
//  2. live TERMINATE da <24h — segnaposto visivamente INEQUIVOCABILE (mai
//     confondibile con una diretta): anello statico grigio, avatar spento,
//     etichetta "FINITA", tempo relativo sotto il nome. Tap → apre il PROFILO
//     dell'amico (RW-1a: non esiste replay, il cerchio spento è una scorciatoia
//     al profilo, stile storia scaduta).
// Contiene SOLO amici (L-1: lives_feed e lives_strip sono già filtrate da
// can_see_live e la propria live è esclusa).

import { memo, useEffect, useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { router } from 'expo-router';
import { Avatar } from '@/components/ui/Avatar';
import { dynamicRoutes } from '@/constants/routes';
import { colors, fontFamily, fontSize, motion, radius, spacing } from '@/constants/theme';
import { tempoRelativoCalibrato } from '@/lib/datetime';
import type { LiveTerminata } from '@/hooks/useLivesStrip';
import type { LiveAmico } from '@/store/liveStore';

interface Props {
  lives: LiveAmico[];
  /** Segnaposto delle live finite da <24h (M15/LR6), già filtrati/dedupati. */
  terminate: LiveTerminata[];
  /** server_now − Date.now(): il tempo relativo "2h fa" non si fida del device. */
  clockOffsetMs: number;
  /** Apre lo schermo spettatore della live (rotta /live/[id]). */
  onApri: (liveId: string) => void;
}

/** Una voce della striscia: le attive prima, poi le terminate (RW-1). */
type VoceStriscia =
  | { tipo: 'attiva'; live: LiveAmico }
  | { tipo: 'terminata'; fine: LiveTerminata };

export function LiveStrip({ lives, terminate, clockOffsetMs, onApri }: Props) {
  const voci = useMemo<VoceStriscia[]>(
    () => [
      ...lives.map((live) => ({ tipo: 'attiva', live }) as const),
      ...terminate.map((fine) => ({ tipo: 'terminata', fine }) as const),
    ],
    [lives, terminate],
  );
  if (voci.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <FlatList
        horizontal
        data={voci}
        keyExtractor={(v) => (v.tipo === 'attiva' ? v.live.liveId : v.fine.liveId)}
        renderItem={({ item }) =>
          item.tipo === 'attiva' ? (
            <LiveStripAvatar live={item.live} onApri={onApri} />
          ) : (
            <LiveStripAvatarTerminata fine={item.fine} clockOffsetMs={clockOffsetMs} />
          )
        }
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.content}
      />
    </View>
  );
}

/** Un cerchio della striscia: avatar + anello rosso (pulsante se in onda). */
const LiveStripAvatar = memo(function LiveStripAvatar({
  live,
  onApri,
}: {
  live: LiveAmico;
  onApri: (liveId: string) => void;
}) {
  const inOnda = live.status === 'live';
  const nome = live.host.displayName ?? live.host.username;

  // Pulsazione dell'anello: respiro di opacità, mai brusco (motion.pulse).
  const alone = useSharedValue(1);
  useEffect(() => {
    if (inOnda) {
      alone.value = withRepeat(withTiming(0.45, { duration: motion.pulse / 2 }), -1, true);
    } else {
      alone.value = withTiming(1, { duration: motion.base });
    }
  }, [inOnda, alone]);
  const stileAnello = useAnimatedStyle(() => ({ opacity: alone.value }));

  return (
    <Pressable style={styles.item} onPress={() => onApri(live.liveId)}>
      <View style={styles.cerchio}>
        <Animated.View style={[styles.anello, stileAnello]} />
        <Avatar uri={live.host.avatarUrl} name={nome} size={56} />
        <View style={[styles.etichetta, !inOnda && styles.etichettaSpenta]}>
          <Text style={styles.etichettaTesto}>{inOnda ? 'LIVE' : 'PAUSA'}</Text>
        </View>
      </View>
      <Text style={styles.nome} numberOfLines={1}>
        {nome}
      </Text>
    </Pressable>
  );
});

/** Il segnaposto di una live finita (M15/LR6, §1): anello statico grigio (MAI
 *  colors.danger, MAI pulse), avatar a opacità ridotta, etichetta "FINITA" e
 *  tempo relativo. Il tap apre il profilo dell'amico, mai /live/[id]. */
const LiveStripAvatarTerminata = memo(function LiveStripAvatarTerminata({
  fine,
  clockOffsetMs,
}: {
  fine: LiveTerminata;
  clockOffsetMs: number;
}) {
  const nome = fine.host.displayName ?? fine.host.username;
  const quando = tempoRelativoCalibrato(fine.endedAt, Date.now() + clockOffsetMs);

  return (
    <Pressable
      style={styles.item}
      accessibilityRole="button"
      accessibilityLabel={`Live di ${nome} finita ${quando}. Apri il profilo`}
      onPress={() => router.push(dynamicRoutes.profiloUtente(fine.host.userId))}
    >
      <View style={styles.cerchio}>
        <View style={[styles.anello, styles.anelloTerminata]} />
        <View style={styles.avatarSpento}>
          <Avatar uri={fine.host.avatarUrl} name={nome} size={56} />
        </View>
        <View style={[styles.etichetta, styles.etichettaSpenta]}>
          <Text style={styles.etichettaTesto}>FINITA</Text>
        </View>
      </View>
      <Text style={styles.nome} numberOfLines={1}>
        {nome}
      </Text>
      <Text style={styles.quando} numberOfLines={1}>
        {quando}
      </Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  wrap: { paddingVertical: spacing.sm },
  content: { paddingHorizontal: spacing.lg, gap: spacing.md },
  item: { alignItems: 'center', width: 72, gap: 4 },
  cerchio: { width: 66, height: 66, alignItems: 'center', justifyContent: 'center' },
  anello: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radius.full,
    borderWidth: 2.5,
    borderColor: colors.danger,
  },
  anelloTerminata: { borderColor: colors.faint },
  avatarSpento: { opacity: 0.55 },
  etichetta: {
    position: 'absolute',
    bottom: -5,
    backgroundColor: colors.danger,
    borderRadius: radius.full,
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderWidth: 2,
    borderColor: colors.base,
  },
  etichettaSpenta: { backgroundColor: colors.elevated },
  etichettaTesto: {
    color: '#ffffff',
    fontSize: 8,
    fontFamily: fontFamily.semibold,
    letterSpacing: 0.5,
  },
  nome: {
    color: colors.muted,
    fontSize: fontSize.xs,
    fontFamily: fontFamily.medium,
    maxWidth: 72,
    marginTop: 2,
  },
  quando: {
    color: colors.faint,
    fontSize: 10,
    fontFamily: fontFamily.sans,
    maxWidth: 72,
  },
});
