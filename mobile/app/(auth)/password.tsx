// =============================================================================
// Password — secondo passo dell'accesso via email. Si arriva qui dopo aver
// inserito l'email. Logica a flusso unico (scelta di prodotto):
//   1) si tenta l'ACCESSO (signInWithPassword);
//   2) se le credenziali sono invalide → l'email potrebbe essere nuova: si
//      propone di CREARE l'account con questa password (signUpWithPassword).
// "Password dimenticata?" passa al canale OTP per reimpostare la password.
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
  authErrorMessage,
} from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useOnboardingStore } from '@/store/onboardingStore';
import { colors, fontFamily, fontSize, spacing } from '@/constants/theme';

const MIN_LEN = 8;

export default function PasswordScreen() {
  const router = useRouter();
  const email = useOnboardingStore((s) => s.email);
  const patch = useOnboardingStore((s) => s.patch);

  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Quando l'accesso fallisce per credenziali invalide, proponiamo la creazione.
  const [offerSignUp, setOfferSignUp] = useState(false);

  const valid = password.length >= MIN_LEN;

  // Dopo accesso/creazione la sessione è attiva: instrada secondo il profilo.
  const routeAfterAuth = async () => {
    const { data } = await supabase.auth.getUser();
    const profile = data.user ? await fetchMyProfile(data.user.id) : null;
    router.replace(profile?.age_verified ? '/home' : '/registrazione');
  };

  const accedi = async () => {
    if (!valid) return;
    setLoading(true);
    setError(null);
    try {
      await signInWithPassword(email, password);
      await routeAfterAuth();
    } catch (e) {
      if (isInvalidCredentials(e)) {
        // Email forse nuova: offri la creazione con questa password.
        setOfferSignUp(true);
        setError('Non abbiamo trovato un account, oppure la password è errata.');
      } else {
        setError(authErrorMessage(e));
      }
      setLoading(false);
    }
  };

  const crea = async () => {
    if (!valid) return;
    setLoading(true);
    setError(null);
    try {
      await signUpWithPassword(email, password);
      await routeAfterAuth();
    } catch (e) {
      setError(authErrorMessage(e));
      setLoading(false);
    }
  };

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
        <Text style={styles.title}>{offerSignUp ? 'Crea il tuo account' : 'Inserisci la password'}</Text>
        <Text style={styles.subtitle}>
          {offerSignUp
            ? `Useremo questa password per creare l'account ${email}.`
            : `Accedi a ${email}.`}
        </Text>

        <View style={styles.field}>
          <Input
            label="Password"
            value={password}
            onChangeText={(t) => {
              setPassword(t);
              setError(null);
              setOfferSignUp(false);
            }}
            placeholder="Almeno 8 caratteri"
            secureTextEntry={!show}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={offerSignUp ? crea : accedi}
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

        {!offerSignUp ? (
          <Pressable onPress={dimenticata} hitSlop={8} style={styles.forgotWrap}>
            <Text style={styles.forgot}>Password dimenticata?</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.footer}>
        <GlassButton
          label={offerSignUp ? 'Crea account e continua' : 'Accedi'}
          onPress={offerSignUp ? crea : accedi}
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
