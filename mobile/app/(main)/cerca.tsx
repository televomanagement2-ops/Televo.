// =============================================================================
// Cerca — si apre dall'icona ricerca nell'header della Home (schermata stack
// sopra i tab). Per ora è il frame: la ricerca di persone/stanze arriva più
// avanti, quando i contenuti reali sono collegati.
// =============================================================================

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ComingSoon } from '@/components/feed/ComingSoon';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';

export default function Cerca() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={colors.faint} />
          <Text style={styles.placeholder}>Cerca persone, stanze…</Text>
        </View>
      </View>

      <View style={styles.body}>
        <ComingSoon
          icon="search-outline"
          title="La ricerca arriva presto"
          subtitle="Troverai amici, stanze live e tutto ciò che conta su Televo."
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.base },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 44,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  placeholder: { color: colors.faint, fontSize: fontSize.base, fontFamily: fontFamily.sans },
  body: { flex: 1, justifyContent: 'center' },
});
