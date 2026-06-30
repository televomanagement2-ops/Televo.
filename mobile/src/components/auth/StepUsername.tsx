// =============================================================================
// StepUsername — username (unico) + nome visualizzato (facoltativo). Controllo
// di disponibilità live (debounce). La validazione definitiva è lato DB.
// =============================================================================

import { useEffect, useRef, useState } from 'react';
import { InteractionManager, StyleSheet, Text, TextInput, View } from 'react-native';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { StepLayout } from './StepLayout';
import { isUsernameAvailable } from '@/lib/auth';
import { useOnboardingStore } from '@/store/onboardingStore';
import { colors, fontFamily, fontSize, spacing } from '@/constants/theme';

const USERNAME_RE = /^[a-z0-9_.]{3,20}$/;
type Status = 'idle' | 'checking' | 'free' | 'taken' | 'invalid';

export function StepUsername({ onNext }: { onNext: () => void }) {
  const store = useOnboardingStore();
  const [username, setUsername] = useState(store.username);
  const [name, setName] = useState(store.displayName);
  const [status, setStatus] = useState<Status>('idle');
  const usernameRef = useRef<TextInput>(null);

  // Focus DIFFERITO sul primo campo: niente focus durante la transizione, o la
  // tastiera si apre e si richiude subito.
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      usernameRef.current?.focus();
    });
    return () => task.cancel();
  }, []);

  useEffect(() => {
    const v = username.trim().toLowerCase();
    if (!v) {
      setStatus('idle');
      return;
    }
    if (!USERNAME_RE.test(v)) {
      setStatus('invalid');
      return;
    }
    setStatus('checking');
    let active = true;
    const t = setTimeout(async () => {
      try {
        const free = await isUsernameAvailable(v);
        if (active) setStatus(free ? 'free' : 'taken');
      } catch {
        if (active) setStatus('idle');
      }
    }, 400);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [username]);

  const nameOk = name.trim().length >= 2;

  const submit = () => {
    if (status !== 'free' || !nameOk) return;
    store.patch({
      username: username.trim().toLowerCase(),
      displayName: name.trim(),
    });
    onNext();
  };

  const errorText =
    status === 'invalid'
      ? '3–20 caratteri: lettere minuscole, numeri, _ o .'
      : status === 'taken'
        ? 'Questo username è già preso.'
        : null;

  return (
    <StepLayout
      title="Come ti chiami?"
      subtitle="Lo username è unico ed è come ti trovano. Il nome è come ti chiamano gli amici."
      footer={
        <Button
          label="Continua"
          onPress={submit}
          loading={status === 'checking'}
          disabled={status !== 'free' || !nameOk}
        />
      }
    >
      <Input
        ref={usernameRef}
        label="Username"
        value={username}
        onChangeText={(t) => setUsername(t.toLowerCase().replace(/\s/g, ''))}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={20}
        error={errorText}
      />
      {status === 'free' ? <Text style={styles.ok}>Disponibile ✓</Text> : null}

      <View style={styles.gap} />

      <Input
        label="Nome"
        value={name}
        onChangeText={setName}
        maxLength={40}
      />
    </StepLayout>
  );
}

const styles = StyleSheet.create({
  ok: { color: colors.success, fontSize: fontSize.sm, fontFamily: fontFamily.sans, marginTop: spacing.sm },
  gap: { height: spacing.lg },
});
