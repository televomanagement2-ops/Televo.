// =============================================================================
// Registrazione — completamento del profilo (la sessione è GIÀ attiva: ci si
// arriva dopo email→verifica). Host a stati interni con header persistente +
// dots; i dati raccolti vivono in onboardingStore.
// =============================================================================
// Invito: se è già presente un codice valido (es. da deep link) lo validiamo in
// silenzio e saltiamo lo step; altrimenti lo step "Hai un invito?" lo chiede.

import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { AuthHeader } from '@/components/auth/AuthHeader';
import { StepDots } from '@/components/auth/StepDots';
import { StepInvito } from '@/components/auth/StepInvito';
import { StepNascita } from '@/components/auth/StepNascita';
import { StepUsername } from '@/components/auth/StepUsername';
import { StepFoto } from '@/components/auth/StepFoto';
import { StepConsensi } from '@/components/auth/StepConsensi';
import { checkInvite } from '@/lib/auth';
import { useAuth } from '@/hooks/useAuth';
import {
  ONBOARDING_ORDER,
  useOnboardingStore,
  type OnboardingStep,
} from '@/store/onboardingStore';
import { colors, spacing } from '@/constants/theme';

export default function Registrazione() {
  const router = useRouter();
  const { isOnboarded } = useAuth();
  const step = useOnboardingStore((s) => s.step);
  const goTo = useOnboardingStore((s) => s.goTo);
  const reset = useOnboardingStore((s) => s.reset);
  const inviteCode = useOnboardingStore((s) => s.inviteCode);

  const [skipInvito, setSkipInvito] = useState(false);
  const [checking, setChecking] = useState(!!inviteCode);

  // Già onboardato (es. login di un account esistente) → in app.
  useEffect(() => {
    if (isOnboarded) router.replace('/home');
  }, [isOnboarded, router]);

  // Invito da deep link: valida in silenzio, eventualmente salta lo step.
  useEffect(() => {
    let active = true;
    if (!inviteCode) {
      setChecking(false);
      return;
    }
    (async () => {
      try {
        const res = await checkInvite(inviteCode);
        if (active && res.valid) {
          setSkipInvito(true);
          if (useOnboardingStore.getState().step === 'invito') goTo('username');
        }
      } catch {
        // codice non valido/errore: mostra lo step manuale.
      } finally {
        if (active) setChecking(false);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flow = useMemo<OnboardingStep[]>(
    () => ONBOARDING_ORDER.filter((s) => !(skipInvito && s === 'invito')),
    [skipInvito],
  );

  // Assicura che lo step corrente appartenga al flow attivo.
  useEffect(() => {
    if (!flow.includes(step)) goTo(flow[0] as OnboardingStep);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow]);

  const index = Math.max(0, flow.indexOf(step));

  const next = () => {
    const n = flow[index + 1];
    if (n) goTo(n);
  };
  const back = () => {
    const p = flow[index - 1];
    if (p) goTo(p);
    else router.back();
  };
  const finish = () => {
    reset();
    router.replace('/home');
  };

  return (
    <SafeScreen>
      <AuthHeader onBack={back} />
      <StepDots count={flow.length} index={index} />

      <View style={styles.body}>
        {checking ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : (
          <>
            {step === 'invito' && <StepInvito onNext={next} />}
            {step === 'username' && <StepUsername onNext={next} />}
            {step === 'nascita' && <StepNascita onNext={next} />}
            {step === 'foto' && <StepFoto onNext={next} />}
            {step === 'consensi' && <StepConsensi onNext={finish} />}
          </>
        )}
      </View>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, marginTop: spacing.sm },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
