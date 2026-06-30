// =============================================================================
// AuthButton — il bottone del flow d'accesso, nei tre stili del riferimento:
//   • light   → sfondo bianco, testo scuro (es. Facebook)
//   • dark    → superficie scura piena + bordo sottile (Google/email)
//   • outline → trasparente con bordo e testo violetto (es. "Accedi")
// Icona + etichetta formano un blocco coeso CENTRATO (icona subito a sinistra del
// testo, mai sovrapposta), come nel mockup. Haptic alla pressione.
// =============================================================================

import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, fontFamily, fontSize, spacing } from '@/constants/theme';

type Variant = 'light' | 'dark' | 'outline';

interface Props {
  label: string;
  onPress: () => void;
  variant?: Variant;
  icon?: ReactNode;
  loading?: boolean;
  disabled?: boolean;
}

export function AuthButton({
  label,
  onPress,
  variant = 'dark',
  icon,
  loading = false,
  disabled = false,
}: Props) {
  const inactive = loading || disabled;

  const handlePress = () => {
    if (inactive) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onPress();
  };

  const labelColor =
    variant === 'light' ? '#0a0a0a' : variant === 'outline' ? colors.accent : colors.ink;

  return (
    <Pressable
      onPress={handlePress}
      disabled={inactive}
      android_ripple={{ color: 'rgba(0,0,0,0.08)' }}
      style={[
        styles.base,
        variant === 'light' && styles.light,
        variant === 'dark' && styles.dark,
        variant === 'outline' && styles.outline,
        inactive && styles.inactive,
      ]}
    >
      {icon ? <View style={styles.icon}>{icon}</View> : null}
      <Text style={[styles.label, { color: labelColor }]} numberOfLines={1}>
        {loading ? 'Attendi…' : label}
      </Text>
    </Pressable>
  );
}

// Quote calibrate sul mockup (639×1384, scala 1.626 px/pt):
//   altezza pulsante 77px → ~47pt · raggio angolo ~14pt · fondo scuro PIENO #1c1c1e.
const styles = StyleSheet.create({
  base: {
    width: '100%',
    alignSelf: 'stretch',
    height: 47,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    overflow: 'hidden',
  },
  light: { backgroundColor: '#ffffff' },
  // Nel mockup il pulsante scuro è una superficie PIENA (#1c1c1e), non translucida,
  // con un bordo appena più chiaro per staccarlo dal nero assoluto dello sfondo.
  dark: {
    backgroundColor: '#1c1c1e',
    borderWidth: 1,
    borderColor: '#2a2a2d',
  },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: colors.accent,
  },
  inactive: { opacity: 0.55 },
  // Icona inline nel flusso: il blocco [icona + testo] è centrato, l'icona resta
  // sempre subito a sinistra del testo (gap fisso), mai sovrapposta.
  icon: { marginRight: 12 },
  label: { fontSize: fontSize.base, fontFamily: fontFamily.semibold, letterSpacing: 0.2 },
});
