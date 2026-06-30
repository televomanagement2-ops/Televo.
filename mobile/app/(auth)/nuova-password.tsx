// =============================================================================
// Nuova password — ultimo passo del recupero. Ci si arriva dopo aver verificato
// l'OTP di reset: la sessione è già attiva, quindi possiamo aggiornare la
// password (updateUser). Poi si instrada secondo lo stato del profilo.
// =============================================================================

import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { AuthHeader } from '@/components/auth/AuthHeader';
import { Input } from '@/components/ui/Input';
import { GlassButton } from '@/components/ui/GlassButton';
import { updatePassword, fetchMyProfile, authErrorMessage } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useOnboardingStore } from '@/store/onboardingStore';
import { colors, fontFamily, fontSize, spacing } from '@/constants/theme';

const MIN_LEN = 8;

export default function NuovaPasswordScreen() {
  const router = useRouter();
  const patch = useOnboardingStore((s) => s.patch);

  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const valid = password.length >= MIN_LEN;

  const submit = async () => {
    if (!valid) return;
    setLoading(true);
    setError(null);
    try {
      await updatePassword(password);
      patch({ resetFlow: false });
      // Sessione già attiva: instrada secondo il profilo.
      const { data } = await supabase.auth.getUser();
      const profile = data.user ? await fetchMyProfile(data.user.id) : null;
      router.replace(profile?.age_verified ? '/home' : '/registrazione');
    } catch (e) {
      setError(authErrorMessage(e));
      setLoading(false);
    }
  };

  return (
    <SafeScreen scroll>
      <AuthHeader showHelp />

      <View style={styles.body}>
        <Text style={styles.title}>Scegli una nuova password</Text>
        <Text style={styles.subtitle}>Almeno 8 caratteri. Usa qualcosa che ricordi.</Text>

        <View style={styles.field}>
          <Input
            label="Nuova password"
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
      </View>

      <View style={styles.footer}>
        <GlassButton label="Salva e continua" onPress={submit} loading={loading} disabled={!valid} />
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
  eye: { position: 'absolute', right: spacing.lg, top: 38 },
  footer: { marginBottom: spacing.lg, marginTop: spacing.xl },
});
