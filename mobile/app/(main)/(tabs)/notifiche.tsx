// =============================================================================
// Notifiche — la tab reale della bottombar (M13/P10, AH-1: assorbe M8).
// =============================================================================
// Lista del ledger `notifications` (tutti i tipi TRANNE 'message': i DM vivono
// nell'hub Messaggi) con stati P1, pull-to-refresh e load-more keyset.
// All'apertura del tab si segnano lette TUTTE le righe (semantica Instagram:
// aprire il tab azzera il badge) — DOPO il refetch, così i dot delle novità
// restano visibili in questa visita e spariscono alla prossima.

import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { VistaStato } from '@/components/ui/VistaStato';
import { NotificaRow } from '@/components/notifiche/NotificaRow';
import {
  useNotificheTab,
  useNotificheUnread,
  useSegnaTutteLette,
  type NotificaRiga,
} from '@/hooks/useNotificheTab';
import { rottaPerNotifica } from '@/lib/notifiche-rotte';
import { statoSchermo } from '@/lib/query-ui';
import { useOnline } from '@/lib/rete';
import { ROUTES } from '@/constants/routes';
import { colors, fontFamily, fontSize, spacing } from '@/constants/theme';

export default function Notifiche() {
  const router = useRouter();
  const query = useNotificheTab();
  const { refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = query;
  const online = useOnline();
  const stato = statoSchermo(query, online);
  const unread = useNotificheUnread();
  const segnaLette = useSegnaTutteLette();
  const [refreshing, setRefreshing] = useState(false);

  // Il mutate legge il contatore più fresco senza rieseguire il focus effect.
  const unreadRef = useRef(unread);
  unreadRef.current = unread;
  const segnaLetteRef = useRef(segnaLette.mutate);
  segnaLetteRef.current = segnaLette.mutate;

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        // Prima la lista fresca (i dot delle non lette si vedono), POI il
        // mark-all: il badge si azzera subito (ottimistico nell'hook), la
        // lista in cache non viene toccata — niente flash.
        await refetch().catch(() => {});
        if ((unreadRef.current ?? 0) > 0) segnaLetteRef.current();
      })();
    }, [refetch]),
  );

  const righe = query.data?.pages.flat() ?? [];

  const apri = (riga: NotificaRiga) => {
    const rotta = rottaPerNotifica({ type: riga.type, ...riga.payload });
    // new_login punta a QUESTA tab (utile dal tap push): qui è già aperta.
    if (!rotta || rotta === ROUTES.notifiche) return;
    router.push(rotta);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Avvisi</Text>
      </View>

      {/* Banner offline (P1): solo con dati in cache, come l'hub Messaggi. */}
      {!online && query.data !== undefined ? (
        <View style={styles.offlineBar}>
          <Ionicons name="cloud-offline-outline" size={14} color={colors.muted} />
          <Text style={styles.offlineText}>Sei offline</Text>
        </View>
      ) : null}

      {stato !== 'dati' ? (
        <VistaStato
          stato={stato}
          messaggio="Non riesco a caricare gli avvisi."
          etichettaCaricamento="Carico gli avvisi…"
          onRetry={() => void refetch()}
          style={styles.flex}
        />
      ) : righe.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="notifications-outline" size={44} color={colors.faint} />
          <Text style={styles.vuotoTitolo}>Ancora nessun avviso</Text>
          <Text style={styles.vuoto}>
            Qui trovi i prop ricevuti, gli amici in live, le richieste di amicizia e gli accessi
            al tuo account.
          </Text>
        </View>
      ) : (
        <FlatList
          data={righe}
          keyExtractor={(r) => r.id}
          renderItem={({ item }) => <NotificaRow riga={item} onPress={apri} />}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
          }}
          ListFooterComponent={
            isFetchingNextPage ? (
              <ActivityIndicator color={colors.accent} style={styles.footerSpinner} />
            ) : null
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void onRefresh()}
              tintColor={colors.accent}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.base },
  flex: { flex: 1 },
  header: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  title: { color: colors.ink, fontSize: 22, fontFamily: fontFamily.displayBold },
  offlineBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surface,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  offlineText: { color: colors.muted, fontSize: fontSize.xs, fontFamily: fontFamily.sans },
  listContent: { paddingHorizontal: spacing.lg, paddingBottom: 100, gap: spacing.xs },
  footerSpinner: { paddingVertical: spacing.lg },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
    paddingBottom: 90,
  },
  vuotoTitolo: { color: colors.ink, fontSize: fontSize.lg, fontFamily: fontFamily.semibold },
  vuoto: {
    color: colors.muted,
    fontSize: fontSize.sm,
    fontFamily: fontFamily.sans,
    textAlign: 'center',
    lineHeight: 20,
  },
});
