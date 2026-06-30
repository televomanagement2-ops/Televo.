// =============================================================================
// OtpInput — codice a 6 caselle (verifica email OTP). Un solo TextInput
// nascosto cattura le cifre; le caselle sono puramente visive. Supporta
// l'autofill del codice via SMS/email su iOS e Android.
// =============================================================================

import { useEffect, useRef, useState } from 'react';
import { InteractionManager, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, fontFamily, fontSize, radius } from '@/constants/theme';

interface Props {
  value: string;
  onChangeText: (value: string) => void;
  length?: number;
  onComplete?: (value: string) => void;
  autoFocus?: boolean;
}

export function OtpInput({
  value,
  onChangeText,
  length = 6,
  onComplete,
  autoFocus = true,
}: Props) {
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);

  // Focus DIFFERITO: chiedere il focus durante la transizione di schermata fa
  // aprire e subito richiudere la tastiera. Aspettiamo la fine dell'animazione.
  useEffect(() => {
    if (!autoFocus) return;
    const task = InteractionManager.runAfterInteractions(() => {
      inputRef.current?.focus();
    });
    return () => task.cancel();
  }, [autoFocus]);

  const handleChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, length);
    onChangeText(digits);
    if (digits.length === length) onComplete?.(digits);
  };

  return (
    <Pressable style={styles.row} onPress={() => inputRef.current?.focus()}>
      {Array.from({ length }).map((_, i) => {
        const char = value[i] ?? '';
        const isCurrent = focused && i === value.length;
        return (
          <View
            key={i}
            style={[styles.cell, (char !== '' || isCurrent) && styles.cellActive]}
          >
            <Text style={styles.char}>{char}</Text>
          </View>
        );
      })}

      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={handleChange}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={length}
        caretHidden
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={styles.hidden}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  cell: {
    flex: 1,
    aspectRatio: 0.82,
    maxWidth: 56,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellActive: {
    borderColor: colors.accent,
    shadowColor: colors.accent,
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 3,
  },
  char: { color: colors.ink, fontSize: fontSize['2xl'], fontFamily: fontFamily.semibold },
  hidden: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },
});
