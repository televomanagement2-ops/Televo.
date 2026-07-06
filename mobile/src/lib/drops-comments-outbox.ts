// =============================================================================
// drops-comments-outbox.ts — invio ottimistico dei commenti (S3, DM3).
// =============================================================================
// Specchio di `lib/outbox.ts` (chat), ristretto ai commenti drop: testo o
// vocale, 1 livello di reply. Flusso: enqueue → bolla "pending" (item nello
// store) → tentativo → successo: item rimosso + riga REALE upsertata in cache
// (dedup per id anche verso il realtime) → errore di rete: resta pending
// (riparte alla riconnessione, flushCommentOutbox) → errore server (drop_expired,
// rate_limited, reply_depth_exceeded…): failed con messaggio IT e Riprova/Elimina.
// I vocali si caricano PRIMA dell'insert (upload-first), come i drop.

import type { QueryClient } from '@tanstack/react-query';
import { onlineManager } from '@tanstack/react-query';
import { insertDropComment, moderaDropComment, uploadDropCommentAudio, dropKeys } from '@/lib/drops';
import { upsertComment } from '@/lib/drops-comments-cache';
import { nuovoTempId } from '@/lib/outbox';
import { dropErrorMessage } from '@/lib/errors';
import { useDropStore, type DropCommentOutboxItem } from '@/store/dropStore';

/** True se l'errore è di trasporto (offline/timeout): si resta pending. */
function erroreDiRete(e: unknown): boolean {
  if (!onlineManager.isOnline()) return true;
  const msg = e instanceof Error ? e.message : String(e);
  return /network request failed|failed to fetch|timeout/i.test(msg);
}

// Guardia anti doppio-invio: tempId attualmente in volo (flush + retry insieme).
const inVolo = new Set<string>();

/**
 * Tenta l'invio di UN commento dell'outbox. Idempotente rispetto alle corse: se
 * è già in volo o non è più nello store, non fa nulla.
 */
export async function attemptSendComment(
  queryClient: QueryClient,
  uid: string,
  tempId: string,
): Promise<void> {
  const item = useDropStore.getState().commentOutbox.find((o) => o.tempId === tempId);
  if (!item || inVolo.has(tempId)) return;
  inVolo.add(tempId);
  try {
    // Vocale: upload PRIMA dell'insert su path <dropId>/<uid>/commento_… (il
    // trigger esige il prefisso). Un eventuale orfano da retry è in carico alla
    // pulizia (DM6, R-09).
    let audioUrl: string | null = null;
    if (item.type === 'audio') {
      audioUrl = await uploadDropCommentAudio(item.dropId, uid, item.audioLocalUri as string);
    }

    const row = await insertDropComment({
      dropId: item.dropId,
      parentId: item.parentId,
      type: item.type,
      body: item.body,
      audioUrl,
      audioSeconds: item.type === 'audio' ? item.audioSeconds : null,
    });

    // Prima rimuovo il temp, poi upserto la riga reale: mai due bolle insieme.
    useDropStore.getState().commentOutboxRemove(tempId);
    upsertComment(queryClient, item.dropId, row);
    // I contatori dell'autore (comment_count in drop_detail) si aggiornano al
    // refetch: invalidazione mirata del dettaglio (no-op per il non-autore).
    void queryClient.invalidateQueries({ queryKey: dropKeys.detail(item.dropId) });
    // Moderazione in background (§9): solo i commenti testuali.
    if (item.type === 'text') moderaDropComment(row.id, row.body);
  } catch (e) {
    if (erroreDiRete(e)) {
      useDropStore.getState().commentOutboxMarkPending(tempId);
    } else {
      useDropStore.getState().commentOutboxMarkFailed(tempId, dropErrorMessage(e));
    }
  } finally {
    inVolo.delete(tempId);
  }
}

function enqueue(queryClient: QueryClient, uid: string, item: DropCommentOutboxItem): void {
  useDropStore.getState().commentOutboxAdd(item);
  if (onlineManager.isOnline()) void attemptSendComment(queryClient, uid, item.tempId);
}

/** Accoda un commento di testo e (se online) lo invia subito. */
export function enqueueTextComment(
  queryClient: QueryClient,
  uid: string,
  p: { dropId: string; parentId: string | null; body: string },
): void {
  enqueue(queryClient, uid, {
    tempId: nuovoTempId(),
    dropId: p.dropId,
    parentId: p.parentId,
    type: 'text',
    body: p.body,
    audioLocalUri: null,
    audioSeconds: null,
    createdAt: new Date().toISOString(),
    status: 'pending',
    errorMessage: null,
  });
}

/** Accoda un commento vocale (URI locale + durata; upload al momento dell'invio). */
export function enqueueAudioComment(
  queryClient: QueryClient,
  uid: string,
  p: { dropId: string; parentId: string | null; audioLocalUri: string; audioSeconds: number },
): void {
  enqueue(queryClient, uid, {
    tempId: nuovoTempId(),
    dropId: p.dropId,
    parentId: p.parentId,
    type: 'audio',
    body: null,
    audioLocalUri: p.audioLocalUri,
    audioSeconds: p.audioSeconds,
    createdAt: new Date().toISOString(),
    status: 'pending',
    errorMessage: null,
  });
}

/** Riprova un commento failed (torna pending e ritenta subito). */
export function retrySendComment(queryClient: QueryClient, uid: string, tempId: string): void {
  useDropStore.getState().commentOutboxMarkPending(tempId);
  void attemptSendComment(queryClient, uid, tempId);
}

/**
 * Invia in SEQUENZA tutti i commenti pending (ordine di enqueue). Chiamato alla
 * riconnessione dal runtime globale (useDropRuntime).
 */
export async function flushCommentOutbox(queryClient: QueryClient, uid: string): Promise<void> {
  const pending = useDropStore.getState().commentOutbox.filter((o) => o.status === 'pending');
  for (const item of pending) {
    await attemptSendComment(queryClient, uid, item.tempId);
  }
}
