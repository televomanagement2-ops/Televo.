// =============================================================================
// GlassButton — CTA primaria (pillola blu pieno). Stesso nome/API di prima, ma
// look sobrio: tinta unita `accent`, testo bianco, haptic alla pressione e stati
// loading/disabled. Niente vetro né gradienti.
// =============================================================================

import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, fontFamily, fontSize } from '@/constants/theme';

interface Props {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}

export function GlassButton({ label, onPress, loading = false, disabled = false }: Props) {
  const inactive = loading || disabled;

  const handlePress = () => {
    if (inactive) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.base,
        inactive ? styles.inactive : styles.active,
        pressed && !inactive && styles.pressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color="#ffffff" />
      ) : (
        <Text style={styles.label}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Stesso linguaggio dei pulsanti della welcome (design main): radius 14, altezza
  // piena, accento viola. Coerenza fra welcome e schermate del flow d'accesso.
  base: {
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  active: { backgroundColor: colors.accent },
  inactive: { backgroundColor: colors.elevated, opacity: 0.6 },
  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  label: {
    color: '#ffffff',
    fontSize: fontSize.base,
    fontFamily: fontFamily.semibold,
    letterSpacing: 0.3,
  },
});
