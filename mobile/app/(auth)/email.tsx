// =============================================================================
// Email — inserimento email per l'accesso passwordless. Invia un codice OTP a 6
// cifre e passa alla schermata di verifica. Tastiera-safe: niente autofocus
// durante la transizione, campo dentro a uno ScrollView con persistTaps.
// =============================================================================

import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { AuthHeader } from '@/components/auth/AuthHeader';
import { Input } from '@/components/ui/Input';
import { GlassButton } from '@/components/ui/GlassButton';
import { sendEmailOtp, authErrorMessage } from '@/lib/auth';
import { useOnboardingStore } from '@/store/onboardingStore';
import { colors, fontFamily, fontSize, spacing } from '@/constants/theme';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function EmailScreen() {
  const router = useRouter();
  const stored = useOnboardingStore((s) => s.email);
  const patch = useOnboardingStore((s) => s.patch);
  const [value, setValue] = useState(stored);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const valid = EMAIL_RE.test(value.trim());

  const submit = async () => {
    if (!valid) return;
    setLoading(true);
    setError(null);
    try {
      await sendEmailOtp(value);
      patch({ email: value.trim().toLowerCase(), method: 'email' });
      router.push('/verifica');
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeScreen scroll>
      <AuthHeader onBack={() => router.back()} />

      <View style={styles.body}>
        <Text style={styles.title}>Qual è la tua email?</Text>
        <Text style={styles.subtitle}>
          Ti mandiamo un codice di verifica, niente password da ricordare.
        </Text>
        <View style={styles.field}>
          <Input
            label="Email"
            value={value}
            onChangeText={(t) => {
              setValue(t);
              setError(null);
            }}
            placeholder="tu@esempio.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={submit}
            error={error}
          />
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.legal}>
          Continuando accetti i nostri <Text style={styles.link}>Termini di servizio</Text> e
          l’<Text style={styles.link}>Informativa sulla privacy</Text>.
        </Text>
        <GlassButton
          label="Invia codice di verifica"
          onPress={submit}
          loading={loading}
          disabled={!valid}
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
    lineHeight: 22,
  },
  field: { marginTop: spacing['2xl'] },
  footer: { gap: spacing.md, marginBottom: spacing.lg, marginTop: spacing.xl },
  legal: {
    color: colors.faint,
    fontSize: fontSize.xs,
    fontFamily: fontFamily.sans,
    lineHeight: 18,
    textAlign: 'center',
  },
  link: { color: colors.accent, fontFamily: fontFamily.medium },
});
