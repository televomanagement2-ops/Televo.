// =============================================================================
// outbox.ts — motore dell'invio ottimistico (CM2, RC-01/RC-02).
// =============================================================================
// Il flusso: enqueue → bolla "pending" immediata (item nello store) → tentativo
// di invio → successo: item rimosso + riga REALE upsertata in cache (dedup per
// id anche verso il realtime) → errore di rete: resta pending (riparte alla
// riconnessione, vedi onRiconnessione) → errore del server (blocked_pair, cap,
// rate-limit…): failed con messaggio IT e azioni Riprova/Elimina.
// Fuori da React: lo store Zustand si legge con getState(), la cache riceve il
// QueryClient dal chiamante (hook o flusher globale).

import type { QueryClient } from '@tanstack/react-query';
import { onlineManager } from '@tanstack/react-query';
import { getInfoAsync } from 'expo-file-system/legacy';
import { moderaMessaggio, sendAudioMessage, sendMediaMessage, sendTextMessage } from '@/lib/chat';
import { conversationsPrefix, upsertMessage } from '@/lib/chat-cache';
import { uploadVocale } from '@/lib/audio';
import { uploadFoto } from '@/lib/media';
import { chatErrorMessage } from '@/lib/errors';
import { useChatStore, type OutboxItem } from '@/store/chatStore';

/** Id temporaneo locale: il prefisso "temp-" non collide mai con gli uuid DB. */
export function nuovoTempId(): string {
  return `temp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** True se l'errore è di trasporto (offline/timeout): si resta pending. */
function erroreDiRete(e: unknown): boolean {
  if (!onlineManager.isOnline()) return true;
  const msg = e instanceof Error ? e.message : String(e);
  return /network request failed|failed to fetch|timeout/i.test(msg);
}

// Guardia anti doppio-invio: tempId attualmente in volo (flush + retry insieme).
const inVolo = new Set<string>();

/**
 * Tenta l'invio di UN item dell'outbox. Idempotente rispetto alle corse: se
 * l'item è già in volo o non è più nello store, non fa nulla.
 */
export async function attemptSend(
  queryClient: QueryClient,
  uid: string,
  tempId: string,
): Promise<void> {
  const store = useChatStore.getState();
  const item = store.outbox.find((o) => o.tempId === tempId);
  if (!item || inVolo.has(tempId)) return;
  inVolo.add(tempId);
  try {
    // M13/P2 (AH-4): l'outbox sopravvive al riavvio, ma i file locali di vocali
    // e foto (cache di registratore/fotocamera) possono non esserci più. Si
    // verifica PRIMA dell'upload: assente → failed esplicito con la UI di
    // retry/elimina esistente — mai un messaggio fantasma.
    const uriLocale =
      item.type === 'audio' ? item.audioLocalUri : item.type === 'media' ? item.mediaLocalUri : null;
    if (uriLocale) {
      const info = await getInfoAsync(uriLocale).catch(() => null);
      if (!info?.exists) {
        useChatStore
          .getState()
          .outboxMarkFailed(tempId, 'Il file non è più su questo dispositivo. Elimina il messaggio.');
        return;
      }
    }
    // Vocali e foto: upload PRIMA dell'insert (caso limite 7 SRS §15 — mai un
    // messaggio senza file dietro). Un retry dopo insert fallito ricarica il
    // file: l'eventuale orfano nel bucket è in carico alla pulizia CM8.
    const row =
      item.type === 'text'
        ? await sendTextMessage(item.conversationId, item.body ?? '', item.replyTo, item.dropRef)
        : item.type === 'media'
          ? await sendMediaMessage(
              item.conversationId,
              await uploadFoto(
                item.conversationId,
                uid,
                item.mediaLocalUri as string,
                item.mediaMimeType ?? 'image/jpeg',
              ),
              item.body,
              item.replyTo,
            )
          : await sendAudioMessage(
              item.conversationId,
              await uploadVocale(item.conversationId, uid, item.audioLocalUri as string),
              item.replyTo,
            );
    // Prima rimuovo il temp, poi upserto la riga reale: mai due bolle insieme.
    useChatStore.getState().outboxRemove(tempId);
    upsertMessage(queryClient, item.conversationId, row);
    void queryClient.invalidateQueries({ queryKey: conversationsPrefix(uid) });
    // Moderazione in background (CM8): testo e caption foto, mai bloccante.
    if (item.type === 'text' || item.type === 'media') moderaMessaggio(row.id, row.body);
  } catch (e) {
    if (erroreDiRete(e)) {
      // Offline/timeout: resta pending, ripartirà alla riconnessione.
      useChatStore.getState().outboxMarkPending(tempId);
    } else {
      useChatStore.getState().outboxMarkFailed(tempId, chatErrorMessage(e));
    }
  } finally {
    inVolo.delete(tempId);
  }
}

/** Accoda un messaggio di testo e (se online) lo invia subito. `dropRef` (DM5):
 *  riferimento a un drop ("Rispondi in privato") che viaggia col messaggio. */
export function enqueueText(
  queryClient: QueryClient,
  uid: string,
  convId: string,
  body: string,
  replyTo: string | null,
  dropRef: string | null = null,
): void {
  const item: OutboxItem = {
    tempId: nuovoTempId(),
    conversationId: convId,
    type: 'text',
    body,
    audioLocalUri: null,
    audioSeconds: null,
    mediaLocalUri: null,
    mediaMimeType: null,
    replyTo,
    dropRef,
    createdAt: new Date().toISOString(),
    status: 'pending',
    errorMessage: null,
  };
  useChatStore.getState().outboxAdd(item);
  if (onlineManager.isOnline()) void attemptSend(queryClient, uid, item.tempId);
}

/** Accoda un vocale (URI locale, upload al momento dell'invio). */
export function enqueueAudio(
  queryClient: QueryClient,
  uid: string,
  convId: string,
  audioLocalUri: string,
  audioSeconds: number,
  replyTo: string | null,
): void {
  const item: OutboxItem = {
    tempId: nuovoTempId(),
    conversationId: convId,
    type: 'audio',
    body: null,
    audioLocalUri,
    audioSeconds,
    mediaLocalUri: null,
    mediaMimeType: null,
    replyTo,
    dropRef: null,
    createdAt: new Date().toISOString(),
    status: 'pending',
    errorMessage: null,
  };
  useChatStore.getState().outboxAdd(item);
  if (onlineManager.isOnline()) void attemptSend(queryClient, uid, item.tempId);
}

/** Accoda una foto (URI locale + MIME; upload al momento dell'invio, la
 *  caption opzionale viaggia in `body`). */
export function enqueueMedia(
  queryClient: QueryClient,
  uid: string,
  convId: string,
  mediaLocalUri: string,
  mediaMimeType: string,
  caption: string | null,
  replyTo: string | null,
): void {
  const item: OutboxItem = {
    tempId: nuovoTempId(),
    conversationId: convId,
    type: 'media',
    body: caption,
    audioLocalUri: null,
    audioSeconds: null,
    mediaLocalUri,
    mediaMimeType,
    replyTo,
    dropRef: null,
    createdAt: new Date().toISOString(),
    status: 'pending',
    errorMessage: null,
  };
  useChatStore.getState().outboxAdd(item);
  if (onlineManager.isOnline()) void attemptSend(queryClient, uid, item.tempId);
}

/** Riprova un item failed (torna pending e ritenta subito). */
export function retrySend(queryClient: QueryClient, uid: string, tempId: string): void {
  useChatStore.getState().outboxMarkPending(tempId);
  void attemptSend(queryClient, uid, tempId);
}

/**
 * Invia in SEQUENZA tutti i pending (ordine di enqueue = ordine dei messaggi).
 * Chiamato alla riconnessione dal flusher globale (ChatRuntime).
 */
export async function flushOutbox(queryClient: QueryClient, uid: string): Promise<void> {
  const pending = useChatStore.getState().outbox.filter((o) => o.status === 'pending');
  for (const item of pending) {
    // Sequenziale, non parallelo: preserva l'ordine percepito della chat.
    await attemptSend(queryClient, uid, item.tempId);
  }
}
