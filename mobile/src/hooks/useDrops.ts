// =============================================================================
// useDrops — hook del dominio Drops (M6).
// =============================================================================
// DM1: pubblicazione ottimistica (outbox) + runtime globale (flush alla
// riconnessione). DM2: il FEED (useInfiniteQuery keyset + prefetch pagina
// successiva) e le interazioni leggere della card (like/salvataggio/reaction-
// tratto), ottimistiche con rollback (modello useToggleReaction della chat).
// Il dettaglio (S3) e i commenti arrivano in DM3.

import { useCallback, useEffect } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import {
  enqueueDropAudio,
  enqueueDropFoto,
  enqueueDropText,
  flushDropOutbox,
  retrySendDrop,
} from '@/lib/drops-outbox';
import { flushCommentOutbox } from '@/lib/drops-comments-outbox';
import {
  deleteDrop,
  dropKeys,
  FEED_PAGE,
  fetchDropPromptToday,
  fetchDropsFeed,
  fetchMemories,
  fetchSavedDrops,
  MEMORIES_PAGE,
  nuovoDropId,
  setDropLike,
  setDropReaction,
  setDropSave,
  type DropFeedCursor,
  type MemoryCursor,
} from '@/lib/drops';
import {
  applyLike,
  applyReaction,
  applySave,
  patchDrop,
  restoreDrop,
} from '@/lib/drops-cache';
import { onRiconnessione } from '@/lib/rete';
import { useDropStore } from '@/store/dropStore';
import type { DropReactionTrait, SavedDropRow } from '@/types/supabase';

// --- Pubblicazione ottimistica (composer S2) ---------------------------------

/**
 * API di pubblicazione dei drop: genera l'id, accoda nell'outbox e (se online)
 * pubblica subito. Il chiamante (composer) chiude la schermata immediatamente:
 * pending/failed vivono nello store, il flush alla riconnessione li riprende.
 * Ogni `pubblica*` ritorna il dropId (utile per tracciare la card ottimistica).
 */
export function useDropOutbox() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const uid = session?.user.id;

  const pubblicaTesto = useCallback(
    (body: string): string | null => {
      if (!uid) return null;
      const dropId = nuovoDropId();
      enqueueDropText(queryClient, uid, { dropId, body: body.trim() });
      return dropId;
    },
    [queryClient, uid],
  );

  const pubblicaFoto = useCallback(
    (mediaLocalUri: string, mediaMimeType: string, caption: string): string | null => {
      if (!uid) return null;
      const dropId = nuovoDropId();
      enqueueDropFoto(queryClient, uid, {
        dropId,
        body: caption.trim() || null,
        mediaLocalUri,
        mediaMimeType,
      });
      return dropId;
    },
    [queryClient, uid],
  );

  const pubblicaAudio = useCallback(
    (audioLocalUri: string, audioSeconds: number, caption: string): string | null => {
      if (!uid) return null;
      const dropId = nuovoDropId();
      enqueueDropAudio(queryClient, uid, {
        dropId,
        body: caption.trim() || null,
        audioLocalUri,
        audioSeconds,
      });
      return dropId;
    },
    [queryClient, uid],
  );

  return { pubblicaTesto, pubblicaFoto, pubblicaAudio };
}

/**
 * Accesso all'OUTBOX per il feed (S1): i drop pending/failed dell'utente, mostrati
 * come card ottimistiche in testa (RC-01), con le azioni Riprova/Elimina sui
 * failed. Dal DM2 questa è l'UNICA superficie dei fallimenti di pubblicazione
 * (il "ponte" a dialogo del DM1 è stato rimosso: la card lo racconta meglio).
 */
export function useDropOutboxCards() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const uid = session?.user.id;
  const items = useDropStore((s) => s.outbox);

  const retry = useCallback(
    (dropId: string) => {
      if (uid) retrySendDrop(queryClient, uid, dropId);
    },
    [queryClient, uid],
  );
  const remove = useCallback((dropId: string) => useDropStore.getState().outboxRemove(dropId), []);

  return { items, retry, remove };
}

// --- Feed (S1, DM2): useInfiniteQuery keyset + prefetch pagina successiva ------

/**
 * Il feed dei drop degli amici (ultime 24h) + i propri, keyset su
 * (created_at desc, id desc). NIENTE realtime (scelta anti-doomscroll §6): la
 * freschezza arriva da pull-to-refresh e refetch on focus. Il predicato di
 * visibilità e i contatori privati sono enforced nella RPC — il client non
 * filtra nulla. Il chiamante appiattisce le pagine e ci antepone l'outbox.
 */
export function useDropsFeed() {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useInfiniteQuery({
    queryKey: dropKeys.feed(),
    enabled: !!uid,
    initialPageParam: null as DropFeedCursor | null,
    queryFn: ({ pageParam }) => fetchDropsFeed(pageParam),
    // Pagina piena → potrebbero esserci drop più vecchi: cursore = ultima riga.
    getNextPageParam: (lastPage) => {
      if (lastPage.length < FEED_PAGE) return undefined;
      const last = lastPage[lastPage.length - 1];
      return last ? { before: last.created_at, beforeId: last.id } : undefined;
    },
    staleTime: 30_000,
  });
}

// --- Interazioni leggere della card (like · salvataggio · reaction-tratto) -----
// Tutte ottimistiche: patch immediato di feed + dettaglio + snapshot per il
// rollback su errore (modello useToggleReaction, §6). Il patch tocca ENTRAMBE le
// cache (S1 e S3) così il gesto è coerente ovunque parta (DM4: like/save anche
// dal MenuDrop del dettaglio). Nessuna invalidate su successo (niente realtime:
// la cache patchata È la verità fino al prossimo refetch).

/** Like (♥): toggle diretto su drop_likes, ottimistico (feed + dettaglio). */
export function useToggleLike() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ dropId, next }: { dropId: string; next: boolean }) => setDropLike(dropId, next),
    onMutate: ({ dropId, next }) => ({
      snapshot: patchDrop(queryClient, dropId, applyLike(next)),
    }),
    onError: (_e, v, ctx) => restoreDrop(queryClient, v.dropId, ctx?.snapshot),
  });
}

/** Salvataggio (🔖): toggle via RPC save_drop/unsave_drop, ottimistico. */
export function useToggleSave() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ dropId, next }: { dropId: string; next: boolean }) => setDropSave(dropId, next),
    onMutate: ({ dropId, next }) => ({
      snapshot: patchDrop(queryClient, dropId, applySave(next)),
    }),
    onError: (_e, v, ctx) => restoreDrop(queryClient, v.dropId, ctx?.snapshot),
  });
}

/** Reaction-tratto (gesto forte → prop → Aura): toggle su drop_reactions. */
export function useToggleDropReaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      dropId,
      trait,
      next,
    }: {
      dropId: string;
      trait: DropReactionTrait;
      next: boolean;
    }) => setDropReaction(dropId, trait, next),
    onMutate: ({ dropId, trait, next }) => ({
      snapshot: patchDrop(queryClient, dropId, applyReaction(trait, next)),
    }),
    onError: (_e, v, ctx) => restoreDrop(queryClient, v.dropId, ctx?.snapshot),
  });
}

// --- Eliminazione anticipata (§5.4) + archivio privato (S4/S5, DM4) -----------

/**
 * Elimina un drop (autore, in qualunque momento — anche da Ricordo). Alla
 * conferma la riga sparisce per tutti; i file finiscono in coda cleanup (trigger).
 * Invalidiamo TUTTE le aree che potrebbero mostrarlo (feed, dettaglio, salvati,
 * ricordi): la cache non deve restare incoerente dopo un delete (rischio §DM4).
 * Il chiamante gestisce la navigazione (feed: resta; dettaglio: torna indietro).
 */
export function useDeleteDrop() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dropId: string) => deleteDrop(dropId),
    onSuccess: (_d, dropId) => {
      void queryClient.invalidateQueries({ queryKey: dropKeys.feed() });
      void queryClient.invalidateQueries({ queryKey: dropKeys.saved() });
      void queryClient.invalidateQueries({ queryKey: dropKeys.memories() });
      queryClient.removeQueries({ queryKey: dropKeys.detail(dropId) });
    },
  });
}

/** I miei segnalibri (S4). La RLS limita alle mie righe; il drop embeddato alla
 *  visibilità corrente (scaduto/ex-amico → null, "non disponibile" nella UI). */
export function useSavedDrops() {
  const { session } = useAuth();
  return useQuery({
    queryKey: dropKeys.saved(),
    enabled: !!session?.user.id,
    queryFn: () => fetchSavedDrops(),
    staleTime: 30_000,
  });
}

/**
 * Tema del giorno (DM7, §16.2) per il banner del composer (S2). null → niente
 * banner. Refetch on focus di default; staleTime lungo (il tema cambia una volta
 * al giorno). È solo uno spunto: nessuna azione, nessun contatore.
 */
export function useDropPromptOfDay() {
  const { session } = useAuth();
  return useQuery({
    queryKey: dropKeys.prompt(),
    enabled: !!session?.user.id,
    queryFn: () => fetchDropPromptToday(),
    staleTime: 60 * 60_000, // 1h: il tema è stabile nell'arco della giornata
  });
}

/**
 * Rimuove un segnalibro dalla lista Salvati (S4): unsave via RPC + rimozione
 * ottimistica dalla cache `saved`, e patch coerente di feed/dettaglio
 * (`mio_salvataggio`). Rollback completo su errore.
 */
export function useRemoveSave() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dropId: string) => setDropSave(dropId, false),
    onMutate: (dropId) => {
      const prev = queryClient.getQueryData<SavedDropRow[]>(dropKeys.saved());
      if (prev) {
        queryClient.setQueryData<SavedDropRow[]>(
          dropKeys.saved(),
          prev.filter((r) => r.drop_id !== dropId),
        );
      }
      return { prev, snap: patchDrop(queryClient, dropId, applySave(false)) };
    },
    onError: (_e, dropId, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(dropKeys.saved(), ctx.prev);
      restoreDrop(queryClient, dropId, ctx?.snap);
    },
  });
}

/** I miei Ricordi (S5): i miei drop scaduti, keyset desc, retention illimitata. */
export function useMemories() {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useInfiniteQuery({
    queryKey: dropKeys.memories(),
    enabled: !!uid,
    initialPageParam: null as MemoryCursor | null,
    queryFn: ({ pageParam }) => fetchMemories(uid as string, pageParam),
    getNextPageParam: (lastPage) => {
      if (lastPage.length < MEMORIES_PAGE) return undefined;
      const last = lastPage[lastPage.length - 1];
      return last ? { before: last.created_at, beforeId: last.id } : undefined;
    },
    staleTime: 60_000,
  });
}

// --- Runtime globale del dominio Drops ---------------------------------------

/**
 * Da montare UNA volta nella shell autenticata (ChatRuntime): alla riconnessione,
 * flush sequenziale dell'outbox drop (RC-01). I fallimenti terminali NON si
 * annunciano più con un dialogo (ponte DM1 rimosso): li mostra la card
 * ottimistica nel feed (useDropOutboxCards).
 */
export function useDropRuntime() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const uid = session?.user.id;

  useEffect(() => {
    if (!uid) return;
    return onRiconnessione(() => {
      void flushDropOutbox(queryClient, uid);
      // DM3: anche i commenti in coda ripartono alla riconnessione (RC-01).
      void flushCommentOutbox(queryClient, uid);
    });
  }, [uid, queryClient]);
}
