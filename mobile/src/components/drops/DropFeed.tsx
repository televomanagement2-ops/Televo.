// =============================================================================
// DropFeed — il feed dei drop (S1), montato nella categoria "Drops" della Home.
// FlatList paginata (keyset via useDropsFeed) con: pull-to-refresh, prefetch
// della pagina successiva (onEndReached), skeleton in loading, vuoto e
// StatoErrore. In testa vivono le card OTTIMISTICHE dell'outbox (pending/failed).
// In fondo, quando non c'è altro da caricare, la celebrazione "Sei in pari ✓"
// (anti-doomscroll §6). NIENTE realtime: la freschezza è pull/refetch on focus.
// =============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import {
  useDeleteDrop,
  useDropsFeed,
  useDropOutboxCards,
  useToggleDropReaction,
  useToggleLike,
  useToggleSave,
} from '@/hooks/useDrops';
import { useAuth } from '@/hooks/useAuth';
import { useDropShare } from '@/hooks/useDropShare';
import { DropCard } from './DropCard';
import { DropCardOutbox } from './DropCardOutbox';
import { DropSkeleton } from './DropSkeleton';
import { SeiInPari } from './SeiInPari';
import { mostraMenuDrop } from './MenuDrop';
import { VistaStato } from '@/components/ui/VistaStato';
import { avvisa } from '@/lib/dialoghi';
import { avviaRegistrazione, fermaRegistrazione, richiediPermessoMic } from '@/lib/audio';
import { enqueueAudioComment } from '@/lib/drops-comments-outbox';
import { reportDrop } from '@/lib/drops';
import { useCreaMenuStore } from '@/store/creaMenuStore';
import { dropErrorMessage } from '@/lib/errors';
import { statoSchermo } from '@/lib/query-ui';
import { useOnline } from '@/lib/rete';
import { dynamicRoutes } from '@/constants/routes';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';
import type { DropFeedRow, DropReactionTrait } from '@/types/supabase';
import type { DropOutboxItem } from '@/store/dropStore';

// Durata massima della reazione vocale rapida dalla card (§16.1): 10s, auto-stop.
const MAX_VOICE_REACTION_SECONDS = 10;

// Item della lista: card reale (dal server) o card ottimistica (dall'outbox).
type ListItem =
  | { kind: 'drop'; row: DropFeedRow }
  | { kind: 'outbox'; item: DropOutboxItem };

export function DropFeed() {
  const { uid } = useAuth();
  const queryClient = useQueryClient();

  const feed = useDropsFeed();
  const online = useOnline();
  const { items: outbox, retry, remove } = useDropOutboxCards();

  const { mutate: likeMutate } = useToggleLike();
  const { mutate: saveMutate } = useToggleSave();
  const { mutate: reactionMutate } = useToggleDropReaction();
  const { mutate: deleteMutate } = useDeleteDrop();
  // DM5: inoltro in chat + rispondi in privato (condivisi col dettaglio S3).
  const { inoltra, rispondiInPrivato } = useDropShare();

  // --- Reazione vocale rapida (§16.1): un solo recorder per il feed ----------
  // Il press-and-hold sul mic di una card avvia; il rilascio ferma e invia un
  // commento audio (parentId null) via l'outbox commenti. `holdRef` protegge
  // dalla corsa col permesso microfono (rilascio prima che parta la registrazione).
  const recordingRef = useRef<Audio.Recording | null>(null);
  const recDropIdRef = useRef<string | null>(null);
  const holdRef = useRef(false);
  const [recording, setRecording] = useState<{ dropId: string; seconds: number } | null>(null);
  const isRecording = recording !== null;

  useEffect(() => {
    if (!isRecording) return;
    const t = setInterval(
      () => setRecording((r) => (r ? { ...r, seconds: r.seconds + 1 } : r)),
      1000,
    );
    return () => clearInterval(t);
  }, [isRecording]);

  const stopVoiceReaction = useCallback(async () => {
    holdRef.current = false;
    const rec = recordingRef.current;
    const dropId = recDropIdRef.current;
    recordingRef.current = null;
    recDropIdRef.current = null;
    setRecording(null);
    if (!rec || !dropId || !uid) return;
    try {
      const { uri, durationMillis } = await fermaRegistrazione(rec);
      const secs = Math.round(durationMillis / 1000);
      if (secs < 1) return; // troppo breve (tap accidentale): scarta in silenzio
      enqueueAudioComment(queryClient, uid, {
        dropId,
        parentId: null,
        audioLocalUri: uri,
        audioSeconds: Math.min(secs, MAX_VOICE_REACTION_SECONDS),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch {
      avvisa('Ops', 'Registrazione non riuscita, riprova.');
    }
  }, [uid, queryClient]);

  const startVoiceReaction = useCallback(async (dropId: string) => {
    if (recordingRef.current) return;
    holdRef.current = true;
    const ok = await richiediPermessoMic();
    // Permesso negato o dito già sollevato durante la richiesta: niente registrazione.
    if (!ok || !holdRef.current) {
      if (!ok && holdRef.current) {
        avvisa('Permesso microfono', 'Attiva il microfono per una reazione vocale.');
      }
      holdRef.current = false;
      return;
    }
    try {
      recordingRef.current = await avviaRegistrazione();
      recDropIdRef.current = dropId;
      // Se nel frattempo il dito si è sollevato, ferma subito (scarta).
      if (!holdRef.current) {
        void stopVoiceReaction();
        return;
      }
      setRecording({ dropId, seconds: 0 });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    } catch {
      recordingRef.current = null;
      avvisa('Ops', 'Impossibile registrare ora.');
    }
  }, [stopVoiceReaction]);

  // Auto-stop al cap (10s).
  useEffect(() => {
    if (recording && recording.seconds >= MAX_VOICE_REACTION_SECONDS) void stopVoiceReaction();
  }, [recording, stopVoiceReaction]);

  // Cleanup all'uscita dal feed.
  useEffect(() => {
    return () => {
      holdRef.current = false;
      void recordingRef.current?.stopAndUnloadAsync().catch(() => {});
      recordingRef.current = null;
    };
  }, []);

  // Refetch al focus (refetchOnWindowFocus è off globalmente): tornando dal
  // dettaglio (S3) o rientrando nella categoria, i drop scaduti spariscono.
  const { refetch } = feed;
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  // Handler stabili (mutate è referenzialmente stabile in TanStack v5): mantengono
  // il memo di DropCard efficace su liste lunghe.
  const onOpen = useCallback((dropId: string) => router.push(dynamicRoutes.drop(dropId)), []);
  const onLike = useCallback(
    (dropId: string, next: boolean) => likeMutate({ dropId, next }),
    [likeMutate],
  );
  const onSave = useCallback(
    (dropId: string, next: boolean) => saveMutate({ dropId, next }),
    [saveMutate],
  );
  const onReaction = useCallback(
    (dropId: string, trait: DropReactionTrait, next: boolean) =>
      reactionMutate({ dropId, trait, next }),
    [reactionMutate],
  );
  const onReport = useCallback(async (dropId: string, reason: string) => {
    try {
      await reportDrop(dropId, reason);
      avvisa('Grazie', 'Segnalazione inviata ai moderatori.');
    } catch (e) {
      avvisa('Ops', dropErrorMessage(e));
    }
  }, []);
  const onDelete = useCallback(
    (dropId: string) => deleteMutate(dropId, { onError: (e) => avvisa('Ops', dropErrorMessage(e)) }),
    [deleteMutate],
  );
  // Menu ⋯ della card (S6): autore/amico e submenu Dai Aura/Segnala in MenuDrop.
  const onMenu = useCallback(
    (row: DropFeedRow) =>
      mostraMenuDrop({
        row,
        isAuthor: row.author_id === uid,
        context: 'feed',
        onOpen: () => onOpen(row.id),
        onSave: (next) => onSave(row.id, next),
        onReaction: (trait, next) => onReaction(row.id, trait, next),
        onReport: (reason) => void onReport(row.id, reason),
        onDelete: () => onDelete(row.id),
        onForward: () => inoltra(row.id),
        onReplyPrivate: row.author_id === uid ? undefined : () => rispondiInPrivato(row),
      }),
    [uid, onOpen, onSave, onReaction, onReport, onDelete, inoltra, rispondiInPrivato],
  );

  // Appiattisci le pagine e anteponi l'outbox (dedup per id: se la card reale è
  // già arrivata dopo la pubblicazione, vince lei — niente doppioni).
  const data = useMemo<ListItem[]>(() => {
    const rows = feed.data?.pages.flat() ?? [];
    const feedIds = new Set(rows.map((r) => r.id));
    const pending: ListItem[] = [...outbox]
      .filter((o) => !feedIds.has(o.dropId))
      .reverse() // il più recente in cima
      .map((item) => ({ kind: 'outbox', item }));
    return [...pending, ...rows.map((row) => ({ kind: 'drop', row }) as ListItem)];
  }, [feed.data, outbox]);

  const renderItem = useCallback(
    ({ item }: { item: ListItem }) => {
      if (item.kind === 'outbox') {
        return <DropCardOutbox item={item.item} onRetry={retry} onRemove={remove} />;
      }
      return (
        <DropCard
          row={item.row}
          mine={item.row.author_id === uid}
          onOpen={onOpen}
          onLike={onLike}
          onSave={onSave}
          onReaction={onReaction}
          onMenu={onMenu}
          onVoiceStart={startVoiceReaction}
          onVoiceStop={stopVoiceReaction}
        />
      );
    },
    [uid, onOpen, onLike, onSave, onReaction, onMenu, retry, remove, startVoiceReaction, stopVoiceReaction],
  );

  // --- Stati di ingresso (SWR, P1): skeleton in caricamento, offline dedicato --
  const stato = statoSchermo(feed, online);
  if (stato !== 'dati') {
    return (
      <VistaStato
        stato={stato}
        messaggio={dropErrorMessage(feed.error)}
        caricamento={<DropSkeleton />}
        onRetry={() => void feed.refetch()}
      />
    );
  }

  return (
    <View style={styles.flex}>
      <FlatList
        data={data}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        style={styles.flex}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshing={feed.isRefetching && !feed.isFetchingNextPage}
        onRefresh={() => void feed.refetch()}
        onEndReachedThreshold={0.6}
        onEndReached={() => {
          if (feed.hasNextPage && !feed.isFetchingNextPage) void feed.fetchNextPage();
        }}
        ListHeaderComponent={<FeedHeader />}
        ListEmptyComponent={<Vuoto />}
        ListFooterComponent={
          <Footer
            loadingMore={feed.isFetchingNextPage}
            fine={!feed.hasNextPage && data.length > 0}
          />
        }
        // Perf su liste miste (foto/audio/testo): finestre contenute; ogni card è
        // memoizzata e si ri-disegna solo se cambia la sua riga. Niente
        // removeClippedSubviews: con altezze variabili dà celle vuote su Android.
        initialNumToRender={6}
        windowSize={9}
      />
      {/* Overlay della reazione vocale rapida mentre si tiene premuto il mic. */}
      {recording ? (
        <View style={styles.recOverlay} pointerEvents="none">
          <View style={styles.recDot} />
          <Text style={styles.recText}>
            Reazione vocale… {recording.seconds}s
          </Text>
          <Text style={styles.recHint}>rilascia per inviare</Text>
        </View>
      ) : null}
    </View>
  );
}

const keyExtractor = (it: ListItem) =>
  it.kind === 'outbox' ? `outbox-${it.item.dropId}` : `drop-${it.row.id}`;

/** Header di categoria: titolo + "＋ Drop" (apre il menu di creazione S0). */
function FeedHeader() {
  return (
    <View style={styles.header}>
      <Text style={styles.headerTitle}>Drops di oggi</Text>
      <Pressable style={styles.crea} onPress={() => useCreaMenuStore.getState().open()}>
        <Ionicons name="add" size={18} color="#ffffff" />
        <Text style={styles.creaText}>Drop</Text>
      </Pressable>
    </View>
  );
}

function Vuoto() {
  return (
    <View style={styles.vuoto}>
      <Ionicons name="sparkles-outline" size={40} color={colors.faint} />
      <Text style={styles.vuotoTitle}>Ancora nessun drop</Text>
      <Text style={styles.vuotoSub}>
        Nessun momento dai tuoi amici nelle ultime 24h. Sii il primo a condividerne uno ✨
      </Text>
    </View>
  );
}

function Footer({ loadingMore, fine }: { loadingMore: boolean; fine: boolean }) {
  if (loadingMore) {
    return (
      <View style={styles.footerSpinner}>
        <ActivityIndicator color={colors.muted} />
      </View>
    );
  }
  return fine ? <SeiInPari /> : null;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  // paddingBottom ampio: l'ultima card resta sopra la bottom bar floating.
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: 110, gap: spacing.lg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  headerTitle: { color: colors.ink, fontSize: fontSize.lg, fontFamily: fontFamily.semibold },
  crea: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.accent,
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
  },
  creaText: { color: '#ffffff', fontSize: fontSize.sm, fontFamily: fontFamily.semibold },
  vuoto: { alignItems: 'center', paddingVertical: spacing['4xl'], paddingHorizontal: spacing.xl, gap: spacing.sm },
  vuotoTitle: {
    color: colors.ink,
    fontSize: fontSize.lg,
    fontFamily: fontFamily.semibold,
    marginTop: spacing.sm,
  },
  vuotoSub: {
    color: colors.muted,
    fontSize: fontSize.sm,
    fontFamily: fontFamily.sans,
    textAlign: 'center',
    lineHeight: 20,
  },
  footerSpinner: { paddingVertical: spacing.xl, alignItems: 'center' },
  // Overlay della reazione vocale rapida (§16.1): pill centrata in basso.
  recOverlay: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: 130,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radius.full,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  recDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.danger },
  recText: { color: colors.ink, fontSize: fontSize.sm, fontFamily: fontFamily.semibold },
  recHint: { color: colors.muted, fontSize: fontSize.xs, fontFamily: fontFamily.medium },
});
