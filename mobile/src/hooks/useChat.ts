// =============================================================================
// useChat — conversazioni (hub), header, messaggi paginati, invio, letto, realtime.
// =============================================================================
// Pattern React Query come useProfilo/useAmici: query key factory, throw + invalidate.
// I messaggi usano useInfiniteQuery (pagine desc, paginazione all'indietro). Il
// realtime aggiorna la cache in-place (dedup per id) e, in mancanza (publication
// non ancora pushata), la UI ricade sul refetch on-focus.

import { useCallback, useEffect, useMemo } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import {
  addConversationMember,
  clearConversationHistory,
  createGroupConversation,
  fetchComposerDisabledReason,
  fetchConversationHeader,
  fetchConversations,
  fetchGroupSenders,
  fetchMessagesPage,
  fetchSavedMessages,
  leaveConversation,
  markConversationRead,
  MESSAGES_PAGE,
  removeConversationMember,
  saveMessage,
  sendAudioMessage,
  sendTextMessage,
  setConversationFlag,
  setConversationMute,
  softDeleteMessage,
  unsaveMessage,
  type ConversationView,
} from '@/lib/chat';
import { subscribeConversation, subscribeMessagesAll } from '@/lib/chat-realtime';
import { chatKeys, conversationsPrefix, upsertMessage } from '@/lib/chat-cache';
import { enqueueAudio, enqueueText, flushOutbox, retrySend } from '@/lib/outbox';
import { initRete, onRiconnessione } from '@/lib/rete';
import { useChatStore } from '@/store/chatStore';
import type { MessageRow } from '@/types';
import type { ConversationType } from '@/types/supabase';

// Query keys e manipolazione cache: estratte in lib/chat-cache (CM2), perché
// servono anche al motore dell'outbox fuori dagli hook. Ri-esportate per compat.
export { chatKeys };

// --- Lista conversazioni -----------------------------------------------------

export function useConversations(view: ConversationView = 'active') {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: uid ? chatKeys.conversations(uid, view) : ['chat', 'anon', 'conversations', view],
    enabled: !!uid,
    queryFn: () => fetchConversations(uid as string, view),
  });
}


// --- Messaggi salvati (S7) ---------------------------------------------------

export function useSavedMessages() {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: uid ? chatKeys.saved(uid) : ['chat', 'anon', 'saved'],
    enabled: !!uid,
    queryFn: () => fetchSavedMessages(uid as string),
  });
}

// --- Header conversazione ----------------------------------------------------

export function useConversationHeader(convId: string) {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: chatKeys.header(convId),
    enabled: !!uid && !!convId,
    queryFn: () => fetchConversationHeader(convId, uid as string),
  });
}

// --- Mittenti (nome sopra le bolle nei gruppi) -------------------------------

/**
 * Mappa dei mittenti (id → ProfileCard) per mostrare il nome sopra le bolle dei
 * gruppi. `enabled` va passato true solo per group/house (nelle DM è inutile).
 */
export function useConversationSenders(convId: string, enabled: boolean) {
  return useQuery({
    queryKey: chatKeys.senders(convId),
    enabled: enabled && !!convId,
    queryFn: () => fetchGroupSenders(convId),
  });
}

// --- Messaggi (paginati) -----------------------------------------------------

/**
 * Messaggi paginati della conversazione. `clearedAt` è il cleared_at della MIA
 * membership (dall'header): `undefined` = header non ancora caricato → query
 * spenta (evita il flash dei messaggi "cancellati"); `null` = nessuna
 * cronologia cancellata. Fa parte della query key: dopo "Cancella cronologia"
 * l'header invalidato porta un cleared_at nuovo → chiave nuova → refetch pulito
 * filtrato lato server (niente race con la cache vecchia).
 */
export function useMessages(convId: string, clearedAt: string | null | undefined) {
  return useInfiniteQuery({
    queryKey: [...chatKeys.messages(convId), clearedAt ?? null] as const,
    enabled: !!convId && clearedAt !== undefined,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => fetchMessagesPage(convId, pageParam, MESSAGES_PAGE, clearedAt),
    // La pagina è "piena" → potrebbero esserci messaggi più vecchi.
    getNextPageParam: (lastPage) =>
      lastPage.length === MESSAGES_PAGE ? lastPage[lastPage.length - 1]?.created_at : undefined,
  });
}

// --- Composer disabilitato (CM1 — §11.4) ---------------------------------------

/**
 * Motivo per cui il composer è disabilitato (null = libero di scrivere):
 * sanzioni di moderazione proprie (mute/ban globali) e, nelle DM, blocco della
 * coppia. `peerId` va passato solo per le DM (null per i gruppi).
 */
export function useComposerDisabledReason(peerId: string | null) {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: ['chat', 'composer-block', uid ?? 'anon', peerId ?? 'none'] as const,
    enabled: !!uid,
    queryFn: () => fetchComposerDisabledReason(uid as string, peerId),
  });
}

// --- Invio -------------------------------------------------------------------

export function useSendMessage(convId: string) {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const uid = session?.user.id;
  return useMutation({
    mutationFn: (input: { body: string; replyTo?: string | null }) =>
      sendTextMessage(convId, input.body, input.replyTo),
    onSuccess: (msg) => {
      upsertMessage(queryClient, convId, msg);
      if (uid) void queryClient.invalidateQueries({ queryKey: conversationsPrefix(uid) });
    },
  });
}

/** Invio di un vocale: stesso pattern di useSendMessage (upsert + invalidate). */
export function useSendAudioMessage(convId: string) {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const uid = session?.user.id;
  return useMutation({
    mutationFn: (input: { audioPath: string; replyTo?: string | null }) =>
      sendAudioMessage(convId, input.audioPath, input.replyTo),
    onSuccess: (msg) => {
      upsertMessage(queryClient, convId, msg);
      if (uid) void queryClient.invalidateQueries({ queryKey: conversationsPrefix(uid) });
    },
  });
}

export function useDeleteMessage(convId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => softDeleteMessage(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: chatKeys.messages(convId) }),
  });
}

// --- Letto -------------------------------------------------------------------

export function useMarkRead(convId: string) {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const uid = session?.user.id;
  return useMutation({
    mutationFn: () => markConversationRead(convId),
    onSuccess: () => {
      if (uid) void queryClient.invalidateQueries({ queryKey: conversationsPrefix(uid) });
    },
  });
}

// --- Gruppi: crea / aggiungi / rimuovi / esci --------------------------------

/** Crea un gruppo/house e ritorna il conversation_id. Invalida la lista. */
export function useCreateGroup() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const uid = session?.user.id;
  return useMutation({
    mutationFn: (input: { type: ConversationType; name: string | null; members: string[] }) =>
      createGroupConversation(input.type, input.name, input.members),
    onSuccess: () => {
      if (uid) void queryClient.invalidateQueries({ queryKey: conversationsPrefix(uid) });
    },
  });
}

/** Invalida header + senders della conversazione dopo un cambio di membri. */
function useInvalidateMembers(convId: string) {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const uid = session?.user.id;
  return () => {
    void queryClient.invalidateQueries({ queryKey: chatKeys.header(convId) });
    void queryClient.invalidateQueries({ queryKey: chatKeys.senders(convId) });
    if (uid) void queryClient.invalidateQueries({ queryKey: conversationsPrefix(uid) });
  };
}

export function useAddMember(convId: string) {
  const invalidate = useInvalidateMembers(convId);
  return useMutation({
    mutationFn: (userId: string) => addConversationMember(convId, userId),
    onSuccess: invalidate,
  });
}

export function useRemoveMember(convId: string) {
  const invalidate = useInvalidateMembers(convId);
  return useMutation({
    mutationFn: (userId: string) => removeConversationMember(convId, userId),
    onSuccess: invalidate,
  });
}

/** Esci dalla conversazione (il chiamante gestisce la navigazione all'hub). */
export function useLeaveConversation(convId: string) {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const uid = session?.user.id;
  return useMutation({
    mutationFn: () => leaveConversation(convId),
    onSuccess: () => {
      if (uid) void queryClient.invalidateQueries({ queryKey: conversationsPrefix(uid) });
    },
  });
}

// --- Organizzazione conversazione (D4): mute / archivia / fissa / cancella ----

/**
 * Mutazioni di organizzazione per una conversazione. Ogni azione invalida TUTTE le
 * viste della lista (active/archived/muted) + l'header. `mute` accetta la data
 * fino a cui silenziare (null = riattiva).
 */
export function useConversationOrg(convId: string) {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const uid = session?.user.id;
  const invalidate = () => {
    if (uid) void queryClient.invalidateQueries({ queryKey: conversationsPrefix(uid) });
    void queryClient.invalidateQueries({ queryKey: chatKeys.header(convId) });
    void queryClient.invalidateQueries({ queryKey: chatKeys.messages(convId) });
  };

  const mute = useMutation({
    mutationFn: (until: string | null) => setConversationMute(convId, until),
    onSuccess: invalidate,
  });
  const flag = useMutation({
    mutationFn: (input: { flag: 'archived' | 'pinned' | 'hidden'; on: boolean }) =>
      setConversationFlag(convId, input.flag, input.on),
    onSuccess: invalidate,
  });
  const clearHistory = useMutation({
    mutationFn: () => clearConversationHistory(convId),
    onSuccess: invalidate,
  });
  return { mute, flag, clearHistory };
}

// --- Messaggi salvati (bookmark) ---------------------------------------------

/** Salva / rimuovi un messaggio dai salvati. Invalida la lista salvati. */
export function useSaveMessage() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const uid = session?.user.id;
  const invalidate = () => {
    if (uid) void queryClient.invalidateQueries({ queryKey: chatKeys.saved(uid) });
  };
  const save = useMutation({ mutationFn: (id: string) => saveMessage(id), onSuccess: invalidate });
  const unsave = useMutation({ mutationFn: (id: string) => unsaveMessage(id), onSuccess: invalidate });
  return { save, unsave };
}

// --- Realtime ----------------------------------------------------------------

/**
 * Aggancia il realtime della conversazione aperta: aggiorna la cache dei messaggi,
 * invalida l'header (spunte del peer) e chiama `onIncoming` sui messaggi ALTRUI
 * (per segnare letto). Cleanup automatico.
 */
export function useConversationRealtime(convId: string, onIncoming?: (m: MessageRow) => void) {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const uid = session?.user.id;

  useEffect(() => {
    if (!convId) return;
    const unsub = subscribeConversation(convId, {
      onInsert: (m) => {
        upsertMessage(queryClient, convId, m);
        if (uid) void queryClient.invalidateQueries({ queryKey: conversationsPrefix(uid) });
        if (m.sender_id !== uid) onIncoming?.(m);
      },
      onUpdate: (m) => upsertMessage(queryClient, convId, m),
      onMemberUpdate: () =>
        void queryClient.invalidateQueries({ queryKey: chatKeys.header(convId) }),
    });
    return unsub;
  }, [convId, uid, queryClient, onIncoming]);
}

// --- Outbox: invio ottimistico (CM2, RC-01/RC-02) ------------------------------

/**
 * Coda d'invio della conversazione: bolle pending/failed + azioni. L'item vive
 * nello store finché il server non conferma (→ riga reale in cache, dedup per id
 * anche verso il realtime) o rifiuta (→ failed con Riprova/Elimina). Offline:
 * resta pending e riparte alla riconnessione (flush in useChatRuntime).
 */
export function useOutbox(convId: string) {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const uid = session?.user.id;
  const tutti = useChatStore((s) => s.outbox);
  const discardStore = useChatStore((s) => s.outboxRemove);

  const outbox = useMemo(
    () => tutti.filter((o) => o.conversationId === convId),
    [tutti, convId],
  );

  const sendText = useCallback(
    (body: string, replyTo: string | null) => {
      if (!uid) return;
      enqueueText(queryClient, uid, convId, body, replyTo);
    },
    [queryClient, uid, convId],
  );

  const sendAudio = useCallback(
    (audioLocalUri: string, audioSeconds: number, replyTo: string | null) => {
      if (!uid) return;
      enqueueAudio(queryClient, uid, convId, audioLocalUri, audioSeconds, replyTo);
    },
    [queryClient, uid, convId],
  );

  const retry = useCallback(
    (tempId: string) => {
      if (!uid) return;
      retrySend(queryClient, uid, tempId);
    },
    [queryClient, uid],
  );

  return { outbox, sendText, sendAudio, retry, discard: discardStore };
}

// --- Runtime chat globale (CM2): rete, hub realtime, flush riconnessione -------

/**
 * Da montare UNA volta nella shell autenticata (componente ChatRuntime):
 * 1. cabla NetInfo in onlineManager (query in pausa offline);
 * 2. canale realtime GLOBALE sugli INSERT di `messages` (la RLS filtra lato
 *    server) → cache della conversazione + lista chat/badge aggiornati live
 *    senza aprire la chat (§8.5);
 * 3. alla riconnessione, flush sequenziale dell'outbox (RC-02).
 */
export function useChatRuntime() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const uid = session?.user.id;

  useEffect(() => {
    initRete();
  }, []);

  useEffect(() => {
    if (!uid) return;
    const unsub = subscribeMessagesAll((m) => {
      upsertMessage(queryClient, m.conversation_id, m);
      void queryClient.invalidateQueries({ queryKey: conversationsPrefix(uid) });
    });
    return unsub;
  }, [uid, queryClient]);

  useEffect(() => {
    if (!uid) return;
    return onRiconnessione(() => {
      void flushOutbox(queryClient, uid);
    });
  }, [uid, queryClient]);
}
