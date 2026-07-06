// =============================================================================
// S5 — Ricordi (DM4). L'archivio privato dell'autore (stile BeReal Memories): i
// miei drop scaduti, visibili SOLO a me, con le statistiche finali congelate.
// Griglia keyset desc (retention illimitata, R-10) → tap → vista Ricordo a
// schermo intero (Modal) col contenuto e le `stats_finali`; ⋯ → Elimina
// definitivamente (rimuove riga + file via coda cleanup, §5.4). Ingresso dal
// proprio profilo. La RLS su `drops` mostra all'autore i propri drop scaduti;
// per gli amici sono già spariti.
// =============================================================================

import { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { StatoErrore } from '@/components/ui/StatoErrore';
import { RicordiGrid, RicordoView } from '@/components/drops/RicordiGrid';
import { useDeleteDrop, useMemories } from '@/hooks/useDrops';
import { avvisa } from '@/lib/dialoghi';
import { dropErrorMessage } from '@/lib/errors';
import { colors, fontFamily, fontSize, spacing } from '@/constants/theme';
import type { MemoryRow } from '@/types/supabase';

export default function Ricordi() {
  const q = useMemories();
  const { mutate: deleteDrop } = useDeleteDrop();
  const [selected, setSelected] = useState<MemoryRow | null>(null);

  const memories = useMemo(() => q.data?.pages.flat() ?? [], [q.data]);

  const elimina = (dropId: string) => {
    deleteDrop(dropId, {
      onSuccess: () => setSelected(null),
      onError: (e) => avvisa('Ops', dropErrorMessage(e)),
    });
  };

  let content: React.ReactNode;
  if (q.isLoading) {
    content = <LoadingSpinner label="Carico i ricordi…" style={styles.flex} />;
  } else if (q.isError) {
    content = <StatoErrore messaggio={dropErrorMessage(q.error)} onRetry={() => void q.refetch()} />;
  } else {
    content = (
      <RicordiGrid
        memories={memories}
        onOpen={setSelected}
        onEndReached={() => {
          if (q.hasNextPage && !q.isFetchingNextPage) void q.fetchNextPage();
        }}
        loadingMore={q.isFetchingNextPage}
        refreshing={q.isRefetching && !q.isFetchingNextPage}
        onRefresh={() => void q.refetch()}
        ListEmptyComponent={<Vuoto />}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>Ricordi</Text>
        <View style={styles.headerBtn} />
      </View>
      {content}

      {/* Vista Ricordo a schermo intero (solo per me). */}
      <Modal
        visible={selected !== null}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setSelected(null)}
      >
        {selected ? (
          <RicordoView memory={selected} onDelete={() => elimina(selected.id)} onClose={() => setSelected(null)} />
        ) : null}
      </Modal>
    </SafeAreaView>
  );
}

function Vuoto() {
  return (
    <View style={styles.vuoto}>
      <Ionicons name="images-outline" size={40} color={colors.faint} />
      <Text style={styles.vuotoTitle}>Ancora nessun ricordo</Text>
      <Text style={styles.vuotoSub}>I tuoi drop scaduti riposano qui, visibili solo a te.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.base },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: colors.ink, fontSize: fontSize.lg, fontFamily: fontFamily.semibold },
  vuoto: { alignItems: 'center', paddingVertical: spacing['4xl'], paddingHorizontal: spacing.xl, gap: spacing.sm },
  vuotoTitle: { color: colors.ink, fontSize: fontSize.lg, fontFamily: fontFamily.semibold, marginTop: spacing.sm },
  vuotoSub: {
    color: colors.muted,
    fontSize: fontSize.sm,
    fontFamily: fontFamily.sans,
    textAlign: 'center',
    lineHeight: 20,
  },
});
