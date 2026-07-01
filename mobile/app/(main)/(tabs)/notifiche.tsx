// =============================================================================
// Notifiche — voce della bottom bar. Placeholder reale finché non colleghiamo il
// ledger notifiche e i permessi push (Edge send-push già pronta lato backend):
// è la feature M8.
// =============================================================================

import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ComingSoon } from '@/components/feed/ComingSoon';
import { colors, fontFamily, spacing } from '@/constants/theme';

export default function Notifiche() {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Avvisi</Text>
      </View>
      <View style={styles.body}>
        <ComingSoon
          icon="notifications-outline"
          title="Le notifiche arrivano presto"
          subtitle="Saprai chi ti ha mandato un prop, chi è entrato in live e le richieste di amicizia."
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.base },
  header: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  title: { color: colors.ink, fontSize: 22, fontFamily: fontFamily.displayBold },
  body: { flex: 1, justifyContent: 'center', paddingBottom: 90 },
});
