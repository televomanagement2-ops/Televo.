// =============================================================================
// StatoPausa — velo "Live in pausa" (M12 / LM6, live.md §2).
// =============================================================================
// La pausa è uno stato VISIVO CHIARO, non uno schermo nero che sembra un bug:
// velo scuro sopra l'area video con icona e copy. Gli spettatori restano
// connessi (§12.19: si può anche entrare durante la pausa e aspettare).

import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontFamily, fontSize, spacing } from '@/constants/theme';

interface Props {
  /** true per l'host (copy in prima persona), false per gli spettatori. */
  sonoHost: boolean;
}

export function StatoPausa({ sonoHost }: Props) {
  return (
    <View style={styles.velo} pointerEvents="none">
      <Ionicons name="pause-circle-outline" size={56} color={colors.ink} />
      <Text style={styles.titolo}>Live in pausa</Text>
      <Text style={styles.sub}>
        {sonoHost
          ? 'Gli spettatori restano collegati: riprendi quando vuoi.'
          : 'L’host torna tra poco. Resta qui o esci quando vuoi.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  velo: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.72)',
    paddingHorizontal: spacing.xl,
  },
  titolo: { color: colors.ink, fontSize: fontSize.xl, fontFamily: fontFamily.semibold },
  sub: {
    color: colors.muted,
    fontSize: fontSize.sm,
    fontFamily: fontFamily.sans,
    textAlign: 'center',
    lineHeight: 20,
  },
});
