// =============================================================================
// Menu — l'hamburger. Profilo (con avatar/username reali) in cima, poi le voci
// che apriranno (presto) le sezioni dell'app, e infine il Logout reale.
// =============================================================================

import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '@/components/ui/Avatar';
import { useAuth } from '@/hooks/useAuth';
import { conferma } from '@/lib/dialoghi';
import { ROUTES } from '@/constants/routes';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';

interface Voce {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  soon?: boolean;
  onPress?: () => void;
}

export default function Menu() {
  const router = useRouter();
  const { profile, signOut } = useAuth();

  const confermaLogout = () => {
    conferma({
      titolo: 'Esci',
      messaggio: 'Vuoi uscire dal tuo account?',
      confermaLabel: 'Esci',
      distruttiva: true,
      onConferma: () => signOut(),
    });
  };

  // Il Profilo si apre SOLO dal cerchio avatar nell'header della Home: qui il
  // menu resta per le sezioni future (niente voce "Profilo").
  const voci: Voce[] = [
    { icon: 'people-outline', label: 'Amici', onPress: () => router.push(ROUTES.amici) },
    {
      icon: 'navigate-outline',
      label: 'Posizione e mappa',
      onPress: () => router.push(ROUTES.impostazioniPosizione),
    },
    { icon: 'gift-outline', label: 'Invita amici', soon: true },
    { icon: 'settings-outline', label: 'Impostazioni', soon: true },
    { icon: 'shield-checkmark-outline', label: 'Privacy e dati', soon: true },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Intestazione non premibile: il profilo si apre dall'header Home. */}
        <View style={styles.profile}>
          <Avatar uri={profile?.avatar_url} name={profile?.username} size={56} />
          <View style={styles.profileText}>
            <Text style={styles.name}>{profile?.display_name || profile?.username || 'Tu'}</Text>
            {profile?.username ? <Text style={styles.username}>@{profile.username}</Text> : null}
          </View>
        </View>

        <View style={styles.group}>
          {voci.map((v) => (
            <Pressable
              key={v.label}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={v.onPress}
              disabled={v.soon}
            >
              <Ionicons name={v.icon} size={22} color={v.soon ? colors.faint : colors.ink} />
              <Text style={[styles.rowLabel, v.soon && styles.rowLabelSoon]}>{v.label}</Text>
              {v.soon ? <Text style={styles.soon}>presto</Text> : null}
            </Pressable>
          ))}
        </View>

        <Pressable
          style={({ pressed }) => [styles.logout, pressed && styles.rowPressed]}
          onPress={confermaLogout}
        >
          <Ionicons name="log-out-outline" size={22} color={colors.danger} />
          <Text style={styles.logoutLabel}>Esci</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.base },
  content: { padding: spacing.lg, paddingBottom: 100, gap: spacing.lg },
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  profileText: { flex: 1, gap: 2 },
  name: { color: colors.ink, fontSize: fontSize.lg, fontFamily: fontFamily.semibold },
  username: { color: colors.muted, fontSize: fontSize.sm, fontFamily: fontFamily.sans },
  group: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  rowPressed: { backgroundColor: colors.elevated },
  rowLabel: { flex: 1, color: colors.ink, fontSize: fontSize.base, fontFamily: fontFamily.medium },
  rowLabelSoon: { color: colors.muted },
  soon: { color: colors.faint, fontSize: fontSize.xs, fontFamily: fontFamily.medium },
  logout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  logoutLabel: { color: colors.danger, fontSize: fontSize.base, fontFamily: fontFamily.semibold },
});
