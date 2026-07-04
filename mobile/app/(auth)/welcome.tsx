// =============================================================================
// Welcome — la schermata d'accesso. Collage di foto sullo sfondo, il marchio in
// alto, lo slogan, e i tre metodi d'accesso (Facebook, Google, email) + "Accedi".
// Email è attiva subito; Google/Facebook usano l'OAuth di Supabase (vanno
// abilitati in dashboard). Il telefono è stato rimosso (SMS non attivo).
// =============================================================================

import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BrandLockup } from '@/components/brand/BrandLockup';
import { GoogleGlyph } from '@/components/brand/GoogleGlyph';
import { LoginBackground } from '@/components/auth/LoginBackground';
import { AuthButton } from '@/components/auth/AuthButton';
import { signInWithProvider, authErrorMessage, type OAuthProvider } from '@/lib/auth';
import { avvisa } from '@/lib/dialoghi';
import { useOnboardingStore } from '@/store/onboardingStore';
import { colors, fontFamily, fontSize, spacing } from '@/constants/theme';

export default function Welcome() {
  const router = useRouter();
  const patch = useOnboardingStore((s) => s.patch);
  const [busy, setBusy] = useState<OAuthProvider | null>(null);

  const onProvider = async (provider: OAuthProvider) => {
    if (busy) return;
    setBusy(provider);
    try {
      await signInWithProvider(provider);
      // Sessione attiva: l'index instrada (registrazione se nuovo, home se già onboardato).
      router.replace('/');
    } catch (e) {
      const msg = authErrorMessage(e);
      if (msg) avvisa('Accesso', msg);
    } finally {
      setBusy(null);
    }
  };

  // "Continua con email" = REGISTRAZIONE (crea account); "Accedi" = ACCESSO.
  const goRegistrati = () => {
    patch({ method: 'email', intent: 'signup', resetFlow: false });
    router.push('/email');
  };
  const goAccedi = () => {
    patch({ method: 'email', intent: 'signin', resetFlow: false });
    router.push('/email');
  };

  return (
    <View style={styles.root}>
      <LoginBackground />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <BrandLockup size={58} />
            <Text style={styles.headline}>Entra nel reale.{'\n'}Condividi l’autentico.</Text>
            <Text style={styles.subtitle}>
              Televo è il social dove ogni momento diventa connessione.
            </Text>
          </View>

          <View style={styles.spacer} />

          <View style={styles.actions}>
            <AuthButton
              label="Continua con Facebook"
              variant="light"
              onPress={() => onProvider('facebook')}
              loading={busy === 'facebook'}
              disabled={!!busy && busy !== 'facebook'}
              icon={<Ionicons name="logo-facebook" size={22} color="#1877F2" />}
            />
            <AuthButton
              label="Continua con Google"
              onPress={() => onProvider('google')}
              loading={busy === 'google'}
              disabled={!!busy && busy !== 'google'}
              icon={<GoogleGlyph size={20} />}
            />
            <AuthButton
              label="Continua con email"
              onPress={goRegistrati}
              disabled={!!busy}
              icon={<Ionicons name="mail-outline" size={21} color={colors.ink} />}
            />

            <View style={styles.divider}>
              <View style={styles.line} />
              <Text style={styles.dividerText}>oppure</Text>
              <View style={styles.line} />
            </View>

            <AuthButton label="Accedi" variant="outline" onPress={goAccedi} disabled={!!busy} />

            <Text style={styles.legal}>
              Continuando accetti i nostri <Text style={styles.link}>Termini di servizio</Text> e
              l’<Text style={styles.link}>Informativa sulla privacy</Text>.
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

// Quote calibrate sul mockup (639×1384 → 393×851 pt, scala 1.626 px/pt):
//   padding orizzontale 73px→45pt · logo size 58 · gap logo→headline ~65pt ·
//   headline 28pt/lineH 36 · headline→subtitle ~28pt · gap pulsanti 10pt ·
//   colori: sottotitolo #848484, divider/oppure #696969, legale #757575.
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.base },
  safe: { flex: 1 },
  content: {
    flexGrow: 1,
    paddingHorizontal: 45,
    paddingTop: 64,
    paddingBottom: 18,
  },
  header: { alignItems: 'center' },
  headline: {
    color: '#ffffff',
    fontSize: 28,
    lineHeight: 36,
    fontFamily: fontFamily.displayBold,
    textAlign: 'center',
    marginTop: 40,
  },
  subtitle: {
    color: '#9a9a9c',
    fontSize: 15,
    fontFamily: fontFamily.sans,
    textAlign: 'center',
    lineHeight: 21,
    marginTop: 16,
    paddingHorizontal: spacing.sm,
  },
  spacer: { flex: 1, minHeight: spacing['2xl'] },
  actions: { gap: 10 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginVertical: 6 },
  line: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: '#3a3a3d' },
  dividerText: { color: '#696969', fontSize: fontSize.base, fontFamily: fontFamily.sans },
  legal: {
    color: '#757575',
    fontSize: 13,
    fontFamily: fontFamily.sans,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  link: { color: colors.accent, fontFamily: fontFamily.semibold },
});
