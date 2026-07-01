// =============================================================================
// AuraRing — l'anello vivo della reputazione (il cuore del profilo).
// =============================================================================
// NON è popolarità: visualizza la QUALITÀ della presenza. L'anello è colorato dal
// tratto DOMINANTE della settimana (vibe_color del DB) e "respira" lentamente
// (Reanimated): un glow che pulsa, segno che dietro c'è una persona viva. Al
// centro lo score e l'etichetta IT del tratto. In assenza di tratto → "chill"
// (grigio), respiro più tenue.
// NB: distinto dal LaunchRing del bootstrap (quello è il marchio viola→fucsia).

import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { AURA_TRAIT_LABEL, auraColorForTrait, type AuraTrait } from '@/constants/aura';
import { colors, fontFamily, motion } from '@/constants/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface Props {
  score: number;
  dominantTrait: AuraTrait | null;
  /** colore esplicito (di solito da aura_color); altrimenti derivato dal tratto */
  color?: string | null;
  size?: number;
  /** disattiva il "respiro" (es. accessibilità / liste) */
  still?: boolean;
}

export function AuraRing({ score, dominantTrait, color, size = 200, still = false }: Props) {
  const ringColor = color ?? auraColorForTrait(dominantTrait);
  const stroke = Math.max(6, Math.round(size * 0.045));
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;

  // "Respiro": opacità dell'anello esterno che pulsa lenta e organica.
  const breath = useSharedValue(0.55);
  useEffect(() => {
    if (still) {
      breath.value = 0.9;
      return;
    }
    breath.value = withRepeat(
      withTiming(1, { duration: motion.breath, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [breath, still]);

  const animatedProps = useAnimatedProps(() => ({ opacity: breath.value }));

  const label = dominantTrait ? AURA_TRAIT_LABEL[dominantTrait] : 'Chill';

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        {/* binario di base, sempre presente */}
        <Circle cx={cx} cy={cy} r={r} stroke={colors.border} strokeWidth={stroke} fill="none" />
        {/* anello "vivo" colorato che respira */}
        <AnimatedCircle
          cx={cx}
          cy={cy}
          r={r}
          stroke={ringColor}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          animatedProps={animatedProps}
        />
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.center]}>
        <Text
          style={[styles.score, { fontSize: size * 0.24 }]}
          accessibilityLabel={`Aura ${Math.round(score)}`}
        >
          {Math.round(score)}
        </Text>
        <Text style={[styles.label, { color: ringColor }]}>{label}</Text>
        <Text style={styles.caption}>Aura</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  score: { color: colors.ink, fontFamily: fontFamily.displayBold, includeFontPadding: false },
  label: { fontFamily: fontFamily.semibold, fontSize: 15, marginTop: 2 },
  caption: {
    color: colors.faint,
    fontFamily: fontFamily.medium,
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: 2,
  },
});
