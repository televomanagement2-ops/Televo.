// =============================================================================
// Chat [id] — la conversazione (DM in M1b; gruppi completati in M3).
// =============================================================================
// FlatList INVERTITA (i più recenti in basso), separatori data, bolle con orario
// e spunte, composer testo, realtime + segna-letto. Reply e soft-delete via
// long-press. Il layout tiene il composer sopra la tastiera (KeyboardAvoidingView).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '@/components/ui/Avatar';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { MessaggioRow } from '@/components/chat/MessaggioRow';
import { DataSeparatore } from '@/components/chat/DataSeparatore';
import { Composer } from '@/components/chat/Composer';
import { StreakBadge } from '@/components/chat/StreakBadge';
import type { QuotedRef } from '@/components/chat/BollaParlante';
import { useAuth } from '@/hooks/useAuth';
import {
  useConversationHeader,
  useConversationOrg,
  useConversationRealtime,
  useConversationSenders,
  useDeleteMessage,
  useLeaveConversation,
  useMarkRead,
  useMessages,
  useSaveMessage,
  useSendAudioMessage,
  useSendMessage,
} from '@/hooks/useChat';
import { useChatStore } from '@/store/chatStore';
import { previewText } from '@/lib/chat';
import {
  avviaRegistrazione,
  fermaRegistrazione,
  richiediPermessoMic,
  uploadVocale,
} from '@/lib/audio';
import { dayLabel, isSameDay } from '@/lib/datetime';
import { chatErrorMessage } from '@/lib/errors';
import { dynamicRoutes } from '@/constants/routes';
import { colors, fontFamily, fontSize, spacing } from '@/constants/theme';
import type { MessageRow } from '@/types';

type Item =
  | { kind: 'sep'; id: string; label: string }
  | { kind: 'msg'; id: string; message: MessageRow };

export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const convId = id ?? '';
  const router = useRouter();
  const { session } = useAuth();
  const uid = session?.user.id;

  const header = useConversationHeader(convId);
  const messagesQ = useMessages(convId);
  const send = useSendMessage(convId);
  const sendAudio = useSendAudioMessage(convId);
  const del = useDeleteMessage(convId);
  const markRead = useMarkRead(convId);
  const org = useConversationOrg(convId);
  const leave = useLeaveConversation(convId);
  const { save } = useSaveMessage();

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

  // Realtime: sui messaggi in arrivo dal peer, segna letto (senza ri-sottoscrivere).
  const markReadRef = useRef(markReadMutate);
  markReadRef.current = markReadMutate;
  const onIncoming = useCallback(() => markReadRef.current(), []);
  useConversationRealtime(convId, onIncoming);

  // Messaggi: pagine desc (più recenti prima). asc = per costruire i separatori.
  const messages = useMemo(() => messagesQ.data?.pages.flat() ?? [], [messagesQ.data]);
  const msgById = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);
  const isGroup = (header.data?.type ?? 'dm') !== 'dm';
  const peerName = header.data?.peer?.username ?? null;
  const peerLastRead = header.data?.peerLastReadAt ?? null;

  // Nei gruppi il nome sopra le bolle viene dal mittente reale (non dal peer).
  const sendersQ = useConversationSenders(convId, isGroup);
  const senders = sendersQ.data;
  const senderName = useCallback(
    (senderId: string) => senders?.get(senderId)?.username ?? 'Utente',
    [senders],
  );

  // Lista invertita: costruiamo asc con i separatori, poi rovesciamo.
  const items = useMemo<Item[]>(() => {
    const asc = [...messages].reverse();
    const out: Item[] = [];
    let prevIso: string | null = null;
    for (const m of asc) {
      if (!prevIso || !isSameDay(prevIso, m.created_at)) {
        out.push({ kind: 'sep', id: `sep-${m.id}`, label: dayLabel(m.created_at) });
      }
      out.push({ kind: 'msg', id: m.id, message: m });
      prevIso = m.created_at;
    }
    return out.reverse();
  }, [messages]);

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
      const buttons: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = [];
      if (!m.deleted_at) {
        buttons.push({ text: 'Rispondi', onPress: () => setReplyTo(convId, m) });
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
    [convId, uid, del, save, setReplyTo],
  );

  const handleSend = () => {
    const body = draft.trim();
    if (!body) return;
    send.mutate(
      { body, replyTo: reply?.id ?? null },
      {
        onSuccess: () => {
          clearDraft(convId);
          setReplyTo(convId, null);
        },
        onError: (e) => Alert.alert('Ops', chatErrorMessage(e)),
      },
    );
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
    const replyTo = reply?.id ?? null;
    void (async () => {
      try {
        const path = await uploadVocale(convId, uid, preview.uri);
        sendAudio.mutate(
          { audioPath: path, replyTo },
          {
            onSuccess: () => {
              discardPreview();
              setReplyTo(convId, null);
            },
            onError: (e) => Alert.alert('Ops', chatErrorMessage(e)),
          },
        );
      } catch (e) {
        Alert.alert('Ops', chatErrorMessage(e));
      }
    })();
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
        onLongPress={onLongPress}
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

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {header.isLoading || messagesQ.isLoading ? (
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
          <FlatList
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
            ListFooterComponent={
              messagesQ.isFetchingNextPage ? <LoadingSpinner /> : null
            }
          />
        )}

        <Composer
          value={draft}
          onChangeText={(t) => setDraft(convId, t)}
          onSend={handleSend}
          sending={send.isPending}
          reply={reply ? { author: reply.sender_id === uid ? 'Tu' : peerName, text: previewText(reply) } : null}
          onCancelReply={() => setReplyTo(convId, null)}
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
                  sending: sendAudio.isPending,
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
});
