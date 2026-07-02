// =============================================================================
// Chat [id] — la conversazione (DM in M1b; gruppi in M3; UX moderna in CM2).
// =============================================================================
// FlatList INVERTITA (i più recenti in basso), separatori data, bolle con orario
// e spunte, composer testo/vocali, realtime + segna-letto. CM2: invio OTTIMISTICO
// via outbox (bolla pending immediata, failed con Riprova/Elimina, offline-safe),
// pill "nuovi messaggi ↓", scroll-to-quoted con highlight, Copia, linkify,
// raggruppamento bolle consecutive, haptic all'invio, banner offline.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Audio } from 'expo-av';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '@/components/ui/Avatar';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { MessaggioRow } from '@/components/chat/MessaggioRow';
import { DataSeparatore } from '@/components/chat/DataSeparatore';
import { Composer } from '@/components/chat/Composer';
import { StreakBadge } from '@/components/chat/StreakBadge';
import type { QuotedRef, SendStatus } from '@/components/chat/BollaParlante';
import { useAuth } from '@/hooks/useAuth';
import {
  useComposerDisabledReason,
  useConversationHeader,
  useConversationOrg,
  useConversationRealtime,
  useConversationSenders,
  useDeleteMessage,
  useLeaveConversation,
  useMarkRead,
  useMessages,
  useOutbox,
  useSaveMessage,
} from '@/hooks/useChat';
import { useChatStore } from '@/store/chatStore';
import { previewText } from '@/lib/chat';
import { useOnline } from '@/lib/rete';
import {
  avviaRegistrazione,
  fermaRegistrazione,
  richiediPermessoMic,
} from '@/lib/audio';
import { dayLabel, isSameDay } from '@/lib/datetime';
import { chatErrorMessage } from '@/lib/errors';
import { dynamicRoutes } from '@/constants/routes';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';
import type { MessageRow } from '@/types';

type Item =
  | { kind: 'sep'; id: string; label: string }
  | {
      kind: 'msg';
      id: string;
      message: MessageRow;
      /** Bolla consecutiva dello stesso mittente entro 2 min (RC-10). */
      grouped: boolean;
      /** Invio ottimistico: pending/failed (null = confermato dal server). */
      status: SendStatus;
      audioSeconds?: number | null;
      errorMessage?: string | null;
    };

/** Due bolle sono "raggruppate" se stesso mittente entro 2 minuti. */
function isGrouped(prev: MessageRow | null, m: MessageRow): boolean {
  return (
    !!prev &&
    prev.sender_id === m.sender_id &&
    new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 2 * 60_000
  );
}

export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const convId = id ?? '';
  const router = useRouter();
  const { session } = useAuth();
  const uid = session?.user.id;
  const online = useOnline();

  const header = useConversationHeader(convId);
  // clearedAt: undefined finché l'header non è pronto → query messaggi spenta
  // (così "Cancella cronologia" filtra DENTRO la chat, senza flash dei vecchi).
  const messagesQ = useMessages(convId, header.data ? header.data.myClearedAt ?? null : undefined);
  const del = useDeleteMessage(convId);
  const markRead = useMarkRead(convId);
  const org = useConversationOrg(convId);
  const leave = useLeaveConversation(convId);
  const { save } = useSaveMessage();

  // CM2: invio ottimistico — coda della conversazione + azioni.
  const outboxApi = useOutbox(convId);
  const { outbox } = outboxApi;

  const draft = useChatStore((s) => s.drafts[convId] ?? '');
  const setDraft = useChatStore((s) => s.setDraft);
  const clearDraft = useChatStore((s) => s.clearDraft);
  const reply = useChatStore((s) => s.replyTo[convId] ?? null);
  const setReplyTo = useChatStore((s) => s.setReplyTo);

  // Segna letto all'apertura. `mutate` di react-query è stabile.
  const markReadMutate = markRead.mutate;
  useEffect(() => {
    if (convId) markReadMutate();
  }, [convId, markReadMutate]);

  // Pill "nuovi messaggi ↓" (RC-10): se arriva un messaggio mentre si è scrollati
  // in alto, niente scroll forzato — compare la pill. Lista invertita: offset 0 = fondo.
  const listRef = useRef<FlatList<Item>>(null);
  const atBottomRef = useRef(true);
  const [newBelow, setNewBelow] = useState(false);

  // Realtime: sui messaggi in arrivo dal peer, segna letto (senza ri-sottoscrivere)
  // e mostra la pill se non siamo in fondo.
  const markReadRef = useRef(markReadMutate);
  markReadRef.current = markReadMutate;
  const onIncoming = useCallback(() => {
    markReadRef.current();
    if (!atBottomRef.current) setNewBelow(true);
  }, []);
  useConversationRealtime(convId, onIncoming);

  // Messaggi: pagine desc (più recenti prima). asc = per costruire i separatori.
  const messages = useMemo(() => messagesQ.data?.pages.flat() ?? [], [messagesQ.data]);
  const msgById = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);
  const isGroup = (header.data?.type ?? 'dm') !== 'dm';
  const peerName = header.data?.peer?.username ?? null;
  const peerLastRead = header.data?.peerLastReadAt ?? null;

  // CM1 §11.4: composer disabilitato con motivo (ban/mute globali; blocco in DM).
  const composerBlock = useComposerDisabledReason(
    !isGroup ? header.data?.peer?.id ?? null : null,
  );

  // Nei gruppi il nome sopra le bolle viene dal mittente reale (non dal peer).
  const sendersQ = useConversationSenders(convId, isGroup);
  const senders = sendersQ.data;
  const senderName = useCallback(
    (senderId: string) => senders?.get(senderId)?.username ?? 'Utente',
    [senders],
  );

  // Lista invertita: costruiamo asc (server + outbox in coda), poi rovesciamo.
  // Gli item dell'outbox diventano pseudo-messaggi con id temporaneo: il dedup
  // verso il realtime è garantito dal fatto che al successo l'item è rimosso
  // PRIMA dell'upsert della riga reale (vedi lib/outbox.ts).
  const items = useMemo<Item[]>(() => {
    const asc: { m: MessageRow; status: SendStatus; audioSeconds?: number | null; errorMessage?: string | null }[] =
      [...messages].reverse().map((m) => ({ m, status: null }));
    for (const o of outbox) {
      asc.push({
        m: {
          id: o.tempId,
          conversation_id: o.conversationId,
          sender_id: uid ?? '',
          type: o.type,
          body: o.body,
          audio_url: null,
          media_url: null,
          media_type: null,
          reply_to: o.replyTo,
          expires_at: null,
          edited_at: null,
          created_at: o.createdAt,
          deleted_at: null,
        } as MessageRow,
        status: o.status,
        audioSeconds: o.audioSeconds,
        errorMessage: o.errorMessage,
      });
    }
    const out: Item[] = [];
    let prev: MessageRow | null = null;
    for (const { m, status, audioSeconds, errorMessage } of asc) {
      if (!prev || !isSameDay(prev.created_at, m.created_at)) {
        out.push({ kind: 'sep', id: `sep-${m.id}`, label: dayLabel(m.created_at) });
        prev = null; // il separatore spezza anche il raggruppamento
      }
      out.push({
        kind: 'msg',
        id: m.id,
        message: m,
        grouped: isGrouped(prev, m),
        status,
        audioSeconds,
        errorMessage,
      });
      prev = m;
    }
    return out.reverse();
  }, [messages, outbox, uid]);

  // Riferimento fresco per lo scroll-to-quoted (evita closure stantie).
  const itemsRef = useRef<Item[]>(items);
  itemsRef.current = items;

  // --- Scroll-to-quoted con highlight (RC-10) --------------------------------
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
    };
  }, []);

  const evidenzia = useCallback((msgId: string) => {
    setHighlightId(msgId);
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setHighlightId(null), 1600);
  }, []);

  const scrollToMessage = useCallback(
    async (messageId: string) => {
      const scrollSePresente = () => {
        const idx = itemsRef.current.findIndex((it) => it.kind === 'msg' && it.id === messageId);
        if (idx < 0) return false;
        listRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 });
        evidenzia(messageId);
        return true;
      };
      if (scrollSePresente()) return;
      // Non ancora caricato: pagina all'indietro (cap di sicurezza), poi riprova.
      for (let i = 0; i < 5; i++) {
        const res = await messagesQ.fetchNextPage();
        const trovato = res.data?.pages.some((p) => p.some((m) => m.id === messageId));
        if (trovato || !res.hasNextPage) break;
      }
      setTimeout(() => {
        void scrollSePresente();
      }, 120);
    },
    [messagesQ, evidenzia],
  );

  // scrollToIndex su liste paginate può fallire su indici non renderizzati:
  // fallback standard con offset stimato + retry.
  const onScrollToIndexFailed = useCallback(
    (info: { index: number; averageItemLength: number }) => {
      listRef.current?.scrollToOffset({
        offset: info.averageItemLength * info.index,
        animated: true,
      });
      setTimeout(
        () =>
          listRef.current?.scrollToIndex({
            index: info.index,
            animated: true,
            viewPosition: 0.5,
          }),
        150,
      );
    },
    [],
  );

  const resolveQuoted = useCallback(
    (m: MessageRow): QuotedRef | null => {
      if (!m.reply_to) return null;
      const ref = msgById.get(m.reply_to);
      const author = ref
        ? ref.sender_id === uid
          ? 'Tu'
          : isGroup
            ? senderName(ref.sender_id)
            : peerName
        : null;
      return { author, text: ref ? previewText(ref) : 'Messaggio' };
    },
    [msgById, uid, peerName, isGroup, senderName],
  );

  const onLongPress = useCallback(
    (m: MessageRow) => {
      // Pseudo-messaggi dell'outbox: menu dedicato Riprova/Elimina.
      if (m.id.startsWith('temp-')) {
        const o = outbox.find((x) => x.tempId === m.id);
        const buttons: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = [];
        if (o?.status === 'failed') {
          buttons.push({ text: 'Riprova', onPress: () => outboxApi.retry(m.id) });
        }
        buttons.push({ text: 'Elimina', style: 'destructive', onPress: () => outboxApi.discard(m.id) });
        buttons.push({ text: 'Annulla', style: 'cancel' });
        Alert.alert(
          o?.status === 'failed' ? 'Messaggio non inviato' : 'Messaggio in invio',
          o?.errorMessage ?? undefined,
          buttons,
        );
        return;
      }

      const buttons: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = [];
      if (!m.deleted_at) {
        buttons.push({ text: 'Rispondi', onPress: () => setReplyTo(convId, m) });
        if (m.type === 'text' && m.body) {
          buttons.push({
            text: 'Copia',
            onPress: () => void Clipboard.setStringAsync(m.body as string),
          });
        }
        buttons.push({
          text: 'Salva',
          onPress: () =>
            save.mutate(m.id, { onError: (e) => Alert.alert('Ops', chatErrorMessage(e)) }),
        });
      }
      if (m.sender_id === uid && !m.deleted_at) {
        buttons.push({ text: 'Elimina', style: 'destructive', onPress: () => del.mutate(m.id) });
      }
      buttons.push({ text: 'Annulla', style: 'cancel' });
      Alert.alert('Messaggio', undefined, buttons);
    },
    [convId, uid, del, save, setReplyTo, outbox, outboxApi],
  );

  const handleSend = () => {
    const body = draft.trim();
    if (!body || !uid) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    // Ottimistico: bolla immediata, input libero subito (anche offline → pending).
    outboxApi.sendText(body, reply?.id ?? null);
    clearDraft(convId);
    setReplyTo(convId, null);
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  };

  // --- Vocali (M2) -----------------------------------------------------------
  // Stato effimero e locale alla schermata (non nello store): registrazione in
  // corso, timer, anteprima del file appena registrato.
  const recordingRef = useRef<Audio.Recording | null>(null);
  const previewSoundRef = useRef<Audio.Sound | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [preview, setPreview] = useState<{ uri: string; seconds: number } | null>(null);

  // Timer 1s mentre si registra.
  useEffect(() => {
    if (!isRecording) return;
    const t = setInterval(() => setRecordingSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [isRecording]);

  // Cleanup all'uscita: ferma registrazione e scarica l'anteprima.
  useEffect(() => {
    return () => {
      void recordingRef.current?.stopAndUnloadAsync().catch(() => {});
      recordingRef.current = null;
      void previewSoundRef.current?.unloadAsync();
      previewSoundRef.current = null;
    };
  }, []);

  const handleStartRec = async () => {
    const ok = await richiediPermessoMic();
    if (!ok) {
      Alert.alert('Permesso microfono', 'Attiva il microfono per registrare un vocale.');
      return;
    }
    try {
      recordingRef.current = await avviaRegistrazione();
      setRecordingSeconds(0);
      setIsRecording(true);
    } catch {
      Alert.alert('Ops', 'Impossibile avviare la registrazione.');
    }
  };

  const handleStopRec = async () => {
    const rec = recordingRef.current;
    recordingRef.current = null;
    setIsRecording(false);
    if (!rec) return;
    try {
      const { uri, durationMillis } = await fermaRegistrazione(rec);
      setPreview({ uri, seconds: Math.max(1, Math.round(durationMillis / 1000)) });
    } catch {
      Alert.alert('Ops', 'Registrazione non riuscita, riprova.');
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
      Alert.alert('Ops', 'Impossibile riprodurre il vocale.');
    }
  };

  const handleSendAudio = () => {
    if (!preview || !uid) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    // Ottimistico: l'upload avviene nell'outbox (bolla pending immediata).
    outboxApi.sendAudio(preview.uri, preview.seconds, reply?.id ?? null);
    discardPreview();
    setReplyTo(convId, null);
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  };

  const openPeer = () => {
    if (header.data?.peer) router.push(dynamicRoutes.profiloUtente(header.data.peer.id));
  };

  // Menu overflow chat (S5): Silenzia / Cancella cronologia / Elimina chat.
  const onOrgErr = (e: unknown) => Alert.alert('Ops', chatErrorMessage(e));
  const isDm = (header.data?.type ?? 'dm') === 'dm';

  const openMuteMenu = () => {
    const until = (h: number) => new Date(Date.now() + h * 3600e3).toISOString();
    Alert.alert('Silenzia', 'Per quanto tempo?', [
      { text: '8 ore', onPress: () => org.mute.mutate(until(8), { onError: onOrgErr }) },
      { text: '1 settimana', onPress: () => org.mute.mutate(until(24 * 7), { onError: onOrgErr }) },
      { text: 'Sempre', onPress: () => org.mute.mutate(until(24 * 365 * 100), { onError: onOrgErr }) },
      { text: 'Annulla', style: 'cancel' },
    ]);
  };

  const confirmClear = () => {
    Alert.alert('Cancella cronologia', 'Nasconde i messaggi precedenti solo per te. Procedere?', [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Cancella',
        style: 'destructive',
        onPress: () => org.clearHistory.mutate(undefined, { onError: onOrgErr }),
      },
    ]);
  };

  const confirmDelete = () => {
    Alert.alert(
      isDm ? 'Elimina chat' : 'Esci dal gruppo',
      isDm
        ? 'La chat sparisce dalla tua lista; riappare se arriva un nuovo messaggio.'
        : 'Uscirai dal gruppo.',
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: isDm ? 'Elimina' : 'Esci',
          style: 'destructive',
          onPress: () =>
            isDm
              ? org.flag.mutate({ flag: 'hidden', on: true }, {
                  onSuccess: () => router.back(),
                  onError: onOrgErr,
                })
              : leave.mutate(undefined, { onSuccess: () => router.back(), onError: onOrgErr }),
        },
      ],
    );
  };

  const openChatMenu = () => {
    Alert.alert(header.data?.title ?? 'Chat', undefined, [
      { text: 'Silenzia', onPress: openMuteMenu },
      { text: 'Cancella cronologia', style: 'destructive', onPress: confirmClear },
      {
        text: isDm ? 'Elimina chat' : 'Esci dal gruppo',
        style: 'destructive',
        onPress: confirmDelete,
      },
      { text: 'Annulla', style: 'cancel' },
    ]);
  };

  const onQuotePress = useCallback(
    (m: MessageRow) => {
      if (m.reply_to) void scrollToMessage(m.reply_to);
    },
    [scrollToMessage],
  );

  const renderItem = ({ item }: { item: Item }) => {
    if (item.kind === 'sep') return <DataSeparatore label={item.label} />;
    const m = item.message;
    const isMine = m.sender_id === uid;
    const readByPeer =
      !!peerLastRead && new Date(m.created_at).getTime() <= new Date(peerLastRead).getTime();
    return (
      <MessaggioRow
        message={m}
        isMine={isMine}
        isGroup={isGroup}
        senderName={isGroup && !isMine ? senderName(m.sender_id) : null}
        quoted={resolveQuoted(m)}
        showTicks={!isGroup}
        readByPeer={readByPeer}
        grouped={item.grouped}
        highlighted={highlightId === m.id}
        status={item.status}
        audioSeconds={item.audioSeconds}
        errorMessage={item.errorMessage}
        onLongPress={onLongPress}
        onQuotePress={onQuotePress}
      />
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>
        <Pressable style={styles.headerCenter} onPress={openPeer}>
          <Avatar uri={header.data?.avatarUrl} name={header.data?.title} size={36} />
          <View style={styles.headerText}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {header.data?.title ?? 'Chat'}
            </Text>
            {header.data?.streak ? <StreakBadge count={header.data.streak} compact /> : null}
          </View>
        </Pressable>
        <View style={styles.headerActions}>
          {/* Chiamata: differita (LiveKit + Dev Build) → visibile ma "presto". */}
          <Pressable hitSlop={8} onPress={() => Alert.alert('Presto', 'Le chiamate arrivano presto.')}>
            <Ionicons name="call-outline" size={20} color={colors.faint} />
          </Pressable>
          <Pressable hitSlop={8} onPress={() => router.push(dynamicRoutes.chatInfo(convId))}>
            <Ionicons name="information-circle-outline" size={22} color={colors.ink} />
          </Pressable>
          <Pressable hitSlop={8} onPress={openChatMenu}>
            <Ionicons name="ellipsis-vertical" size={20} color={colors.ink} />
          </Pressable>
        </View>
      </View>

      {/* Banner offline (RC-02): i messaggi composti restano pending e partono
          alla riconnessione (flush in ChatRuntime). */}
      {!online ? (
        <View style={styles.offlineBar}>
          <Ionicons name="cloud-offline-outline" size={14} color={colors.muted} />
          <Text style={styles.offlineText}>Sei offline — i messaggi partiranno alla riconnessione</Text>
        </View>
      ) : null}

      {/* Tastiera: in Expo Go su Android la finestra NON si ridimensiona da sola,
          quindi serve il KeyboardAvoidingView. behavior="padding" aggiunge in fondo
          un padding pari all'altezza della tastiera → lista + composer salgono sopra
          di essa, e alla chiusura il padding torna a 0 (ripristino pulito, niente
          "resta su"). keyboardVerticalOffset DEVE essere 0: un valore positivo lascia
          un vuoto tra input e tastiera (era il bug di prima, offset ~header). */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior="padding"
        keyboardVerticalOffset={0}
      >
        {header.isLoading || messagesQ.isPending ? (
          <LoadingSpinner label="Carico la conversazione…" style={styles.flex} />
        ) : !header.data ? (
          <View style={styles.center}>
            <Text style={styles.vuoto}>Conversazione non disponibile.</Text>
          </View>
        ) : items.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.vuoto}>Nessun messaggio ancora — scrivi per primo.</Text>
          </View>
        ) : (
          <View style={styles.flex}>
            <FlatList
              ref={listRef}
              data={items}
              renderItem={renderItem}
              keyExtractor={(it) => it.id}
              inverted
              contentContainerStyle={styles.listContent}
              onEndReached={() => {
                if (messagesQ.hasNextPage && !messagesQ.isFetchingNextPage) messagesQ.fetchNextPage();
              }}
              onEndReachedThreshold={0.4}
              keyboardDismissMode="interactive"
              onScroll={(e) => {
                // Lista invertita: offset 0 = fondo (messaggi più recenti).
                const nearBottom = e.nativeEvent.contentOffset.y < 40;
                atBottomRef.current = nearBottom;
                if (nearBottom) setNewBelow(false);
              }}
              scrollEventThrottle={32}
              onScrollToIndexFailed={onScrollToIndexFailed}
              ListFooterComponent={
                messagesQ.isFetchingNextPage ? <LoadingSpinner /> : null
              }
            />
            {newBelow ? (
              <Pressable
                style={styles.pillNuovi}
                onPress={() => {
                  listRef.current?.scrollToOffset({ offset: 0, animated: true });
                  setNewBelow(false);
                }}
              >
                <Ionicons name="arrow-down" size={14} color="#ffffff" />
                <Text style={styles.pillNuoviText}>Nuovi messaggi</Text>
              </Pressable>
            ) : null}
          </View>
        )}

        <Composer
          value={draft}
          onChangeText={(t) => setDraft(convId, t)}
          onSend={handleSend}
          disabledReason={composerBlock.data ?? null}
          reply={reply ? { author: reply.sender_id === uid ? 'Tu' : peerName, text: previewText(reply) } : null}
          onCancelReply={() => setReplyTo(convId, null)}
          onAttach={() => Alert.alert('Presto', 'Gli allegati arrivano presto.')}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.base },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerText: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerTitle: { color: colors.ink, fontSize: fontSize.base, fontFamily: fontFamily.semibold },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  listContent: { paddingVertical: spacing.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  vuoto: { color: colors.muted, fontSize: fontSize.sm, fontFamily: fontFamily.sans, textAlign: 'center' },
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
  pillNuovi: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.accent,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    // Ben visibile sopra la lista.
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  pillNuoviText: { color: '#ffffff', fontSize: fontSize.xs, fontFamily: fontFamily.semibold },
});
