// =============================================================================
// Telefono — inserimento numero per l'accesso via SMS (OTP). Prefisso Italia +39
// di default (lancio a Terni). Invia il codice e passa alla verifica.
// NB: richiede l'SMS attivo lato backend (provider Twilio); altrimenti l'invio
// fallisce con grazia e mostriamo il messaggio.
// =============================================================================

import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { AuthHeader } from '@/components/auth/AuthHeader';
import { Input } from '@/components/ui/Input';
import { GlassButton } from '@/components/ui/GlassButton';
import { sendPhoneOtp, authErrorMessage } from '@/lib/auth';
import { useOnboardingStore } from '@/store/onboardingStore';
import { colors, fontFamily, fontSize, spacing } from '@/constants/theme';

const PREFIX = '+39'; // Italia (lancio Terni). In futuro: selettore paese.

export default function TelefonoScreen() {
  const router = useRouter();
  const patch = useOnboardingStore((s) => s.patch);
  const [digits, setDigits] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const valid = digits.length >= 6;
  const e164 = `${PREFIX}${digits}`;

  const submit = async () => {
    if (!valid) return;
    setLoading(true);
    setError(null);
    try {
      await sendPhoneOtp(e164);
      patch({ phone: e164, method: 'phone' });
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
        <Text style={styles.title}>Il tuo numero?</Text>
        <Text style={styles.subtitle}>Ti mandiamo un codice via SMS per verificarti.</Text>

        <View style={styles.field}>
          <Text style={styles.label}>Numero di telefono</Text>
          <View style={styles.row}>
            <View style={styles.prefix}>
              <Text style={styles.prefixText}>🇮🇹 {PREFIX}</Text>
            </View>
            <Input
              containerStyle={styles.numberWrap}
              value={digits}
              onChangeText={(t) => {
                // Solo cifre; togliamo un eventuale 0 iniziale (formato nazionale).
                const clean = t.replace(/\D/g, '').replace(/^0+/, '');
                setDigits(clean);
                setError(null);
              }}
              placeholder="333 123 4567"
              keyboardType="phone-pad"
              returnKeyType="go"
              onSubmitEditing={submit}
              error={error}
            />
          </View>
        </View>
      </View>

      <View style={styles.footer}>
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
  label: {
    color: colors.muted,
    fontSize: fontSize.sm,
    fontFamily: fontFamily.medium,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  prefix: {
    height: 58,
    paddingHorizontal: spacing.lg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prefixText: { color: colors.ink, fontSize: fontSize.base, fontFamily: fontFamily.semibold },
  numberWrap: { flex: 1 },
  footer: { marginBottom: spacing.lg, marginTop: spacing.xl },
});
