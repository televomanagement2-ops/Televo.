// =============================================================================
// AuraAvatarRing — anello luminoso dell'Aura attorno a un avatar.
// =============================================================================
// L'Aura v3 è una percentuale (0–100). Qui diventa un ARCO che incornicia
// l'avatar: parte dalle ore 12 e cresce in senso orario con la % (a 0% un piccolo
// arco rosso, al 100% il cerchio quasi pieno). Il colore segue la scala
// rosso→oro (auraRingColor); AL 100% diventa il viola→fucsia del marchio, con
// bloom neon — identico all'anello del wordmark (vedi LaunchRing). Il glow
// "respira" come l'AuraRing del profilo, segno di presenza viva.
//
// Riusabile: avvolge un `children` (di solito <Avatar/>) e lo tiene centrato.

import { useEffect, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, RadialGradient, Stop } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import {
  auraRingColor,
  AURA_RING_BRAND_THRESHOLD,
} from '@/constants/aura';
import { colors, motion } from '@/constants/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface Props {
  /** Percentuale Aura 0–100. */
  percent: number;
  /** Diametro dell'avatar incorniciato (l'anello sta intorno). */
  size: number;
  /** Spessore del tratto nitido. Default proporzionale alla size. */
  strokeWidth?: number;
  /** L'elemento da incorniciare (tipicamente <Avatar/>). */
  children: ReactNode;
  /** Disattiva il "respiro" del glow (es. header piccolo). */
  still?: boolean;
}

export function AuraAvatarRing({ percent, size, strokeWidth, children, still = false }: Props) {
  const p = Math.max(0, Math.min(100, percent));
  const isBrand = p >= AURA_RING_BRAND_THRESHOLD;
  const ringColor = auraRingColor(p);

  const stroke = strokeWidth ?? Math.max(3, Math.round(size * 0.06));
  // L'SVG è più grande dell'avatar: lascia spazio all'anello e al bloom esterno.
  const pad = stroke * 2.4;
  const svg = size + pad * 2;
  const cx = svg / 2;
  const cy = svg / 2;
  const r = (svg - stroke * 2.2) / 2; // come LaunchRing: spazio per il bloom

  // Arco proporzionale alla %: parte da ore 12 (rotate -90) e cresce in orario.
  // Al 100% lasciamo una piccola apertura in alto (firma "viva", come il wordmark).
  const circumference = 2 * Math.PI * r;
  const minOpening = circumference * 0.08; // apertura minima in cima al 100%
  const sweep = isBrand
    ? circumference - minOpening
    : Math.max(circumference * 0.02, (circumference - minOpening) * (p / 100));
  const dashArray = `${sweep} ${circumference}`;
  const transform = `rotate(-90 ${cx} ${cy})`;

  // "Respiro": il bloom pulsa lento (l'arco nitido resta pieno). Pattern AuraRing.
  const breath = useSharedValue(still ? 0.85 : 0.5);
  useEffect(() => {
    if (still) {
      breath.value = 0.85;
      return;
    }
    breath.value = withRepeat(
      withTiming(1, { duration: motion.breath, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [breath, still]);
  const bloomProps = useAnimatedProps(() => ({ opacity: breath.value }));

  return (
    <View style={{ width: svg, height: svg, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={svg} height={svg} style={StyleSheet.absoluteFill}>
        <Defs>
          {/* Gradiente di marca (solo al 100%): viola → fucsia come il wordmark. */}
          <LinearGradient id="auraBrand" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={colors.viola} />
            <Stop offset="1" stopColor={colors.fucsia} />
          </LinearGradient>
          {/* Bloom radiale di marca per il neon al 100%. */}
          <RadialGradient id="auraBrandBloom" cx="50%" cy="50%" r="50%">
            <Stop offset="0.5" stopColor={colors.viola} stopOpacity="0" />
            <Stop offset="0.82" stopColor={colors.viola} stopOpacity="0.35" />
            <Stop offset="1" stopColor={colors.fucsia} stopOpacity="0" />
          </RadialGradient>
        </Defs>

        {/* Bloom diffuso radiale: solo al 100% (effetto neon pieno del marchio). */}
        {isBrand ? (
          <AnimatedCircle
            cx={cx}
            cy={cy}
            r={svg / 2}
            fill="url(#auraBrandBloom)"
            animatedProps={bloomProps}
          />
        ) : null}

        {/* Bloom sull'arco: stesso tracciato, tratto largo e morbido, che respira. */}
        <AnimatedCircle
          cx={cx}
          cy={cy}
          r={r}
          stroke={isBrand ? colors.viola : ringColor}
          strokeOpacity={0.32}
          strokeWidth={stroke * 2.6}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={dashArray}
          transform={transform}
          animatedProps={bloomProps}
        />

        {/* Arco nitido: tinta unita (rosso→oro) o gradiente brand al 100%. */}
        <Circle
          cx={cx}
          cy={cy}
          r={r}
          stroke={isBrand ? 'url(#auraBrand)' : ringColor}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={dashArray}
          transform={transform}
        />
      </Svg>

      {/* L'avatar incorniciato, centrato nello spazio interno. */}
      <View style={{ width: size, height: size }}>{children}</View>
    </View>
  );
}
