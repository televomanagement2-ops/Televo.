// =============================================================================
// StepInvito — primo step: il codice invito. Validato in sola lettura via
// check_invite (nessun consumo, nessuna scuola). Niente JWT richiesto.
// =============================================================================

import { useEffect, useRef, useState } from 'react';
import { InteractionManager, TextInput } from 'react-native';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { StepLayout } from './StepLayout';
import { checkInvite, authErrorMessage } from '@/lib/auth';
import { useOnboardingStore } from '@/store/onboardingStore';

export function StepInvito({ onNext }: { onNext: () => void }) {
  const inviteCode = useOnboardingStore((s) => s.inviteCode);
  const patch = useOnboardingStore((s) => s.patch);
  const [code, setCode] = useState(inviteCode);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const codeRef = useRef<TextInput>(null);

  // Focus DIFFERITO sul campo: niente focus durante la transizione, o la tastiera
  // si apre e si richiude subito.
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      codeRef.current?.focus();
    });
    return () => task.cancel();
  }, []);

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await checkInvite(code);
      if (!res.valid) {
        setError(authErrorMessage({ message: res.reason ?? 'invite_invalid' }));
        return;
      }
      patch({ inviteCode: code.trim().toUpperCase() });
      onNext();
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <StepLayout
      title="Hai un invito?"
      subtitle="Televo è solo su invito. Inserisci il codice che ti ha dato un amico."
      footer={
        <Button
          label="Continua"
          onPress={submit}
          loading={loading}
          disabled={code.trim().length < 4}
        />
      }
    >
      <Input
        ref={codeRef}
        label="Codice invito"
        value={code}
        onChangeText={(t) => {
          setCode(t.toUpperCase());
          setError(null);
        }}
        autoCapitalize="characters"
        autoCorrect={false}
        error={error}
      />
    </StepLayout>
  );
}
