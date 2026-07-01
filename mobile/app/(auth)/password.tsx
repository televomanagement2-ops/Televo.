// =============================================================================
// Password — secondo passo via email. Il comportamento dipende dall'INTENT scelto
// nella welcome:
//   • signup ("Continua con email") → CREA l'account (signUpWithPassword) e va
//     all'onboarding. Se l'email esiste già, suggerisce di accedere.
//   • signin ("Accedi") → ACCEDE (signInWithPassword). Se le credenziali sono
//     errate, lo dice (niente creazione silenziosa). "Password dimenticata?" → OTP.
// =============================================================================

import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { AuthHeader } from '@/components/auth/AuthHeader';
import { Input } from '@/components/ui/Input';
import { GlassButton } from '@/components/ui/GlassButton';
import {
  signInWithPassword,
  signUpWithPassword,
  sendEmailOtp,
  fetchMyProfile,
  isInvalidCredentials,
  isUserAlreadyRegistered,
  authErrorMessage,
} from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useOnboardingStore } from '@/store/onboardingStore';
import { colors, fontFamily, fontSize, spacing } from '@/constants/theme';

const MIN_LEN = 8;

export default function PasswordScreen() {
  const router = useRouter();
  const email = useOnboardingStore((s) => s.email);
  const intent = useOnboardingStore((s) => s.intent);
  const patch = useOnboardingStore((s) => s.patch);

  const isSignup = intent === 'signup';

  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const valid = password.length >= MIN_LEN;

  // Dopo accesso/creazione la sessione è attiva: instrada secondo il profilo.
  const routeAfterAuth = async () => {
    const { data } = await supabase.auth.getUser();
    const profile = data.user ? await fetchMyProfile(data.user.id) : null;
    router.replace(profile?.age_verified ? '/home' : '/registrazione');
  };

  // ACCESSO (intent 'signin'): credenziali errate → messaggio, niente creazione.
  const accedi = async () => {
    if (!valid) return;
    setLoading(true);
    setError(null);
    try {
      await signInWithPassword(email, password);
      await routeAfterAuth();
    } catch (e) {
      setError(isInvalidCredentials(e) ? 'Email o password non corretti.' : authErrorMessage(e));
      setLoading(false);
    }
  };

  // REGISTRAZIONE (intent 'signup'): crea l'account → onboarding. Email già usata
  // → suggerisce di accedere (torna alla welcome → "Accedi").
  const crea = async () => {
    if (!valid) return;
    setLoading(true);
    setError(null);
    try {
      await signUpWithPassword(email, password);
      await routeAfterAuth();
    } catch (e) {
      setError(
        isUserAlreadyRegistered(e)
          ? 'Esiste già un account con questa email. Torna indietro e usa “Accedi”.'
          : authErrorMessage(e),
      );
      setLoading(false);
    }
  };

  const submit = isSignup ? crea : accedi;

  const dimenticata = async () => {
    setError(null);
    try {
      await sendEmailOtp(email);
      patch({ resetFlow: true, method: 'email' });
      router.push('/verifica');
    } catch (e) {
      setError(authErrorMessage(e));
    }
  };

  return (
    <SafeScreen scroll>
      <AuthHeader onBack={() => router.back()} />

      <View style={styles.body}>
        <Text style={styles.title}>{isSignup ? 'Crea una password' : 'Bentornato'}</Text>
        <Text style={styles.subtitle}>
          {isSignup
            ? `La useremo per il tuo nuovo account ${email}.`
            : `Accedi a ${email}.`}
        </Text>

        <View style={styles.field}>
          <Input
            label="Password"
            value={password}
            onChangeText={(t) => {
              setPassword(t);
              setError(null);
            }}
            placeholder="Almeno 8 caratteri"
            secureTextEntry={!show}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={submit}
            error={error}
          />
          <Pressable style={styles.eye} onPress={() => setShow((s) => !s)} hitSlop={8}>
            <Ionicons
              name={show ? 'eye-off-outline' : 'eye-outline'}
              size={22}
              color={colors.muted}
            />
          </Pressable>
        </View>

        {!isSignup ? (
          <Pressable onPress={dimenticata} hitSlop={8} style={styles.forgotWrap}>
            <Text style={styles.forgot}>Password dimenticata?</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.footer}>
        <GlassButton
          label={isSignup ? 'Crea account' : 'Accedi'}
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
  field: { marginTop: spacing['2xl'], justifyContent: 'center' },
  // L'occhio è allineato verticalmente al campo (label sopra + campo h58).
  eye: { position: 'absolute', right: spacing.lg, top: 38 },
  forgotWrap: { marginTop: spacing.lg, alignSelf: 'flex-start' },
  forgot: { color: colors.accent, fontSize: fontSize.sm, fontFamily: fontFamily.semibold },
  footer: { marginBottom: spacing.lg, marginTop: spacing.xl },
});
