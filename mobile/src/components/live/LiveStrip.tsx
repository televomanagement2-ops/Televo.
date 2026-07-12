// =============================================================================
// LiveStrip — la striscia orizzontale "chi è in diretta ora" (M12 / LM7).
// =============================================================================
// In cima alla categoria Live della Home (live.md §7A): scroll orizzontale di
// cerchi — foto profilo + ANELLO ROSSO PULSANTE (colors.danger, motion.pulse) +
// etichetta "LIVE". Contiene SOLO amici (L-1: lives_feed è già filtrata da
// can_see_live e la propria live è esclusa). Tap → apre direttamente quella
// live. In pausa l'anello resta pieno ma smette di pulsare e l'etichetta dice
// "PAUSA" (§2: la pausa è uno stato visivo chiaro, non un'anomalia).

import { memo, useEffect } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Avatar } from '@/components/ui/Avatar';
import { colors, fontFamily, fontSize, motion, radius, spacing } from '@/constants/theme';
import type { LiveAmico } from '@/store/liveStore';

interface Props {
  lives: LiveAmico[];
  /** Apre lo schermo spettatore della live (rotta /live/[id]). */
  onApri: (liveId: string) => void;
}

export function LiveStrip({ lives, onApri }: Props) {
  return (
    <View style={styles.wrap}>
      <FlatList
        horizontal
        data={lives}
        keyExtractor={(l) => l.liveId}
        renderItem={({ item }) => <LiveStripAvatar live={item} onApri={onApri} />}
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
        <View style={[styles.etichetta, !inOnda && styles.etichettaPausa]}>
          <Text style={styles.etichettaTesto}>{inOnda ? 'LIVE' : 'PAUSA'}</Text>
        </View>
      </View>
      <Text style={styles.nome} numberOfLines={1}>
        {nome}
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
  etichettaPausa: { backgroundColor: colors.elevated },
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
});
