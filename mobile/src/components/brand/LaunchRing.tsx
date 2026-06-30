// =============================================================================
// LaunchRing — l'anello "neon" del brand (la "o" di Televo).
// =============================================================================
// Anello quasi chiuso con una piccola apertura ESATTAMENTE IN ALTO (ore 12) —
// vibe: presenza viva, non un cerchio statico. Gradiente viola→fucsia + bloom
// neon morbido dietro (più cerchi diffusi, perché su Android lo shadow non rende).

import { View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, RadialGradient, Stop } from 'react-native-svg';
import { colors } from '@/constants/theme';

interface Props {
  size?: number;
  strokeWidth?: number;
}

export function LaunchRing({ size = 132, strokeWidth = 8 }: Props) {
  const cx = size / 2;
  const cy = size / 2;
  const r = (size - strokeWidth * 2.2) / 2; // lascia spazio al bloom esterno
  const circumference = 2 * Math.PI * r;
  const gap = circumference * 0.12; // apertura ~12%
  const dash = circumference - gap;
  // Con rotate(-90) lo 0° del path è in alto. Per centrare l'APERTURA sul top serve
  // far partire il TRATTO con uno sfasamento di mezzo gap: così il vuoto sta a cavallo
  // delle ore 12. (strokeDashoffset negativo sposta l'inizio del dash in avanti.)
  const transform = `rotate(-90 ${cx} ${cy})`;
  const dashArray = `${dash} ${gap}`;
  const dashOffset = -gap / 2;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id="launchRing" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={colors.viola} />
            <Stop offset="1" stopColor={colors.fucsia} />
          </LinearGradient>
          <RadialGradient id="launchBloom" cx="50%" cy="50%" r="50%">
            <Stop offset="0.45" stopColor={colors.viola} stopOpacity="0" />
            <Stop offset="0.78" stopColor={colors.viola} stopOpacity="0.30" />
            <Stop offset="1" stopColor={colors.fucsia} stopOpacity="0" />
          </RadialGradient>
        </Defs>

        {/* Bloom diffuso: alone radiale che avvolge l'anello (effetto neon). */}
        <Circle cx={cx} cy={cy} r={size / 2} fill="url(#launchBloom)" />

        {/* Bloom sull'anello: stesso tracciato, tratto largo e morbido. */}
        <Circle
          cx={cx}
          cy={cy}
          r={r}
          stroke={colors.viola}
          strokeOpacity={0.35}
          strokeWidth={strokeWidth * 2.6}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={dashArray}
          strokeDashoffset={dashOffset}
          transform={transform}
        />

        {/* Anello neon nitido */}
        <Circle
          cx={cx}
          cy={cy}
          r={r}
          stroke="url(#launchRing)"
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={dashArray}
          strokeDashoffset={dashOffset}
          transform={transform}
        />
      </Svg>
    </View>
  );
}
