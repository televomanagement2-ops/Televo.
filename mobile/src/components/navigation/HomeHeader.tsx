// =============================================================================
// HomeHeader — intestazione della Home. Tre zone:
//   sinistra: cerchio avatar → apre il profilo
//   centro:   wordmark "televo"
//   destra:   icona ricerca → apre la ricerca
// =============================================================================

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '@/components/ui/Avatar';
import { useAuth } from '@/hooks/useAuth';
import { colors, fontFamily, spacing } from '@/constants/theme';

export function HomeHeader() {
  const router = useRouter();
  const { profile } = useAuth();

  return (
    <View style={styles.header}>
      <Pressable
        onPress={() => router.push('/profilo')}
        hitSlop={8}
        accessibilityLabel="Apri il profilo"
      >
        <Avatar uri={profile?.avatar_url} name={profile?.username} size={38} />
      </Pressable>

      <Text style={styles.wordmark}>televo</Text>

      <Pressable
        onPress={() => router.push('/cerca')}
        hitSlop={8}
        accessibilityLabel="Cerca"
        style={styles.search}
      >
        <Ionicons name="search" size={24} color={colors.ink} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  wordmark: {
    color: colors.ink,
    fontSize: 22,
    fontFamily: fontFamily.displayBold,
    letterSpacing: 0.5,
  },
  // Stessa larghezza dell'avatar per tenere il wordmark perfettamente centrato.
  search: { width: 38, alignItems: 'flex-end' },
});
