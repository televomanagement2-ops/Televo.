// =============================================================================
// Messaggi — voce della bottom bar. Placeholder reale finché non costruiamo la
// chat (DM tra amici + vocali effimeri): è la feature M5.
// =============================================================================

import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ComingSoon } from '@/components/feed/ComingSoon';
import { colors, fontFamily, spacing } from '@/constants/theme';

export default function Messages() {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Messaggi</Text>
      </View>
      <View style={styles.body}>
        <ComingSoon
          icon="chatbubbles-outline"
          title="Le chat arrivano presto"
          subtitle="Scriverai e manderai vocali ai tuoi amici. I vocali sono effimeri: spariscono entro 24 ore."
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.base },
  header: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  title: { color: colors.ink, fontSize: 22, fontFamily: fontFamily.displayBold },
  body: { flex: 1, justifyContent: 'center' },
});
