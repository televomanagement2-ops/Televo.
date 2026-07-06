// =============================================================================
// drops-outbox.ts — motore della pubblicazione ottimistica dei drop (RC-01).
// =============================================================================
// Specchio 1:1 di `lib/outbox.ts` (chat), adattato ai drop: l'ID è REALE (uuid
// generato dal client, R-03), non un "temp-", perché serve al path dei file
// caricati PRIMA dell'insert. Flusso: enqueue → item "pending" nello store →
// upload file (foto/audio) → insert drops → successo: item rimosso + feed
// invalidata (la card reale arriverà dal refetch, DM2) → errore di rete: resta
// pending (riparte alla riconnessione, flushDropOutbox) → errore server
// (rate_limited, validazioni…): failed con messaggio IT e azioni Riprova/Elimina.
// Fuori da React: lo store si legge con getState(), il QueryClient dal chiamante.

import type { QueryClient } from '@tanstack/react-query';
import { onlineManager } from '@tanstack/react-query';
import { insertDrop, moderaDrop, uploadDropAudio, uploadDropFoto, dropKeys } from '@/lib/drops';
import { dropErrorMessage } from '@/lib/errors';
import { useDropStore, type DropOutboxItem } from '@/store/dropStore';

/** True se l'errore è di trasporto (offline/timeout): si resta pending. */
function erroreDiRete(e: unknown): boolean {
  if (!onlineManager.isOnline()) return true;
  const msg = e instanceof Error ? e.message : String(e);
  return /network request failed|failed to fetch|timeout/i.test(msg);
}

// Guardia anti doppio-invio: dropId attualmente in volo (flush + retry insieme).
const inVolo = new Set<string>();

/**
 * Tenta la pubblicazione di UN drop dell'outbox. Idempotente rispetto alle
 * corse: se è già in volo o non è più nello store, non fa nulla.
 */
export async function attemptSendDrop(
  queryClient: QueryClient,
  uid: string,
  dropId: string,
): Promise<void> {
  const item = useDropStore.getState().outbox.find((o) => o.dropId === dropId);
  if (!item || inVolo.has(dropId)) return;
  inVolo.add(dropId);
  try {
    // Foto/audio: upload PRIMA dell'insert su path <dropId>/<uid>/… (il trigger
    // esige il prefisso). Un retry dopo insert fallito ricarica il file:
    // l'eventuale orfano nel bucket è in carico alla pulizia (DM6, R-09).
    let mediaUrl: string | null = null;
    let audioUrl: string | null = null;
    if (item.type === 'media') {
      mediaUrl = await uploadDropFoto(
        dropId,
        uid,
        item.mediaLocalUri as string,
        item.mediaMimeType ?? 'image/jpeg',
      );
    } else if (item.type === 'audio') {
      audioUrl = await uploadDropAudio(dropId, uid, item.audioLocalUri as string);
    }

    await insertDrop({
      id: dropId,
      type: item.type,
      body: item.body,
      mediaUrl,
      audioUrl,
      audioSeconds: item.type === 'audio' ? item.audioSeconds : null,
    });

    useDropStore.getState().outboxRemove(dropId);
    // Nessuna cache feed in DM1 (arriva in DM2): l'invalidazione è un no-op
    // sicuro e forward-compatible (stessa chiave che userà il feed).
    void queryClient.invalidateQueries({ queryKey: dropKeys.feed() });
    // Moderazione in background (§9): testo del drop e caption di foto/audio.
    moderaDrop(dropId, item.body);
  } catch (e) {
    if (erroreDiRete(e)) {
      useDropStore.getState().outboxMarkPending(dropId);
    } else {
      useDropStore.getState().outboxMarkFailed(dropId, dropErrorMessage(e));
    }
  } finally {
    inVolo.delete(dropId);
  }
}

/** Parametri comuni per accodare un drop (l'id è già stato generato dal chiamante). */
interface EnqueueBase {
  dropId: string;
  body: string | null;
}

function enqueue(queryClient: QueryClient, uid: string, item: DropOutboxItem): void {
  useDropStore.getState().outboxAdd(item);
  if (onlineManager.isOnline()) void attemptSendDrop(queryClient, uid, item.dropId);
}

/** Accoda un drop di testo e (se online) lo pubblica subito. */
export function enqueueDropText(
  queryClient: QueryClient,
  uid: string,
  p: EnqueueBase,
): void {
  enqueue(queryClient, uid, {
    dropId: p.dropId,
    type: 'text',
    body: p.body,
    audioLocalUri: null,
    audioSeconds: null,
    mediaLocalUri: null,
    mediaMimeType: null,
    createdAt: new Date().toISOString(),
    status: 'pending',
    errorMessage: null,
  });
}

/** Accoda un drop foto (URI locale + MIME; upload al momento dell'invio). */
export function enqueueDropFoto(
  queryClient: QueryClient,
  uid: string,
  p: EnqueueBase & { mediaLocalUri: string; mediaMimeType: string },
): void {
  enqueue(queryClient, uid, {
    dropId: p.dropId,
    type: 'media',
    body: p.body,
    audioLocalUri: null,
    audioSeconds: null,
    mediaLocalUri: p.mediaLocalUri,
    mediaMimeType: p.mediaMimeType,
    createdAt: new Date().toISOString(),
    status: 'pending',
    errorMessage: null,
  });
}

/** Accoda un drop vocale (URI locale + durata; upload al momento dell'invio). */
export function enqueueDropAudio(
  queryClient: QueryClient,
  uid: string,
  p: EnqueueBase & { audioLocalUri: string; audioSeconds: number },
): void {
  enqueue(queryClient, uid, {
    dropId: p.dropId,
    type: 'audio',
    body: p.body,
    audioLocalUri: p.audioLocalUri,
    audioSeconds: p.audioSeconds,
    mediaLocalUri: null,
    mediaMimeType: null,
    createdAt: new Date().toISOString(),
    status: 'pending',
    errorMessage: null,
  });
}

/** Riprova un drop failed (torna pending e ritenta subito). */
export function retrySendDrop(queryClient: QueryClient, uid: string, dropId: string): void {
  useDropStore.getState().outboxMarkPending(dropId);
  void attemptSendDrop(queryClient, uid, dropId);
}

/**
 * Pubblica in SEQUENZA tutti i pending (ordine di enqueue). Chiamato alla
 * riconnessione dal runtime globale (useDropRuntime).
 */
export async function flushDropOutbox(queryClient: QueryClient, uid: string): Promise<void> {
  const pending = useDropStore.getState().outbox.filter((o) => o.status === 'pending');
  for (const item of pending) {
    await attemptSendDrop(queryClient, uid, item.dropId);
  }
}
