// =============================================================================
// Chat [id] — la conversazione (DM in M1b; gruppi in M3; UX moderna in CM2).
// =============================================================================
// FlatList INVERTITA (i più recenti in basso), separatori data, bolle con orario
// e spunte, composer testo/vocali, realtime + segna-letto. CM2: invio OTTIMISTICO
// via outbox (bolla pending immediata, failed con Riprova/Elimina, offline-safe),
// pill "nuovi messaggi ↓", scroll-to-quoted con highlight, Copia, linkify,
// raggruppamento bolle consecutive, haptic all'invio, banner offline.
// CM3: sottotitolo header (typing > presenza DM > "N membri"), spunte gated dai
// toggle privacy (reciprocità R-03), emissione "sta scrivendo…" dal composer.
// CM4: menu messaggio completo (MenuMessaggio: reazioni, edit, inoltro, prop,
// info, segnala), modalità SELEZIONE con barra azioni, ricerca in-chat (S12b)
// con navigazione tra i match, deep-link ?highlight= dalla ricerca globale.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
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
import { MenuMessaggio, type ReadByEntry } from '@/components/chat/MenuMessaggio';
import type { QuotedRef, SendStatus } from '@/components/chat/BollaParlante';
import { useAuth } from '@/hooks/useAuth';
import {
  useComposerDisabledReason,
  useConversationHeader,
  useConversationOrg,
  useConversationRealtime,
  useConversationSenders,
  useDeleteMessage,
  useEditMessage,
  useLeaveConversation,
  useMarkRead,
  useMessages,
  useOutbox,
  useReactions,
  useSaveMessage,
  useSearchMessages,
  useToggleReaction,
} from '@/hooks/useChat';
import { usePeerPresence, presenceLabel } from '@/hooks/usePresenza';
import { useMyProfile } from '@/hooks/useProfilo';
import { useChatStore } from '@/store/chatStore';
import { giveMessageProp, previewText, reportMessage } from '@/lib/chat';
import { useOnline } from '@/lib/rete';
import {
  avviaRegistrazione,
  fermaRegistrazione,
  richiediPermessoMic,
} from '@/lib/audio';
import { dayLabel, isSameDay } from '@/lib/datetime';
import { chatErrorMessage, propErrorMessage } from '@/lib/errors';
import { dynamicRoutes, ROUTES } from '@/constants/routes';
import { MAX_FORWARD_SELECTION, type ReactionEmoji } from '@/constants/chat';
import type { AuraTrait } from '@/constants/aura';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';
import type { MessageRow, ReactionRow } from '@/types';

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
  const { id, highlight } = useLocalSearchParams<{ id: string; highlight?: string }>();
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
  const editMut = useEditMessage(convId);
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
  // CM4 (RC-05/RC-06): messaggio in modifica + selezione per l'inoltro.
  const editing = useChatStore((s) => s.editing[convId] ?? null);
  const setEditing = useChatStore((s) => s.setEditing);
  const setForwardDraft = useChatStore((s) => s.setForwardDraft);

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
  // CM3: il realtime della conversazione espone anche typing (RC-03).
  const { typingUserIds, sendTyping } = useConversationRealtime(convId, onIncoming);

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

  // CM3 (RC-04): presenza del peer, solo DM — privacy e reciprocità lato server.
  const presence = usePeerPresence(!isGroup ? header.data?.peer?.id ?? null : null);

  // CM3 (§6.4, R-03): spunte visibili solo se ENTRAMBI i toggle sono attivi;
  // altrimenti resta la ✓ singola (mark_conversation_read continua per l'unread).
  const myProfile = useMyProfile();
  const receiptsOn =
    (myProfile.data?.show_read_receipts ?? true) &&
    (header.data?.peerShowsReadReceipts ?? true);

  // Nei gruppi il nome sopra le bolle viene dal mittente reale (non dal peer).
  const sendersQ = useConversationSenders(convId, isGroup);
  const senders = sendersQ.data;
  const senderName = useCallback(
    (senderId: string) => senders?.get(senderId)?.username ?? 'Utente',
    [senders],
  );

  // CM4 (RC-07): reazioni della conversazione, raggruppate per messaggio.
  const reactionsQ = useReactions(convId);
  const reactionsByMsg = useMemo(() => {
    const map = new Map<string, ReactionRow[]>();
    for (const r of reactionsQ.data ?? []) {
      const arr = map.get(r.message_id);
      if (arr) arr.push(r);
      else map.set(r.message_id, [r]);
    }
    return map;
  }, [reactionsQ.data]);
  const toggleReaction = useToggleReaction(convId);
  const myReactionOn = useCallback(
    (messageId: string) =>
      reactionsByMsg.get(messageId)?.find((r) => r.user_id === uid)?.emoji ?? null,
    [reactionsByMsg, uid],
  );
  const onToggleReaction = useCallback(
    (m: MessageRow, emoji: string) => {
      if (m.id.startsWith('temp-')) return;
      toggleReaction.mutate(
        { messageId: m.id, emoji: emoji as ReactionEmoji, mine: myReactionOn(m.id) },
        { onError: (e) => Alert.alert('Ops', chatErrorMessage(e)) },
      );
    },
    [toggleReaction, myReactionOn],
  );

  // CM3: sottotitolo dell'header — priorità: typing > presenza (DM) > membri.
  const typingLabel = useMemo(() => {
    if (typingUserIds.length === 0) return null;
    if (!isGroup) return 'sta scrivendo…';
    if (typingUserIds.length > 1) return `${typingUserIds.length} stanno scrivendo…`;
    return `${senderName(typingUserIds[0] ?? '')} sta scrivendo…`;
  }, [typingUserIds, isGroup, senderName]);
  const presenceText = !isGroup ? presenceLabel(presence.data) : null;
  const memberLabel =
    isGroup && header.data
      ? header.data.memberCount === 1
        ? '1 membro'
        : `${header.data.memberCount} membri`
      : null;
  const subtitle = typingLabel ?? presenceText ?? memberLabel;
  // "Vivo" (accento) quando c'è attività ora: typing o peer online.
  const subtitleLive = !!typingLabel || presence.data?.online === true;

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
          forwarded_from: null,
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
      // Non ancora caricato: pagina all'indietro, poi riprova. Cap alzato in CM4
      // (la ricerca può puntare a messaggi molto vecchi: 20 pagine = 800 msg).
      for (let i = 0; i < 20; i++) {
        const res = await messagesQ.fetchNextPage();
        const trovato = res.data?.pages.some((p) => p.some((m) => m.id === messageId));
        if (trovato || !res.hasNextPage) break;
      }
      setTimeout(() => {
        if (!scrollSePresente()) {
          Alert.alert('Non raggiungibile', 'Il messaggio è troppo indietro nella cronologia.');
        }
      }, 120);
    },
    [messagesQ, evidenzia],
  );

  // Deep-link ?highlight=<messageId> dalla ricerca globale (S12a): salto one-shot.
  const highlightDone = useRef(false);
  useEffect(() => {
    if (!highlight || highlightDone.current || messages.length === 0) return;
    highlightDone.current = true;
    void scrollToMessage(highlight);
  }, [highlight, messages.length, scrollToMessage]);

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

  // --- Selezione multipla (CM4, RC-06) ----------------------------------------
  // null = modalità spenta. Cap a MAX_FORWARD_SELECTION (rate-limit server).
  const [selectedIds, setSelectedIds] = useState<Set<string> | null>(null);

  const toggleSelect = useCallback(
    (m: MessageRow) => {
      if (m.id.startsWith('temp-') || !selectedIds) return;
      const next = new Set(selectedIds);
      if (next.has(m.id)) {
        next.delete(m.id);
        setSelectedIds(next.size === 0 ? null : next);
        return;
      }
      if (next.size >= MAX_FORWARD_SELECTION) {
        Alert.alert('Limite selezione', `Puoi selezionare al massimo ${MAX_FORWARD_SELECTION} messaggi.`);
        return;
      }
      next.add(m.id);
      setSelectedIds(next);
    },
    [selectedIds],
  );

  // Selezionati in ordine cronologico (per copia/inoltro coerenti).
  const selectedMessages = useMemo(() => {
    if (!selectedIds) return [];
    return messages
      .filter((m) => selectedIds.has(m.id))
      .sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  }, [selectedIds, messages]);
  const selHasText = selectedMessages.some((m) => m.type === 'text' && m.body && !m.deleted_at);
  const selCanForward =
    selectedMessages.length > 0 &&
    selectedMessages.every((m) => m.type === 'text' && !!m.body && !m.deleted_at);
  const selCanDelete =
    selectedMessages.length > 0 &&
    selectedMessages.every((m) => m.sender_id === uid && !m.deleted_at);

  const selCopy = () => {
    const testo = selectedMessages
      .filter((m) => m.type === 'text' && m.body && !m.deleted_at)
      .map((m) => m.body)
      .join('\n');
    if (testo) void Clipboard.setStringAsync(testo);
    setSelectedIds(null);
  };
  const selSave = () => {
    for (const m of selectedMessages) {
      if (!m.deleted_at) save.mutate(m.id);
    }
    setSelectedIds(null);
  };
  const selForward = () => {
    setForwardDraft(selectedMessages);
    setSelectedIds(null);
    router.push(ROUTES.chatInoltra);
  };
  const selDelete = () => {
    Alert.alert('Elimina messaggi', `Eliminare ${selectedMessages.length} messaggi?`, [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Elimina',
        style: 'destructive',
        onPress: () => {
          for (const m of selectedMessages) del.mutate(m.id);
          setSelectedIds(null);
        },
      },
    ]);
  };

  // --- Ricerca in-chat (CM4, S12b) --------------------------------------------
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedTerm, setDebouncedTerm] = useState('');
  const [searchIdx, setSearchIdx] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedTerm(searchTerm), 350);
    return () => clearTimeout(t);
  }, [searchTerm]);
  const searchQ = useSearchMessages(searchOpen ? debouncedTerm : '', convId);
  const searchResults = useMemo(() => searchQ.data ?? [], [searchQ.data]);

  // Al primo risultato di un nuovo termine: salto automatico al match più recente.
  const lastJumpTerm = useRef('');
  useEffect(() => {
    if (!searchOpen || searchResults.length === 0) return;
    if (lastJumpTerm.current === debouncedTerm) return;
    lastJumpTerm.current = debouncedTerm;
    setSearchIdx(0);
    const first = searchResults[0];
    if (first) void scrollToMessage(first.messageId);
  }, [searchOpen, searchResults, debouncedTerm, scrollToMessage]);

  const gotoMatch = (idx: number) => {
    const r = searchResults[idx];
    if (!r) return;
    setSearchIdx(idx);
    void scrollToMessage(r.messageId);
  };
  const closeSearch = () => {
    setSearchOpen(false);
    setSearchTerm('');
    setDebouncedTerm('');
    lastJumpTerm.current = '';
    setSearchIdx(0);
  };

  // --- Menu messaggio (CM4, S16) ----------------------------------------------
  const [menuFor, setMenuFor] = useState<MessageRow | null>(null);

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
      setMenuFor(m);
    },
    [outbox, outboxApi],
  );

  // "Letto da N" (RC-09): membri (escluso io) con last_read_at ≥ created_at del
  // messaggio. Solo gruppi (nelle DM bastano le spunte). Confronto tra ISO
  // string dello stesso formato: ordinabile lessicograficamente.
  const menuReadBy = useMemo<ReadByEntry[]>(() => {
    if (!menuFor || !isGroup || !header.data) return [];
    return header.data.members
      .filter((mb) => mb.userId !== uid && mb.lastReadAt >= menuFor.created_at)
      .map((mb) => ({ name: mb.profile?.username ?? 'Utente', readAt: mb.lastReadAt }));
  }, [menuFor, isGroup, header.data, uid]);
  const menuRecipients = header.data ? Math.max(header.data.members.length - 1, 0) : 0;

  const onMenuEdit = (m: MessageRow) => {
    // La bozza corrente viene sovrascritta dal testo in modifica
    // (semplificazione documentata nel piano CM4).
    setEditing(convId, m);
    setDraft(convId, m.body ?? '');
  };
  const onMenuForward = (m: MessageRow) => {
    setForwardDraft([m]);
    router.push(ROUTES.chatInoltra);
  };
  const onMenuProp = async (m: MessageRow, trait: AuraTrait) => {
    try {
      await giveMessageProp(m.sender_id, trait, m.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert('Fatto ✨', 'Prop inviato: alimenta la sua Aura.');
    } catch (e) {
      Alert.alert('Ops', propErrorMessage(e));
    }
  };
  const onMenuReport = async (m: MessageRow, reason: string) => {
    try {
      await reportMessage(m.id, reason);
      Alert.alert('Grazie', 'Segnalazione inviata ai moderatori.');
    } catch (e) {
      Alert.alert('Ops', chatErrorMessage(e));
    }
  };

  const handleSend = () => {
    const body = draft.trim();
    if (!body || !uid) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    // CM4 (RC-05): in modalità modifica l'invio aggiorna il messaggio.
    if (editing) {
      if (body !== (editing.body ?? '').trim()) {
        editMut.mutate(
          { id: editing.id, body },
          { onError: (e) => Alert.alert('Ops', chatErrorMessage(e)) },
        );
      }
      setEditing(convId, null);
      clearDraft(convId);
      return;
    }

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

  // Menu overflow chat (S5): Cerca / Silenzia / Cancella cronologia / Elimina chat.
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
      { text: 'Cerca', onPress: () => setSearchOpen(true) },
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
    // Doppia spunta solo se i toggle privacy lo consentono (CM3, §6.4).
    const readByPeer =
      receiptsOn &&
      !!peerLastRead &&
      new Date(m.created_at).getTime() <= new Date(peerLastRead).getTime();
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
        reactions={reactionsByMsg.get(m.id)}
        myUid={uid ?? null}
        selectionMode={!!selectedIds}
        selected={selectedIds?.has(m.id) ?? false}
        onPressRow={toggleSelect}
        onLongPress={onLongPress}
        onToggleReaction={onToggleReaction}
        onQuotePress={onQuotePress}
      />
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header: normale / barra di ricerca (S12b) / barra selezione (RC-06). */}
      {searchOpen ? (
        <View style={styles.header}>
          <Pressable onPress={closeSearch} hitSlop={10}>
            <Ionicons name="arrow-back" size={24} color={colors.ink} />
          </Pressable>
          <TextInput
            value={searchTerm}
            onChangeText={setSearchTerm}
            placeholder="Cerca nella chat…"
            placeholderTextColor={colors.faint}
            selectionColor={colors.accent}
            style={styles.searchInput}
            autoFocus
            returnKeyType="search"
          />
          <Text style={styles.searchCount}>
            {searchResults.length > 0
              ? `${searchIdx + 1}/${searchResults.length}`
              : debouncedTerm.trim().length >= 2 && !searchQ.isFetching
                ? '0'
                : ''}
          </Text>
          <Pressable
            hitSlop={8}
            disabled={searchIdx >= searchResults.length - 1}
            onPress={() => gotoMatch(searchIdx + 1)}
          >
            <Ionicons
              name="chevron-up"
              size={22}
              color={searchIdx >= searchResults.length - 1 ? colors.faint : colors.ink}
            />
          </Pressable>
          <Pressable hitSlop={8} disabled={searchIdx <= 0} onPress={() => gotoMatch(searchIdx - 1)}>
            <Ionicons
              name="chevron-down"
              size={22}
              color={searchIdx <= 0 ? colors.faint : colors.ink}
            />
          </Pressable>
        </View>
      ) : selectedIds ? (
        <View style={styles.header}>
          <Pressable onPress={() => setSelectedIds(null)} hitSlop={10}>
            <Ionicons name="close" size={24} color={colors.ink} />
          </Pressable>
          <Text style={styles.selCount}>{selectedIds.size} selezionati</Text>
          <View style={styles.headerActions}>
            {selHasText ? (
              <Pressable hitSlop={8} onPress={selCopy}>
                <Ionicons name="copy-outline" size={20} color={colors.ink} />
              </Pressable>
            ) : null}
            <Pressable hitSlop={8} onPress={selSave}>
              <Ionicons name="bookmark-outline" size={20} color={colors.ink} />
            </Pressable>
            {selCanForward ? (
              <Pressable hitSlop={8} onPress={selForward}>
                <Ionicons name="arrow-redo-outline" size={20} color={colors.ink} />
              </Pressable>
            ) : null}
            {selCanDelete ? (
              <Pressable hitSlop={8} onPress={selDelete}>
                <Ionicons name="trash-outline" size={20} color={colors.danger} />
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : (
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="chevron-back" size={26} color={colors.ink} />
          </Pressable>
          <Pressable style={styles.headerCenter} onPress={openPeer}>
            <Avatar uri={header.data?.avatarUrl} name={header.data?.title} size={36} />
            <View style={styles.headerText}>
              <View style={styles.headerTitleRow}>
                <Text style={styles.headerTitle} numberOfLines={1}>
                  {header.data?.title ?? 'Chat'}
                </Text>
                {header.data?.streak ? <StreakBadge count={header.data.streak} compact /> : null}
              </View>
              {/* CM3: typing > presenza (DM) > membri (gruppi); assente = nascosto. */}
              {subtitle ? (
                <Text
                  style={[styles.headerSubtitle, subtitleLive && styles.headerSubtitleLive]}
                  numberOfLines={1}
                >
                  {subtitle}
                </Text>
              ) : null}
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
      )}

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
          onChangeText={(t) => {
            setDraft(convId, t);
            // CM3 (RC-03): segnala "sta scrivendo…" (throttle dentro l'hook).
            if (t.trim().length > 0) sendTyping();
          }}
          onSend={handleSend}
          disabledReason={composerBlock.data ?? null}
          reply={reply ? { author: reply.sender_id === uid ? 'Tu' : peerName, text: previewText(reply) } : null}
          onCancelReply={() => setReplyTo(convId, null)}
          editing={editing ? { text: editing.body ?? '' } : null}
          onCancelEdit={() => {
            setEditing(convId, null);
            clearDraft(convId);
          }}
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

      {/* Menu contestuale del messaggio (S16, CM4). */}
      <MenuMessaggio
        visible={!!menuFor}
        message={menuFor}
        isMine={menuFor?.sender_id === uid}
        isGroup={isGroup}
        myReaction={menuFor ? myReactionOn(menuFor.id) : null}
        readBy={menuReadBy}
        recipientCount={menuRecipients}
        onClose={() => setMenuFor(null)}
        onReact={(emoji) => menuFor && onToggleReaction(menuFor, emoji)}
        onReply={() => menuFor && setReplyTo(convId, menuFor)}
        onCopy={() => menuFor?.body && void Clipboard.setStringAsync(menuFor.body)}
        onEdit={() => menuFor && onMenuEdit(menuFor)}
        onForward={() => menuFor && onMenuForward(menuFor)}
        onSave={() =>
          menuFor &&
          save.mutate(menuFor.id, { onError: (e) => Alert.alert('Ops', chatErrorMessage(e)) })
        }
        onSelect={() => menuFor && setSelectedIds(new Set([menuFor.id]))}
        onDelete={() => menuFor && del.mutate(menuFor.id)}
        onProp={(trait) => menuFor && void onMenuProp(menuFor, trait)}
        onReport={(reason) => menuFor && void onMenuReport(menuFor, reason)}
      />
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
  // CM3: colonna titolo+streak sopra, sottotitolo (typing/presenza/membri) sotto.
  headerText: { flex: 1 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  // flexShrink: il titolo lungo si tronca senza spingere fuori lo streak badge.
  headerTitle: {
    color: colors.ink,
    fontSize: fontSize.base,
    fontFamily: fontFamily.semibold,
    flexShrink: 1,
  },
  headerSubtitle: { color: colors.muted, fontSize: fontSize.xs, fontFamily: fontFamily.sans },
  headerSubtitleLive: { color: colors.accentSoft },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  // Barra di ricerca in-chat (S12b): input + contatore i/N + frecce.
  searchInput: {
    flex: 1,
    minHeight: 38,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    color: colors.ink,
    fontSize: fontSize.sm,
    fontFamily: fontFamily.sans,
  },
  searchCount: {
    color: colors.muted,
    fontSize: fontSize.xs,
    fontFamily: fontFamily.semibold,
    minWidth: 34,
    textAlign: 'center',
  },
  // Barra selezione (RC-06).
  selCount: { flex: 1, color: colors.ink, fontSize: fontSize.base, fontFamily: fontFamily.semibold },
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
