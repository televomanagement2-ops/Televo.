// =============================================================================
// Registrazione — completamento profilo (la sessione è GIÀ attiva: ci si arriva
// dopo welcome→email→password in modalità sign-up). DUE step soli, look leggero:
//   1) StepProfilo   — invito + username + nome + nascita
//   2) StepFinalizza — foto (opz.) + consensi → complete_onboarding → Home
// Progresso discreto ("1 di 2"), niente wizard a dots invadenti.
// =============================================================================

import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { AuthHeader } from '@/components/auth/AuthHeader';
import { StepProfilo } from '@/components/auth/StepProfilo';
import { StepFinalizza } from '@/components/auth/StepFinalizza';
import { useAuth } from '@/hooks/useAuth';
import { ONBOARDING_ORDER, useOnboardingStore } from '@/store/onboardingStore';
import { colors, fontFamily, fontSize, spacing } from '@/constants/theme';

export default function Registrazione() {
  const router = useRouter();
  const { isOnboarded } = useAuth();
  const step = useOnboardingStore((s) => s.step);
  const goTo = useOnboardingStore((s) => s.goTo);
  const reset = useOnboardingStore((s) => s.reset);

  // Già onboardato (es. login di un account esistente) → in app.
  useEffect(() => {
    if (isOnboarded) router.replace('/home');
  }, [isOnboarded, router]);

  const index = Math.max(0, ONBOARDING_ORDER.indexOf(step));

  const back = () => {
    const prev = ONBOARDING_ORDER[index - 1];
    if (prev) goTo(prev);
    else router.back();
  };
  const finish = () => {
    reset();
    router.replace('/home');
  };

  return (
    <SafeScreen scroll>
      <AuthHeader onBack={back} />
      <Text style={styles.progress}>{index + 1} di {ONBOARDING_ORDER.length}</Text>

      <View style={styles.body}>
        {step === 'profilo' && <StepProfilo onNext={() => goTo('finalizza')} />}
        {step === 'finalizza' && <StepFinalizza onDone={finish} />}
      </View>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  progress: {
    color: colors.faint,
    fontSize: fontSize.xs,
    fontFamily: fontFamily.medium,
    letterSpacing: 1,
    marginTop: spacing.sm,
  },
  body: { flex: 1 },
});
