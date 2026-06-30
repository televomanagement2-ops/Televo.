// =============================================================================
// Home (placeholder) — chiude il loop dopo l'onboarding: conferma "sei dentro" e
// permette il logout. La vera home arriva con M2.
// =============================================================================

import { StyleSheet, Text, View } from 'react-native';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { Wordmark } from '@/components/brand/Wordmark';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import { colors, fontFamily, fontSize, spacing } from '@/constants/theme';

export default function Home() {
  const { profile, signOut } = useAuth();

  return (
    <SafeScreen>
      <View style={styles.hero}>
        <Wordmark size={fontSize['3xl']} />
        <Text style={styles.hi}>
          Sei dentro{profile?.username ? `, @${profile.username}` : ''} 👋
        </Text>
        <Text style={styles.sub}>
          La tua home arriverà presto. Per ora conta una cosa sola: ci sei, e sei reale.
        </Text>
      </View>
      <View style={styles.footer}>
        <Button label="Esci" variant="secondary" onPress={signOut} />
      </View>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  hero: { flex: 1, justifyContent: 'center', gap: spacing.sm },
  hi: {
    color: colors.ink,
    fontSize: fontSize['2xl'],
    fontFamily: fontFamily.displayBold,
    marginTop: spacing.lg,
  },
  sub: { color: colors.muted, fontSize: fontSize.base, fontFamily: fontFamily.sans, lineHeight: 23 },
  footer: { marginBottom: spacing.lg },
});
