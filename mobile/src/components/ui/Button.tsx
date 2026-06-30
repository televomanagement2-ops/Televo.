// =============================================================================
// Button — CTA dell'app. Primario = pill blu pieno (accento UI), con haptic alla
// pressione e stato disabilitato/loading. Secondario = superficie con bordo;
// ghost = solo testo blu. Sobrio, niente vetro/gradienti vistosi.
// =============================================================================

import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';

type Variant = 'primary' | 'secondary' | 'ghost';

interface Props {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  /** Icona opzionale a sinistra del testo (es. logo Google). */
  icon?: ReactNode;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  icon,
}: Props) {
  const inactive = disabled || loading;

  const handlePress = () => {
    if (inactive) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onPress();
  };

  const content = (
    <View style={styles.row}>
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? '#ffffff' : colors.accent} />
      ) : (
        <>
          {icon}
          <Text
            style={[
              styles.label,
              variant === 'primary' && styles.labelPrimary,
              variant === 'secondary' && styles.labelSecondary,
              variant === 'ghost' && styles.labelGhost,
              icon ? styles.labelWithIcon : null,
            ]}
          >
            {label}
          </Text>
        </>
      )}
    </View>
  );

  if (variant === 'primary') {
    return (
      <Pressable
        onPress={handlePress}
        disabled={inactive}
        style={({ pressed }) => [
          styles.base,
          styles.primary,
          inactive && styles.primaryInactive,
          pressed && !inactive && styles.pressed,
        ]}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={handlePress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.base,
        variant === 'secondary' ? styles.secondary : styles.ghost,
        pressed && !inactive && styles.pressed,
        inactive && styles.disabled,
      ]}
    >
      {content}
    </Pressable>
  );
}

const HEIGHT = 56;

const styles = StyleSheet.create({
  base: {
    height: HEIGHT,
    borderRadius: radius.full,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: colors.accent },
  primaryInactive: { backgroundColor: colors.elevated },
  secondary: {
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ghost: {},
  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.55 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  label: { fontSize: fontSize.base, fontFamily: fontFamily.semibold },
  labelPrimary: { color: '#ffffff' },
  labelSecondary: { color: colors.ink },
  labelGhost: { color: colors.accent },
  labelWithIcon: { marginLeft: 2 },
});
