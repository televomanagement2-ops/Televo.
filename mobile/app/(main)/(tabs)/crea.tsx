// =============================================================================
// Crea — la schermata del "+" centrale: il punto d'accesso alla creazione di
// contenuti. Per ora è solo il frame: le opzioni sono disabilitate ("presto").
// La creazione vera (drop, stanza live) arriva con i round M4/M6.
// =============================================================================

import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/ui/Card';
import { colors, fontFamily, fontSize, spacing } from '@/constants/theme';

interface Opzione {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
}

const OPZIONI: Opzione[] = [
  { icon: 'flash-outline', title: 'Drop', subtitle: 'Un momento effimero, sparisce in 24 ore' },
  { icon: 'radio-outline', title: 'Stanza Live', subtitle: 'Apri una stanza audio dal vivo' },
  { icon: 'film-outline', title: 'Reel', subtitle: 'Prossimamente' },
];

export default function Crea() {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Cosa vuoi condividere?</Text>
        <Text style={styles.subtitle}>Le creazioni arrivano presto. Per ora dai un’occhiata.</Text>
      </View>
      <View style={styles.list}>
        {OPZIONI.map((o) => (
          <Card key={o.title} style={styles.card}>
            <View style={styles.iconWrap}>
              <Ionicons name={o.icon} size={24} color={colors.faint} />
            </View>
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>{o.title}</Text>
              <Text style={styles.cardSub}>{o.subtitle}</Text>
            </View>
            <Text style={styles.soon}>presto</Text>
          </Card>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.base },
  header: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.xs },
  title: { color: colors.ink, fontSize: 22, fontFamily: fontFamily.displayBold },
  subtitle: { color: colors.muted, fontSize: fontSize.sm, fontFamily: fontFamily.sans },
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.md },
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, opacity: 0.7 },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.elevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: { flex: 1, gap: 2 },
  cardTitle: { color: colors.ink, fontSize: fontSize.base, fontFamily: fontFamily.semibold },
  cardSub: { color: colors.muted, fontSize: fontSize.sm, fontFamily: fontFamily.sans },
  soon: { color: colors.faint, fontSize: fontSize.xs, fontFamily: fontFamily.medium },
});
