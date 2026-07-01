// =============================================================================
// Crea — la schermata del "+" centrale: il punto d'accesso alla creazione di
// contenuti. Elenca TUTTI i tipi di contenuto creabili dell'app (derivati dai
// domini del backend, vedi constants/createTypes.ts). Per ora è il FRAME: le
// opzioni sono disabilitate ("presto"). I flussi di creazione veri (drop, stanza
// live, media, vocale, prop, gruppo) si attivano uno a uno nei round successivi.
// =============================================================================

import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/ui/Card';
import { CREATE_TYPES } from '@/constants/createTypes';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';

export default function Crea() {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Cosa vuoi condividere?</Text>
        <Text style={styles.subtitle}>
          Tutto ciò che potrai creare su Televo. Le creazioni arrivano presto.
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {CREATE_TYPES.map((o) => (
          <Card key={o.key} style={styles.card}>
            <View style={styles.iconWrap}>
              <Ionicons name={o.icon} size={24} color={colors.faint} />
            </View>
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>{o.title}</Text>
              <Text style={styles.cardSub}>{o.subtitle}</Text>
            </View>
            {o.enabled ? (
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            ) : (
              <Text style={styles.soon}>presto</Text>
            )}
          </Card>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.base },
  header: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.xs },
  title: { color: colors.ink, fontSize: 22, fontFamily: fontFamily.displayBold },
  subtitle: { color: colors.muted, fontSize: fontSize.sm, fontFamily: fontFamily.sans },
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: 100, gap: spacing.md },
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, opacity: 0.7 },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.elevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: { flex: 1, gap: 2 },
  cardTitle: { color: colors.ink, fontSize: fontSize.base, fontFamily: fontFamily.semibold },
  cardSub: { color: colors.muted, fontSize: fontSize.sm, fontFamily: fontFamily.sans },
  soon: { color: colors.faint, fontSize: fontSize.xs, fontFamily: fontFamily.medium },
});
