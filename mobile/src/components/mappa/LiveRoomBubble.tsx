// =============================================================================
// LiveRoomBubble — bolla di una stanza live sulla mappa (M7 / MM8).
// =============================================================================
// map.md §2/§5: una stanza messa in mappa dall'host è una BOLLA con titolo e
// "breathing veloce". Marker MapLibre nativo (ancorato alla posizione host,
// masked-aware lato server) con un punto-luce Skia in accento che PULSA (motion.pulse,
// più rapido del respiro delle aure) + il titolo denormalizzato. Tap → card.

import { StyleSheet, Text, View } from 'react-native';
import { Marker } from '@maplibre/maplibre-react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { AuraGlyph } from './AuraGlyph';
import type { PuntoEvento } from '@/store/mapStore';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';

interface Props {
  evento: PuntoEvento;
  /** Pulsazione condivisa 0→1 (motion.pulse), creata in AuraLayer. */
  pulse: SharedValue<number>;
  onPress: () => void;
}

export function LiveRoomBubble({ evento, pulse, onPress }: Props) {
  const pulseStyle = useAnimatedStyle(() => ({
    opacity: 0.65 + 0.35 * pulse.value,
    transform: [{ scale: 0.85 + 0.3 * pulse.value }],
  }));

  return (
    <Marker id={`event-${evento.id}`} lngLat={[evento.lng, evento.lat]} onPress={onPress}>
      <View
        style={styles.pill}
        accessibilityRole="button"
        accessibilityLabel={`Stanza live: ${evento.title ?? 'stanza'}`}
      >
        <Animated.View style={pulseStyle}>
          <AuraGlyph color={colors.accent} size={22} />
        </Animated.View>
        <Text style={styles.title} numberOfLines={1}>
          {evento.title ?? 'Stanza live'}
        </Text>
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 2,
    paddingRight: spacing.sm + 2,
    paddingVertical: 3,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.55)',
    backgroundColor: 'rgba(11,12,16,0.92)',
    maxWidth: 168,
  },
  title: { color: colors.ink, fontSize: fontSize.xs, fontFamily: fontFamily.semibold, flexShrink: 1 },
});
