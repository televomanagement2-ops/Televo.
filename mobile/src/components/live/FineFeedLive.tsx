// =============================================================================
// FineFeedLive — il segno di fine del feed verticale live (M15 / LR7, RW-5).
// =============================================================================
// Gemello di SeiInPari dei drops (§16.1): il feed è finito PER DESIGN — niente
// riempitivi, niente loop — e lo diciamo con una micro-celebrazione + una CTA
// reale. Reso come ListFooterComponent del pager SOLO quando non ci sono altre
// pagine da caricare (!hasMore) e almeno una live è stata vista.
//
// L'altezza è ESATTAMENTE quella di una pagina del pager (prop `altezza` = la
// misura di getItemLayout): il paging snappa pulito sull'ultima "pagina" e,
// quando il footer è la pagina visibile, `viewableItems` è vuoto → nessuna
// live `attiva` → TUTTE le preview disconnesse (budget LiveKit R-3 gratis).

import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { ROUTES } from '@/constants/routes';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';

interface Props {
  /** Altezza esatta di una pagina del pager (misurata da LiveFeed al layout). */
  altezza: number;
}

export function FineFeedLive({ altezza }: Props) {
  return (
    <View style={[styles.wrap, { height: altezza }]}>
      <View style={styles.badge}>
        <Ionicons name="checkmark" size={26} color="#ffffff" />
      </View>
      <Text style={styles.title}>Sei in pari</Text>
      <Text style={styles.subtitle}>Non ci sono altre live in corso tra i tuoi amici.</Text>
      <View style={styles.cta}>
        <Button label="Avvia una live" onPress={() => router.push(ROUTES.liveNuovo)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
    paddingBottom: 90, // otticamente centrato sopra la bottom bar floating
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
  cta: { marginTop: spacing.md },
});
