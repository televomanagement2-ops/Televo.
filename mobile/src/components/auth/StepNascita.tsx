// =============================================================================
// StepNascita — data di nascita (GG / MM / AAAA) con gate >=16 lato client.
// Il DB ricontrolla l'età in complete_onboarding (difesa in profondità).
// =============================================================================

import { useEffect, useRef, useState, type Ref } from 'react';
import { InteractionManager, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { StepLayout } from './StepLayout';
import { useOnboardingStore } from '@/store/onboardingStore';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';

const pad = (n: string) => n.padStart(2, '0');

// DateBox è dichiarato A LIVELLO DI MODULO (non dentro StepNascita): se stesse nel
// corpo render, a ogni keystroke React lo vedrebbe come un componente nuovo e
// rimonterebbe i TextInput, perdendo il focus (la tastiera spariva). Qui l'identità
// è stabile.
function DateBox({
  inputRef,
  value,
  onChangeText,
  placeholder,
  maxLength,
  flex = 1,
}: {
  inputRef?: Ref<TextInput>;
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
  maxLength: number;
  flex?: number;
}) {
  return (
    <TextInput
      ref={inputRef}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.faint}
      keyboardType="number-pad"
      maxLength={maxLength}
      selectionColor={colors.accent}
      style={[styles.box, { flex }]}
    />
  );
}

function validate(d: string, m: string, y: string): { date?: string; error?: string } {
  const day = Number(d);
  const mon = Number(m);
  const year = Number(y);
  if (!d || !m || y.length !== 4) return { error: 'Inserisci giorno, mese e anno.' };

  const dob = new Date(year, mon - 1, day);
  if (dob.getFullYear() !== year || dob.getMonth() !== mon - 1 || dob.getDate() !== day) {
    return { error: 'Data non valida.' };
  }

  const today = new Date();
  let age = today.getFullYear() - year;
  const hadBirthday =
    today.getMonth() > mon - 1 ||
    (today.getMonth() === mon - 1 && today.getDate() >= day);
  if (!hadBirthday) age -= 1;

  if (age < 16) return { error: 'Devi avere almeno 16 anni per usare Televo.' };
  if (age > 120) return { error: 'Controlla l’anno di nascita.' };

  return { date: `${year}-${pad(m)}-${pad(d)}` };
}

export function StepNascita({ onNext }: { onNext: () => void }) {
  const patch = useOnboardingStore((s) => s.patch);
  const [d, setD] = useState('');
  const [m, setM] = useState('');
  const [y, setY] = useState('');
  const [error, setError] = useState<string | null>(null);
  const dRef = useRef<TextInput>(null);
  const mRef = useRef<TextInput>(null);
  const yRef = useRef<TextInput>(null);

  // Focus DIFFERITO sul primo campo: niente focus durante la transizione di
  // schermata, o la tastiera si apre e si richiude subito.
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      dRef.current?.focus();
    });
    return () => task.cancel();
  }, []);

  const submit = () => {
    const { date, error: err } = validate(d, m, y);
    if (err || !date) {
      setError(err ?? 'Data non valida.');
      return;
    }
    patch({ birthDate: date });
    onNext();
  };

  const ready = d.length >= 1 && m.length >= 1 && y.length === 4;

  return (
    <StepLayout
      title="Quando sei nato?"
      subtitle="Solo per verificare che tu abbia almeno 16 anni. Non sarà pubblica."
      footer={<Button label="Continua" onPress={submit} disabled={!ready} />}
    >
      <View style={styles.row}>
        <DateBox
          inputRef={dRef}
          value={d}
          onChangeText={(t) => {
            const v = t.replace(/\D/g, '').slice(0, 2);
            setD(v);
            setError(null);
            if (v.length === 2) mRef.current?.focus();
          }}
          placeholder="GG"
          maxLength={2}
        />
        <DateBox
          inputRef={mRef}
          value={m}
          onChangeText={(t) => {
            const v = t.replace(/\D/g, '').slice(0, 2);
            setM(v);
            setError(null);
            if (v.length === 2) yRef.current?.focus();
          }}
          placeholder="MM"
          maxLength={2}
        />
        <DateBox
          inputRef={yRef}
          value={y}
          onChangeText={(t) => {
            setY(t.replace(/\D/g, '').slice(0, 4));
            setError(null);
          }}
          placeholder="AAAA"
          maxLength={4}
          flex={1.6}
        />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </StepLayout>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md },
  box: {
    height: 64,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.ink,
    fontSize: fontSize.xl,
    fontFamily: fontFamily.semibold,
    textAlign: 'center',
  },
  error: { color: colors.danger, fontSize: fontSize.sm, fontFamily: fontFamily.sans, marginTop: spacing.md },
});
