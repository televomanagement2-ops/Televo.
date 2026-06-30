// =============================================================================
// Verifica — inserimento del codice OTP a 6 cifre (email o telefono, secondo il
// metodo scelto). Alla riuscita la sessione è attiva: profilo completo → in app,
// altrimenti → completamento profilo (registrazione).
// =============================================================================

import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { AuthHeader } from '@/components/auth/AuthHeader';
import { OtpInput } from '@/components/ui/OtpInput';
import { GlassButton } from '@/components/ui/GlassButton';
import {
  verifyEmailOtp,
  sendEmailOtp,
  verifyPhoneOtp,
  sendPhoneOtp,
  fetchMyProfile,
  authErrorMessage,
} from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useOnboardingStore } from '@/store/onboardingStore';
import { colors, fontFamily, fontSize, spacing } from '@/constants/theme';

export default function VerificaScreen() {
  const router = useRouter();
  const method = useOnboardingStore((s) => s.method);
  const email = useOnboardingStore((s) => s.email);
  const phone = useOnboardingStore((s) => s.phone);
  const resetFlow = useOnboardingStore((s) => s.resetFlow);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resent, setResent] = useState(false);

  const isPhone = method === 'phone';
  const destination = isPhone ? phone : email;

  const verify = async (value: string) => {
    setLoading(true);
    setError(null);
    try {
      if (isPhone) await verifyPhoneOtp(phone, value);
      else await verifyEmailOtp(email, value);
      // Sessione attiva. Se è un reset password, vai a impostare la nuova password.
      if (resetFlow) {
        router.replace('/nuova-password');
        return;
      }
      // Altrimenti instrada secondo lo stato del profilo.
      const { data } = await supabase.auth.getUser();
      const profile = data.user ? await fetchMyProfile(data.user.id) : null;
      router.replace(profile?.age_verified ? '/home' : '/registrazione');
    } catch (e) {
      setError(authErrorMessage(e));
      setLoading(false);
    }
  };

  const resend = async () => {
    setError(null);
    try {
      if (isPhone) await sendPhoneOtp(phone);
      else await sendEmailOtp(email);
      setResent(true);
    } catch (e) {
      setError(authErrorMessage(e));
    }
  };

  return (
    <SafeScreen scroll>
      <AuthHeader onBack={() => router.back()} />

      <View style={styles.body}>
        <Text style={styles.title}>Inserisci il codice</Text>
        <Text style={styles.subtitle}>
          {resetFlow ? 'Codice per reimpostare la password, mandato a ' : 'Lo abbiamo mandato a '}
          {destination}
        </Text>
        <View style={styles.field}>
          <OtpInput
            value={code}
            onChangeText={(v) => {
              setCode(v);
              setError(null);
            }}
            onComplete={verify}
          />
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable onPress={resend} hitSlop={8} style={styles.resendWrap}>
          <Text style={styles.resend}>
            {resent ? 'Codice reinviato ✓' : 'Non hai ricevuto il codice? Reinvia'}
          </Text>
        </Pressable>
      </View>

      <View style={styles.footer}>
        <GlassButton
          label="Verifica"
          onPress={() => verify(code)}
          loading={loading}
          disabled={code.length < 6}
        />
      </View>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, paddingTop: spacing['2xl'] },
  title: {
    color: colors.ink,
    fontSize: fontSize['3xl'],
    fontFamily: fontFamily.displayBold,
    letterSpacing: 0.2,
  },
  subtitle: {
    color: colors.muted,
    fontSize: fontSize.base,
    fontFamily: fontFamily.sans,
    marginTop: spacing.sm,
  },
  field: { marginTop: spacing['2xl'] },
  error: {
    color: colors.danger,
    fontSize: fontSize.sm,
    fontFamily: fontFamily.sans,
    marginTop: spacing.md,
  },
  resendWrap: { marginTop: spacing.lg, alignSelf: 'flex-start' },
  resend: { color: colors.accent, fontSize: fontSize.sm, fontFamily: fontFamily.semibold },
  footer: { marginBottom: spacing.lg, marginTop: spacing.xl },
});
