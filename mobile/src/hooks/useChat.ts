// =============================================================================
// useChat — conversazioni (hub), header, messaggi paginati, invio, letto, realtime.
// =============================================================================
// Pattern React Query come useProfilo/useAmici: query key factory, throw + invalidate.
// I messaggi usano useInfiniteQuery (pagine desc, paginazione all'indietro). Il
// realtime aggiorna la cache in-place (dedup per id) e, in mancanza (publication
// non ancora pushata), la UI ricade sul refetch on-focus.

import { useEffect } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
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
import { subscribeConversation } from '@/lib/chat-realtime';
import type { MessageRow } from '@/types';
import type { ConversationType } from '@/types/supabase';

// --- Query keys --------------------------------------------------------------
export const chatKeys = {
  conversations: (uid: string, view: ConversationView = 'active') =>
    ['chat', uid, 'conversations', view] as const,
  header: (convId: string) => ['chat', 'header', convId] as const,
  messages: (convId: string) => ['chat', 'messages', convId] as const,
  senders: (convId: string) => ['chat', 'senders', convId] as const,
  saved: (uid: string) => ['chat', uid, 'saved'] as const,
};

type MessagesData = InfiniteData<MessageRow[], string | undefined>;

/**
 * Inserisce/aggiorna un messaggio nella cache infinita (dedup per id).
 * `chatKeys.messages(convId)` è un PREFISSO: la chiave reale include anche il
 * cleared_at corrente (vedi useMessages) → setQueriesData copre ogni variante.
 */
function upsertMessage(queryClient: QueryClient, convId: string, msg: MessageRow) {
  queryClient.setQueriesData<MessagesData>({ queryKey: chatKeys.messages(convId) }, (old) => {
    if (!old) return old;
    const exists = old.pages.some((p) => p.some((m) => m.id === msg.id));
    if (exists) {
      return {
        ...old,
        pages: old.pages.map((p) => p.map((m) => (m.id === msg.id ? msg : m))),
      };
    }
    // Nuovo: in cima alla prima pagina (la più recente).
    const pages = old.pages.slice();
    pages[0] = [msg, ...(pages[0] ?? [])];
    return { ...old, pages };
  });
}

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

/** Prefisso per invalidare TUTTE le viste della lista conversazioni (active/archived/muted). */
function conversationsPrefix(uid: string) {
  return ['chat', uid, 'conversations'] as const;
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
