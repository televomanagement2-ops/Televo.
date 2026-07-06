// =============================================================================
// S3 — Dettaglio drop + commenti (DM3). Il luogo della conversazione attorno a
// un momento: l'unico posto col realtime (RC-04). Hero del drop a piena
// larghezza + (per l'autore) StatistichePrivate + lista commenti testo/vocali
// con reply a 1 livello (R-07) + composer riusato dalla chat (testo + voce,
// niente foto). Invio ottimistico (outbox commenti): pending/failed/retry,
// offline-safe. Menu commento (Rispondi/Copia/Segnala/Elimina) via mostraMenu.
// Il drop scaduto/non visibile → schermata "non disponibile" identica nei due
// casi (non riveliamo se esiste). Scade con la schermata aperta → composer
// disabilitato con motivo.
// =============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Audio } from 'expo-av';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { StatoErrore } from '@/components/ui/StatoErrore';
import { Composer } from '@/components/chat/Composer';
import { DropHero } from '@/components/drops/DropHero';
import { StatistichePrivate } from '@/components/drops/StatistichePrivate';
import { CommentoRow, type CommentItem } from '@/components/drops/CommentoRow';
import { useAuth } from '@/hooks/useAuth';
import { useComposerDisabledReason } from '@/hooks/useChat';
import {
  useCommentOutbox,
  useDeleteComment,
  useDropComments,
  useDropCommentsRealtime,
  useDropDetail,
  useDropLikers,
} from '@/hooks/useDropComments';
import { useDeleteDrop, useToggleDropReaction, useToggleSave } from '@/hooks/useDrops';
import { useDropShare } from '@/hooks/useDropShare';
import { reportDrop, reportDropComment } from '@/lib/drops';
import { mostraMenuDrop } from '@/components/drops/MenuDrop';
import { avvisa, mostraMenu, type VoceMenu } from '@/lib/dialoghi';
import { useOnline } from '@/lib/rete';
import { avviaRegistrazione, fermaRegistrazione, richiediPermessoMic } from '@/lib/audio';
import { dropErrorMessage } from '@/lib/errors';
import { useDropStore } from '@/store/dropStore';
import { setDropAperto } from '@/lib/expo-push';
import { REPORT_REASONS } from '@/constants/drops';
import { colors, fontFamily, fontSize, spacing } from '@/constants/theme';
import type { DropCommentWithAuthor } from '@/types/supabase';
import type { DropCommentOutboxItem } from '@/store/dropStore';

// Cap durata del commento vocale (trigger: 1–120s). Auto-stop a 120s.
const MAX_COMMENT_SECONDS = 120;

/** Riga server → CommentItem (status null = confermato). */
function fromServer(c: DropCommentWithAuthor): CommentItem {
  return {
    id: c.id,
    authorId: c.author_id,
    authorName: c.author.display_name?.trim() || c.author.username,
    authorAvatar: c.author.avatar_url,
    parentId: c.parent_id,
    type: c.type,
    body: c.body,
    audioUrl: c.audio_url,
    audioSeconds: c.audio_seconds,
    createdAt: c.created_at,
    status: null,
  };
}

/** Item outbox → CommentItem ottimistico ("Tu", pending/failed). */
function fromOutbox(o: DropCommentOutboxItem): CommentItem {
  return {
    id: o.tempId,
    authorId: 'me',
    authorName: 'Tu',
    authorAvatar: null,
    parentId: o.parentId,
    type: o.type,
    body: o.body,
    audioUrl: null, // il vocale non è ancora caricato
    audioSeconds: o.audioSeconds,
    createdAt: o.createdAt,
    status: o.status,
  };
}

export default function DropDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const dropId = id ?? '';
  const { session } = useAuth();
  const uid = session?.user.id;
  const online = useOnline();

  // DM5: finché questo drop è a schermo, le SUE push (drop_comment) non mostrano
  // banner (il realtime aggiorna i commenti live). Azzerato al blur/unmount.
  useFocusEffect(
    useCallback(() => {
      setDropAperto(dropId || null);
      return () => setDropAperto(null);
    }, [dropId]),
  );

  const detailQ = useDropDetail(dropId);
  const drop = detailQ.data ?? null;
  const isAuthor = !!drop && drop.author_id === uid;

  // Scadenza a schermata aperta: il drop sparisce dal feed ma qui resta finché è
  // aperto; disabilitiamo le mutazioni con motivo (il server rifiuta comunque).
  const [scaduto, setScaduto] = useState(false);
  useEffect(() => {
    if (!drop) return;
    const check = () => setScaduto(new Date(drop.expires_at).getTime() <= Date.now());
    check();
    const t = setInterval(check, 30_000);
    return () => clearInterval(t);
  }, [drop]);

  const likersQ = useDropLikers(dropId, isAuthor && !scaduto);
  const commentsQ = useDropComments(dropId);
  useDropCommentsRealtime(dropId);
  const outbox = useCommentOutbox(dropId);
  const del = useDeleteComment(dropId);

  // Gesti del drop dal menu ⋯ (S6, DM4): salva/reaction ottimistici (feed+detail),
  // eliminazione anticipata (autore). Il like non è un'azione del dettaglio (S3).
  const { mutate: saveMutate } = useToggleSave();
  const { mutate: reactionMutate } = useToggleDropReaction();
  const { mutate: deleteDropMutate } = useDeleteDrop();
  // DM5: inoltro in chat + rispondi in privato (condivisi col feed S1).
  const { inoltra, rispondiInPrivato } = useDropShare();

  // Stato del composer commenti (bozza + reply), per-drop nello store.
  const draft = useDropStore((s) => s.commentDrafts[dropId] ?? '');
  const setDraft = useDropStore((s) => s.setCommentDraft);
  const clearDraft = useDropStore((s) => s.clearCommentDraft);
  const reply = useDropStore((s) => s.commentReplyTo[dropId] ?? null);
  const setReply = useDropStore((s) => s.setCommentReplyTo);

  // Composer disabilitato: drop scaduto (priorità) o sanzioni globali (mute/ban).
  const composerBlock = useComposerDisabledReason(null);
  const disabledReason = scaduto
    ? 'Questo drop è scaduto: non puoi più commentare.'
    : composerBlock.data ?? null;

  const listRef = useRef<FlatList<CommentItem>>(null);

  // --- Lista commenti: server + outbox, in albero a 1 livello ----------------
  const items = useMemo<CommentItem[]>(() => {
    const server = (commentsQ.data ?? []).map(fromServer);
    const pending = outbox.items.map(fromOutbox);
    const all = [...server, ...pending];

    const topLevel = all
      .filter((c) => c.parentId == null)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    const repliesByParent = new Map<string, CommentItem[]>();
    for (const c of all) {
      if (c.parentId == null) continue;
      const arr = repliesByParent.get(c.parentId);
      if (arr) arr.push(c);
      else repliesByParent.set(c.parentId, [c]);
    }
    for (const arr of repliesByParent.values()) {
      arr.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    }

    const out: CommentItem[] = [];
    const seenParents = new Set<string>();
    for (const top of topLevel) {
      out.push(top);
      seenParents.add(top.id);
      for (const r of repliesByParent.get(top.id) ?? []) out.push(r);
    }
    // Reply orfane (parent non presente): in coda, per non perderle mai.
    for (const [parentId, arr] of repliesByParent) {
      if (!seenParents.has(parentId)) out.push(...arr);
    }
    return out;
  }, [commentsQ.data, outbox.items]);

  const scrollToEnd = useCallback(() => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);
  }, []);

  // Anteprima del parent per la barra "Rispondi a…".
  const replyPreview = useMemo(() => {
    if (!reply) return null;
    const parent = items.find((c) => c.id === reply.id);
    const text = parent ? (parent.type === 'audio' ? 'Vocale 🎙️' : parent.body ?? 'Commento') : 'Commento';
    return { author: reply.authorName, text };
  }, [reply, items]);

  // --- Invio testo ------------------------------------------------------------
  const handleSend = () => {
    const body = draft.trim();
    if (!body || !uid) return;
    if (scaduto) {
      avvisa('Drop scaduto', 'Non puoi più commentare questo drop.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    outbox.sendText(body, reply?.id ?? null);
    clearDraft(dropId);
    setReply(dropId, null);
    scrollToEnd();
  };

  // --- Vocali (effimero e locale alla schermata, come la chat) ---------------
  const recordingRef = useRef<Audio.Recording | null>(null);
  const previewSoundRef = useRef<Audio.Sound | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [preview, setPreview] = useState<{ uri: string; seconds: number } | null>(null);

  useEffect(() => {
    if (!isRecording) return;
    const t = setInterval(() => setRecordingSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [isRecording]);

  // Cleanup all'uscita.
  useEffect(() => {
    return () => {
      void recordingRef.current?.stopAndUnloadAsync().catch(() => {});
      recordingRef.current = null;
      void previewSoundRef.current?.unloadAsync();
      previewSoundRef.current = null;
    };
  }, []);

  const handleStopRec = useCallback(async () => {
    const rec = recordingRef.current;
    recordingRef.current = null;
    setIsRecording(false);
    if (!rec) return;
    try {
      const { uri, durationMillis } = await fermaRegistrazione(rec);
      setPreview({ uri, seconds: Math.max(1, Math.round(durationMillis / 1000)) });
    } catch {
      avvisa('Ops', 'Registrazione non riuscita, riprova.');
    }
  }, []);

  // Auto-stop al cap dei commenti (120s).
  useEffect(() => {
    if (isRecording && recordingSeconds >= MAX_COMMENT_SECONDS) void handleStopRec();
  }, [isRecording, recordingSeconds, handleStopRec]);

  const handleStartRec = async () => {
    if (scaduto) {
      avvisa('Drop scaduto', 'Non puoi più commentare questo drop.');
      return;
    }
    const ok = await richiediPermessoMic();
    if (!ok) {
      avvisa('Permesso microfono', 'Attiva il microfono per registrare un vocale.');
      return;
    }
    try {
      recordingRef.current = await avviaRegistrazione();
      setRecordingSeconds(0);
      setIsRecording(true);
    } catch {
      avvisa('Ops', 'Impossibile avviare la registrazione.');
    }
  };

  const discardPreview = () => {
    void previewSoundRef.current?.unloadAsync();
    previewSoundRef.current = null;
    setPreview(null);
  };

  const playPreview = async () => {
    if (!preview) return;
    try {
      if (previewSoundRef.current) {
        await previewSoundRef.current.replayAsync();
        return;
      }
      const { sound } = await Audio.Sound.createAsync({ uri: preview.uri }, { shouldPlay: true });
      previewSoundRef.current = sound;
      sound.setOnPlaybackStatusUpdate((s) => {
        if (s.isLoaded && s.didJustFinish) void sound.setPositionAsync(0);
      });
    } catch {
      avvisa('Ops', 'Impossibile riprodurre il vocale.');
    }
  };

  const handleSendAudio = () => {
    if (!preview || !uid) return;
    if (scaduto) {
      avvisa('Drop scaduto', 'Non puoi più commentare questo drop.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    outbox.sendAudio(preview.uri, preview.seconds, reply?.id ?? null);
    discardPreview();
    setReply(dropId, null);
    scrollToEnd();
  };

  // --- Menu del commento (long-press) ----------------------------------------
  // Memoizzato: entra nelle deps di onCommentMenu/renderItem (memo delle righe).
  const startReply = useCallback(
    (item: CommentItem) => setReply(dropId, { id: item.id, authorName: item.authorName }),
    [setReply, dropId],
  );

  const segnalaCommento = (item: CommentItem) => {
    mostraMenu({
      titolo: 'Segnala commento',
      sottotitolo: 'La segnalazione è anonima e va ai moderatori.',
      voci: REPORT_REASONS.map((r) => ({
        label: r,
        icon: 'flag-outline',
        onPress: async () => {
          try {
            await reportDropComment(item.id, r);
            avvisa('Grazie', 'Segnalazione inviata ai moderatori.');
          } catch (e) {
            avvisa('Ops', dropErrorMessage(e));
          }
        },
      })),
    });
  };

  const onCommentMenu = useCallback(
    (item: CommentItem) => {
      // Item ottimistico (pending/failed): menu dedicato Riprova/Elimina.
      if (item.status) {
        const voci: VoceMenu[] = [];
        if (item.status === 'failed') {
          voci.push({ label: 'Riprova', icon: 'refresh-outline', onPress: () => outbox.retry(item.id) });
        }
        voci.push({ label: 'Elimina', icon: 'trash-outline', danger: true, onPress: () => outbox.discard(item.id) });
        mostraMenu({
          titolo: item.status === 'failed' ? 'Commento non inviato' : 'Commento in invio',
          sottotitolo: item.errorMessage ?? undefined,
          voci,
        });
        return;
      }
      const mine = item.authorId === uid;
      const voci: VoceMenu[] = [];
      if (!item.parentId && !scaduto) {
        voci.push({ label: 'Rispondi', icon: 'arrow-undo-outline', onPress: () => startReply(item) });
      }
      if (item.type === 'text' && item.body) {
        voci.push({ label: 'Copia', icon: 'copy-outline', onPress: () => void Clipboard.setStringAsync(item.body ?? '') });
      }
      if (!mine) {
        voci.push({ label: 'Segnala', icon: 'flag-outline', onPress: () => segnalaCommento(item) });
      }
      // Elimina: autore del commento O autore del drop (governa il proprio spazio).
      if (mine || isAuthor) {
        voci.push({
          label: 'Elimina',
          icon: 'trash-outline',
          danger: true,
          onPress: () =>
            del.mutate(item.id, { onError: (e) => avvisa('Ops', dropErrorMessage(e)) }),
        });
      }
      if (voci.length === 0) return;
      mostraMenu({ titolo: 'Commento', voci });
    },
    [uid, isAuthor, scaduto, outbox, del, startReply],
  );

  const chiudi = () => (router.canGoBack() ? router.back() : router.replace('/home'));

  // --- Menu del drop (⋯ nell'hero): MenuDrop condiviso (S6, DM4) --------------
  const segnalaDropReason = async (reason: string) => {
    try {
      await reportDrop(dropId, reason);
      avvisa('Grazie', 'Segnalazione inviata ai moderatori.');
    } catch (e) {
      avvisa('Ops', dropErrorMessage(e));
    }
  };

  const onDropMenu = () => {
    if (!drop) return;
    mostraMenuDrop({
      row: drop,
      isAuthor,
      context: 'detail',
      // Save/reaction ottimistici; l'elimina, alla conferma, chiude la schermata
      // (la riga sparisce per tutti) e invalida le cache correlate (hook).
      onSave: (next) => saveMutate({ dropId, next }),
      onReaction: (trait, next) => reactionMutate({ dropId, trait, next }),
      onReport: (reason) => void segnalaDropReason(reason),
      onDelete: () =>
        deleteDropMutate(dropId, {
          onSuccess: chiudi,
          onError: (e) => avvisa('Ops', dropErrorMessage(e)),
        }),
      onForward: () => inoltra(drop.id),
      onReplyPrivate: isAuthor ? undefined : () => rispondiInPrivato(drop),
    });
  };

  const renderItem = useCallback(
    ({ item }: { item: CommentItem }) => (
      <CommentoRow
        item={item}
        isReply={item.parentId != null}
        canReply={!item.parentId && !scaduto && item.status == null}
        onReply={startReply}
        onLongPress={onCommentMenu}
      />
    ),
    [scaduto, onCommentMenu, startReply],
  );

  // --- Render ----------------------------------------------------------------
  const header = (
    <Header onBack={chiudi} />
  );

  let content: React.ReactNode;
  if (detailQ.isLoading) {
    content = <LoadingSpinner label="Carico il drop…" style={styles.flex} />;
  } else if (detailQ.isError) {
    content = (
      <StatoErrore messaggio={dropErrorMessage(detailQ.error)} onRetry={() => void detailQ.refetch()} />
    );
  } else if (!drop) {
    content = <NonDisponibile />;
  } else {
    content = (
      <KeyboardAvoidingView style={styles.flex} behavior="padding" keyboardVerticalOffset={0}>
        {!online ? (
          <View style={styles.offlineBar}>
            <Ionicons name="cloud-offline-outline" size={14} color={colors.muted} />
            <Text style={styles.offlineText}>Sei offline — i commenti partiranno alla riconnessione</Text>
          </View>
        ) : null}
        <FlatList
          ref={listRef}
          data={items}
          keyExtractor={(it) => it.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          keyboardDismissMode="interactive"
          ListHeaderComponent={
            <View style={styles.heroWrap}>
              <DropHero row={drop} onMenu={onDropMenu} />
              {isAuthor ? <StatistichePrivate row={drop} likers={likersQ.data} /> : null}
              <View style={styles.commentiHead}>
                <Text style={styles.commentiTitle}>Commenti</Text>
              </View>
            </View>
          }
          ListEmptyComponent={
            commentsQ.isLoading ? (
              <LoadingSpinner />
            ) : (
              <Text style={styles.vuoto}>Rompi il ghiaccio — anche con la voce 🎙️</Text>
            )
          }
        />
        <Composer
          value={draft}
          onChangeText={(t) => setDraft(dropId, t)}
          onSend={handleSend}
          disabledReason={disabledReason}
          reply={replyPreview}
          onCancelReply={() => setReply(dropId, null)}
          onStartRecording={handleStartRec}
          onStopRecording={handleStopRec}
          isRecording={isRecording}
          recordingSeconds={recordingSeconds}
          audioPreview={
            preview
              ? {
                  seconds: preview.seconds,
                  onPlay: playPreview,
                  onDiscard: discardPreview,
                  onSend: handleSendAudio,
                }
              : null
          }
        />
      </KeyboardAvoidingView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {header}
      {content}
    </SafeAreaView>
  );
}

function Header({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable onPress={onBack} hitSlop={8} style={styles.headerBtn}>
        <Ionicons name="chevron-back" size={26} color={colors.ink} />
      </Pressable>
      <Text style={styles.headerTitle}>Drop</Text>
      <View style={styles.headerBtn} />
    </View>
  );
}

function NonDisponibile() {
  return (
    <View style={styles.center}>
      <Ionicons name="cloud-offline-outline" size={40} color={colors.faint} />
      <Text style={styles.title}>Questo drop non è più disponibile</Text>
      <Text style={styles.sub}>Potrebbe essere scaduto o non più visibile a te.</Text>
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
  listContent: { padding: spacing.lg, paddingBottom: spacing.xl, gap: spacing.xs },
  heroWrap: { gap: spacing.md, marginBottom: spacing.sm },
  commentiHead: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    marginTop: spacing.xs,
  },
  commentiTitle: { color: colors.ink, fontSize: fontSize.base, fontFamily: fontFamily.semibold },
  vuoto: {
    color: colors.muted,
    fontSize: fontSize.sm,
    fontFamily: fontFamily.sans,
    textAlign: 'center',
    paddingVertical: spacing.xl,
  },
  offlineBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surface,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  offlineText: { color: colors.muted, fontSize: fontSize.xs, fontFamily: fontFamily.sans },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.xl },
  title: {
    color: colors.ink,
    fontSize: fontSize.lg,
    fontFamily: fontFamily.semibold,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  sub: {
    color: colors.muted,
    fontSize: fontSize.sm,
    fontFamily: fontFamily.sans,
    textAlign: 'center',
    lineHeight: 20,
  },
});
