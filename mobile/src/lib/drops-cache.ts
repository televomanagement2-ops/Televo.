// =============================================================================
// drops-cache.ts — manipolazione della cache React Query del feed drops (DM2).
// =============================================================================
// Il feed è un useInfiniteQuery su `dropKeys.feed()` (pagine di DropFeedRow). Qui
// vivono i patch OTTIMISTICI delle interazioni leggere (like/salvataggio/
// reaction-tratto): aggiornano la riga in cache prima della conferma server, con
// snapshot/rollback (modello useToggleReaction della chat). Estratto in un modulo
// dedicato — come chat-cache — così DM3 (dettaglio) e DM4 (schermate) riusano gli
// stessi patch senza duplicarli.

import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import { dropKeys } from '@/lib/drops';
import type { DropFeedRow, DropReactionTrait } from '@/types/supabase';

/** La cache del feed: pagine keyset (cursore = ultima riga della pagina). */
export type DropsFeedData = InfiniteData<DropFeedRow[], unknown>;

/**
 * Applica `updater` alla riga `dropId` in OGNI pagina del feed (dedup naturale:
 * un drop compare una sola volta). No-op se la cache non c'è o la riga non è in
 * pagina. Ritorna lo snapshot precedente per il rollback su errore.
 */
export function patchDropInFeed(
  queryClient: QueryClient,
  dropId: string,
  updater: (row: DropFeedRow) => DropFeedRow,
): DropsFeedData | undefined {
  const key = dropKeys.feed();
  const prev = queryClient.getQueryData<DropsFeedData>(key);
  if (!prev) return undefined;
  queryClient.setQueryData<DropsFeedData>(key, {
    ...prev,
    pages: prev.pages.map((page) => page.map((row) => (row.id === dropId ? updater(row) : row))),
  });
  return prev;
}

/** Ripristina lo snapshot del feed (rollback dopo un errore di mutazione). */
export function restoreFeed(queryClient: QueryClient, snapshot: DropsFeedData | undefined): void {
  if (snapshot) queryClient.setQueryData(dropKeys.feed(), snapshot);
}

// --- Patch congiunto feed + dettaglio (DM4) -----------------------------------
// Le interazioni leggere possono partire dal feed (S1) O dal dettaglio (S3, via
// MenuDrop). La cache del dettaglio è una singola riga su `dropKeys.detail(id)`
// (seed dal feed). Patchiamo ENTRAMBE così `mio_like`/`mio_salvataggio` e i
// contatori privati dell'autore restano coerenti ovunque, con un solo rollback.

/** Snapshot combinato per il rollback: feed + (eventuale) riga di dettaglio. */
export interface DropSnapshot {
  feed: DropsFeedData | undefined;
  /** `undefined` = nessuna cache dettaglio; `null` = era in cache come non-visibile. */
  detail: DropFeedRow | null | undefined;
}

/**
 * Applica `updater` alla riga `dropId` sia nel feed sia nella cache del dettaglio
 * (se presenti). Ritorna lo snapshot combinato per il rollback su errore.
 */
export function patchDrop(
  queryClient: QueryClient,
  dropId: string,
  updater: (row: DropFeedRow) => DropFeedRow,
): DropSnapshot {
  const feed = patchDropInFeed(queryClient, dropId, updater);
  const detailKey = dropKeys.detail(dropId);
  const prevDetail = queryClient.getQueryData<DropFeedRow | null>(detailKey);
  if (prevDetail) queryClient.setQueryData<DropFeedRow | null>(detailKey, updater(prevDetail));
  return { feed, detail: prevDetail };
}

/** Ripristina lo snapshot combinato (feed + dettaglio) dopo un errore. */
export function restoreDrop(
  queryClient: QueryClient,
  dropId: string,
  snapshot: DropSnapshot | undefined,
): void {
  if (!snapshot) return;
  restoreFeed(queryClient, snapshot.feed);
  if (snapshot.detail !== undefined) {
    queryClient.setQueryData(dropKeys.detail(dropId), snapshot.detail);
  }
}

// --- Aggiornatori di riga (puri) ----------------------------------------------
// I contatori sono valorizzati SOLO sui drop propri (R-04): li tocchiamo solo se
// non-null, così la card di un amico non si "inventa" numeri mai ricevuti.

const bump = (n: number | null, d: number): number | null => (n == null ? null : Math.max(0, n + d));

/** Like ottimistico: flippa `mio_like` e, se è un mio drop, il contatore. */
export function applyLike(on: boolean) {
  return (row: DropFeedRow): DropFeedRow =>
    row.mio_like === on ? row : { ...row, mio_like: on, like_count: bump(row.like_count, on ? 1 : -1) };
}

/** Salvataggio ottimistico: flippa `mio_salvataggio` e il contatore (se mio). */
export function applySave(on: boolean) {
  return (row: DropFeedRow): DropFeedRow =>
    row.mio_salvataggio === on
      ? row
      : { ...row, mio_salvataggio: on, save_count: bump(row.save_count, on ? 1 : -1) };
}

/** Reaction-tratto ottimistica: aggiorna `mie_reactions` e i conteggi per tratto. */
export function applyReaction(trait: DropReactionTrait, on: boolean) {
  return (row: DropFeedRow): DropFeedRow => {
    const has = row.mie_reactions.includes(trait);
    if (has === on) return row;
    const mie_reactions = on
      ? [...row.mie_reactions, trait]
      : row.mie_reactions.filter((t) => t !== trait);
    let reaction_counts = row.reaction_counts;
    if (reaction_counts != null) {
      const cur = reaction_counts[trait] ?? 0;
      reaction_counts = { ...reaction_counts, [trait]: Math.max(0, cur + (on ? 1 : -1)) };
    }
    return { ...row, mie_reactions, reaction_counts };
  };
}
