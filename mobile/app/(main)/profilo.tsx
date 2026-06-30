// =============================================================================
// Profilo (proprio) — si apre dal cerchio avatar nell'header della Home (è una
// schermata stack sopra i tab, non una tab). Per ora mostra avatar/nome/username
// reali; l'Aura viva e le classifiche arrivano con M3.
// =============================================================================

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '@/components/ui/Avatar';
import { ComingSoon } from '@/components/feed/ComingSoon';
import { useAuth } from '@/hooks/useAuth';
import { colors, fontFamily, fontSize, spacing } from '@/constants/theme';

export default function Profilo() {
  const router = useRouter();
  const { profile } = useAuth();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>Profilo</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.hero}>
        <Avatar uri={profile?.avatar_url} name={profile?.username} size={96} />
        <Text style={styles.name}>{profile?.display_name || profile?.username || 'Tu'}</Text>
        {profile?.username ? <Text style={styles.username}>@{profile.username}</Text> : null}
      </View>

      <ComingSoon
        icon="sparkles-outline"
        title="La tua Aura arriva presto"
        subtitle="Qui vedrai il tuo anello vivo, le classifiche per carattere e i prop ricevuti."
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.base },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  headerTitle: { color: colors.ink, fontSize: fontSize.lg, fontFamily: fontFamily.semibold },
  headerSpacer: { width: 26 },
  hero: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  name: { color: colors.ink, fontSize: fontSize.xl, fontFamily: fontFamily.displayBold, marginTop: spacing.sm },
  username: { color: colors.muted, fontSize: fontSize.base, fontFamily: fontFamily.sans },
});
