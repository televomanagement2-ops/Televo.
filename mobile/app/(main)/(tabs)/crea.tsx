// =============================================================================
// Crea (tab) — la schermata-frame è stata SOSTITUITA dal menu di creazione (S0,
// R-16): il + della BottomBar apre il bottom sheet MenuCrea senza navigare qui.
// Questa rotta resta come fallback difensivo: se qualcosa naviga a /crea, apre
// comunque il menu e mostra un placeholder discreto (mai una schermata vuota).
// =============================================================================

import { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCreaMenuStore } from '@/store/creaMenuStore';
import { colors, fontFamily, fontSize, spacing } from '@/constants/theme';

export default function Crea() {
  const open = useCreaMenuStore((s) => s.open);

  // All'ingresso apri il menu di creazione (S0).
  useFocusEffect(
    useCallback(() => {
      open();
    }, [open]),
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.center}>
        <Ionicons name="add-circle-outline" size={44} color={colors.faint} />
        <Text style={styles.text}>Tocca ＋ per creare</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.base },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  text: { color: colors.muted, fontSize: fontSize.base, fontFamily: fontFamily.medium },
});
