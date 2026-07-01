// =============================================================================
// Dettaglio Aura — l'andamento nel tempo + cosa significa l'Aura.
// =============================================================================
// Educazione al concept (l'Aura è reputazione VIVA, non popolarità: decade nel
// tempo, premia la presenza autentica) + grafico a barre degli snapshot
// settimanali (aura_snapshots). Niente librerie pesanti: barre semplici, colorate
// col vibe_color di ciascuna settimana.

import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/hooks/useAuth';
import { useAuraHistory, useMyAura } from '@/hooks/useAura';
import { AuraBreakdown } from '@/components/aura/AuraBreakdown';
import { AURA_HALF_LIFE_DAYS } from '@/constants/aura';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';

const CHART_HEIGHT = 140;

export default function DettaglioAura() {
  const router = useRouter();
  const { session } = useAuth();
  const uid = session?.user.id;
  const aura = useMyAura();
  const history = useAuraHistory(uid);

  const points = history.data ?? [];
  const maxScore = Math.max(...points.map((p) => p.score), 1);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>La tua Aura</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Cos'è l'Aura */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Cos&apos;è l&apos;Aura</Text>
          <Text style={styles.paragraph}>
            L&apos;Aura è la tua reputazione viva: misura la qualità della tua presenza, non la
            popolarità. Sale con le connessioni autentiche, la gentilezza, l&apos;accoglienza e il
            contributo; non con i follower o le ore passate nell&apos;app.
          </Text>
          <Text style={styles.paragraph}>
            È viva perché <Text style={styles.em}>decade nel tempo</Text>: ogni gesto pesa meno
            dopo circa {AURA_HALF_LIFE_DAYS} giorni. Conta esserci con costanza ed essere te
            stesso, settimana dopo settimana.
          </Text>
        </View>

        {/* Andamento settimanale */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Andamento</Text>
          {history.isLoading ? (
            <View style={styles.chartLoading}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : points.length === 0 ? (
            <Text style={styles.muted}>
              Ancora nessuno storico. Il primo riepilogo settimanale arriva con il prossimo
              ricalcolo.
            </Text>
          ) : (
            <View style={styles.chart}>
              {points.map((p) => {
                const h = Math.max(6, (p.score / maxScore) * CHART_HEIGHT);
                const week = p.periodStart.slice(5); // MM-DD
                return (
                  <View key={p.periodStart} style={styles.barCol}>
                    <View style={[styles.bar, { height: h, backgroundColor: p.vibeColor }]} />
                    <Text style={styles.barLabel}>{week}</Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* Scomposizione attuale per tratto */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>I tuoi tratti</Text>
          {aura.isLoading ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <AuraBreakdown breakdown={aura.data?.breakdown ?? {}} />
          )}
        </View>

        <View style={{ height: spacing['3xl'] }} />
      </ScrollView>
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
  content: { paddingHorizontal: spacing.lg, gap: spacing.lg },

  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardTitle: { color: colors.ink, fontSize: fontSize.base, fontFamily: fontFamily.semibold },
  paragraph: { color: colors.muted, fontFamily: fontFamily.sans, fontSize: fontSize.sm, lineHeight: 21 },
  em: { color: colors.ink, fontFamily: fontFamily.semibold },

  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    height: CHART_HEIGHT + 24,
    paddingTop: spacing.sm,
  },
  chartLoading: { height: CHART_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: spacing.xs },
  bar: { width: '70%', borderRadius: radius.sm, minHeight: 6 },
  barLabel: { color: colors.faint, fontSize: 10, fontFamily: fontFamily.medium },

  muted: { color: colors.faint, fontFamily: fontFamily.sans, fontSize: fontSize.sm, lineHeight: 20 },
});
