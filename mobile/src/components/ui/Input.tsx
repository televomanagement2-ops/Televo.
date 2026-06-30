// =============================================================================
// Input — campo di testo sobrio e ROBUSTO. Label statica sopra il campo +
// placeholder dentro. NIENTE Reanimated: l'animazione della label fluttuante in
// Expo Go (Android) interferiva col focus della tastiera (apriva/chiudeva o non
// faceva scrivere). Qui il TextInput è "nudo": massima stabilità del keyboard.
// =============================================================================

import { forwardRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';

interface Props extends Omit<TextInputProps, 'style'> {
  label?: string;
  value: string;
  error?: string | null;
  containerStyle?: ViewStyle;
}

export const Input = forwardRef<TextInput, Props>(function Input(
  { label, value, error, containerStyle, onFocus, onBlur, placeholder, ...rest },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const borderColor = error ? colors.danger : focused ? colors.accent : colors.border;

  return (
    <View style={containerStyle}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={[styles.field, { borderColor }]}>
        <TextInput
          ref={ref}
          value={value}
          placeholder={placeholder}
          style={styles.input}
          placeholderTextColor={colors.faint}
          selectionColor={colors.accent}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          {...rest}
        />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  label: {
    color: colors.muted,
    fontSize: fontSize.sm,
    fontFamily: fontFamily.medium,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  field: {
    height: 58,
    borderRadius: radius.lg,
    borderWidth: 1,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
  },
  input: {
    color: colors.ink,
    fontSize: fontSize.base,
    fontFamily: fontFamily.sans,
    padding: 0,
  },
  error: {
    color: colors.danger,
    fontSize: fontSize.sm,
    fontFamily: fontFamily.sans,
    marginTop: spacing.sm,
    marginLeft: spacing.xs,
  },
});
