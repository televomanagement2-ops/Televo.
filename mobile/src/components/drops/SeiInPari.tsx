// =============================================================================
// SeiInPari — il blocco di fine feed (§16.1). L'anti-doomscroll reso VISIBILE e
// gratificante: il feed amici×24h è finito PER DESIGN, e lo celebriamo invece di
// riciclare contenuti. Micro-celebrazione + due CTA reali (crea un drop / manda
// un vocale a un amico). Compare solo quando NON ci sono altre pagine da caricare.
// =============================================================================

import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ROUTES } from '@/constants/routes';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';

export function SeiInPari() {
  return (
    <View style={styles.wrap}>
      <View style={styles.badge}>
        <Ionicons name="checkmark" size={26} color="#ffffff" />
      </View>
      <Text style={styles.title}>Sei in pari ✓</Text>
      <Text style={styles.subtitle}>
        Hai visto tutti i momenti dei tuoi amici delle ultime 24h. Domani è un altro giorno.
      </Text>
      <View style={styles.ctas}>
        <Text
          style={styles.cta}
          accessibilityRole="button"
          onPress={() => router.push(ROUTES.dropNuovo)}
        >
          ＋ Crea un drop
        </Text>
        <Text
          style={styles.cta}
          accessibilityRole="button"
          onPress={() => router.push(ROUTES.messages)}
        >
          Manda un vocale a un amico
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingVertical: spacing['2xl'],
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  badge: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  title: { color: colors.ink, fontSize: fontSize.lg, fontFamily: fontFamily.semibold },
  subtitle: {
    color: colors.muted,
    fontSize: fontSize.sm,
    fontFamily: fontFamily.sans,
    textAlign: 'center',
    lineHeight: 20,
  },
  ctas: { alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  cta: {
    color: colors.accentSoft,
    fontSize: fontSize.sm,
    fontFamily: fontFamily.semibold,
    paddingVertical: 6,
  },
});
