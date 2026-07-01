// =============================================================================
// HomeHeader — intestazione della Home. Tre zone:
//   sinistra: cerchio avatar con ANELLO Aura → apre il profilo
//   centro:   wordmark "Televo" come immagine (BrandLockup) — discreto
//   destra:   icona ricerca → apre la ricerca
// =============================================================================

import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '@/components/ui/Avatar';
import { AuraAvatarRing } from '@/components/aura/AuraAvatarRing';
import { BrandLockup } from '@/components/brand/BrandLockup';
import { useAuth } from '@/hooks/useAuth';
import { useMyAura } from '@/hooks/useAura';
import { colors, spacing } from '@/constants/theme';

export function HomeHeader() {
  const router = useRouter();
  const { profile } = useAuth();
  const aura = useMyAura();
  const auraPercent = Math.round(aura.data?.score ?? 0);

  return (
    <View style={styles.header}>
      <Pressable
        onPress={() => router.push('/profilo')}
        hitSlop={8}
        accessibilityLabel="Apri il profilo"
      >
        <AuraAvatarRing percent={auraPercent} size={38} strokeWidth={3} still>
          <Avatar uri={profile?.avatar_url} name={profile?.username} size={38} />
        </AuraAvatarRing>
      </Pressable>

      {/* Wordmark ufficiale (immagine viola→fucsia): discreto, ~18pt di glifo. */}
      <BrandLockup size={18} />

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
  // Stessa larghezza dell'avatar+anello (size 38 + bloom) per tenere il wordmark
  // perfettamente centrato.
  search: { width: 54, alignItems: 'flex-end' },
});
