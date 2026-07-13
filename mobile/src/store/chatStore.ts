// =============================================================================
// chatStore — stato client della chat (Zustand).
// =============================================================================
// Solo stato EFFIMERO di UI che non appartiene alla cache server (React Query):
// le bozze di testo per conversazione (così cambiando schermata non si perdono),
// il messaggio a cui si sta rispondendo e l'OUTBOX dell'invio ottimistico (CM2):
// i messaggi in uscita vivono qui finché il server non li conferma (pending →
// riga reale in cache) o rifiuta (failed → Riprova/Elimina).
//
// M13/P2 (AH-4): OUTBOX e BOZZE sopravvivono alla chiusura dell'app via
// zustand/persist su MMKV (in Expo Go lo storage è un no-op → in-sessione come
// prima). Il resto dello stato (replyTo/editing/forward…) resta effimero:
// contiene MessageRow che a un riavvio sarebbero riferimenti stantii. Al flush
// post-riavvio i file locali di vocali/foto vengono verificati (lib/outbox).

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { storagePersistente } from '@/lib/persistenza';
import type { MessageRow } from '@/types';

/** Messaggio in uscita non ancora confermato dal server (invio ottimistico). */
export interface OutboxItem {
  /** Id temporaneo locale ("temp-…"): mai in collisione con gli uuid del DB. */
  tempId: string;
  conversationId: string;
  type: 'text' | 'audio' | 'media';
  /** Testo del messaggio; per le foto è la caption opzionale. */
  body: string | null;
  /** Vocale: URI locale del file registrato (upload al momento dell'invio). */
  audioLocalUri: string | null;
  /** Vocale: durata per la bolla pending. */
  audioSeconds: number | null;
  /** Foto (CM5): URI locale + MIME (upload al momento dell'invio). */
  mediaLocalUri: string | null;
  mediaMimeType: string | null;
  replyTo: string | null;
  /** Riferimento a un drop inoltrato/risposto in privato (DM5, R-08): la bolla
   *  mostra la mini-card del drop. Solo per i messaggi di testo; null altrimenti. */
  dropRef: string | null;
  /** Istante di composizione (ordina la bolla in lista). */
  createdAt: string;
  status: 'pending' | 'failed';
  /** Messaggio d'errore (mappato IT) quando failed. */
  errorMessage: string | null;
}

interface ChatState {
  /** Bozza di testo per conversazione (convId → testo). */
  drafts: Record<string, string>;
  /** Messaggio a cui si sta rispondendo, per conversazione. */
  replyTo: Record<string, MessageRow | null>;
  /** Messaggio in MODIFICA (CM4, RC-05), per conversazione. Mutuamente
   *  esclusivo con replyTo: entrare in edit annulla la risposta e viceversa. */
  editing: Record<string, MessageRow | null>;
  /** Messaggi selezionati per l'inoltro (CM4, RC-06): il picker
   *  (chat/inoltra) li legge da qui — niente id in URL. */
  forwardDraft: MessageRow[] | null;
  /** Drop selezionato per l'inoltro in chat (DM5): il picker (chat/inoltra) lo
   *  legge da qui e invia un messaggio-riferimento (drop_ref), mai una copia. */
  forwardDropRef: string | null;
  /** Riferimento a un drop "precompilato" nel composer di UNA conversazione
   *  (DM5, "Rispondi in privato"): il prossimo messaggio di testo lo porta con sé. */
  pendingDropRef: Record<string, string | null>;
  /** Coda d'invio ottimistica (tutte le conversazioni, ordine di enqueue). */
  outbox: OutboxItem[];
  setDraft: (convId: string, text: string) => void;
  clearDraft: (convId: string) => void;
  setReplyTo: (convId: string, message: MessageRow | null) => void;
  setEditing: (convId: string, message: MessageRow | null) => void;
  setForwardDraft: (messages: MessageRow[] | null) => void;
  setForwardDropRef: (dropId: string | null) => void;
  setPendingDropRef: (convId: string, dropId: string | null) => void;
  outboxAdd: (item: OutboxItem) => void;
  outboxMarkFailed: (tempId: string, errorMessage: string) => void;
  outboxMarkPending: (tempId: string) => void;
  outboxRemove: (tempId: string) => void;
  reset: () => void;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      drafts: {},
      replyTo: {},
      editing: {},
      forwardDraft: null,
      forwardDropRef: null,
      pendingDropRef: {},
      outbox: [],
      setDraft: (convId, text) => set((s) => ({ drafts: { ...s.drafts, [convId]: text } })),
      clearDraft: (convId) =>
        set((s) => {
          const { [convId]: _omit, ...rest } = s.drafts;
          return { drafts: rest };
        }),
      setReplyTo: (convId, message) =>
        set((s) => ({
          replyTo: { ...s.replyTo, [convId]: message },
          // Rispondere mentre si modifica non ha senso: l'edit si annulla.
          editing: message ? { ...s.editing, [convId]: null } : s.editing,
        })),
      setEditing: (convId, message) =>
        set((s) => ({
          editing: { ...s.editing, [convId]: message },
          replyTo: message ? { ...s.replyTo, [convId]: null } : s.replyTo,
        })),
      setForwardDraft: (messages) => set({ forwardDraft: messages }),
      setForwardDropRef: (dropId) => set({ forwardDropRef: dropId }),
      setPendingDropRef: (convId, dropId) =>
        set((s) => ({ pendingDropRef: { ...s.pendingDropRef, [convId]: dropId } })),
      outboxAdd: (item) => set((s) => ({ outbox: [...s.outbox, item] })),
      outboxMarkFailed: (tempId, errorMessage) =>
        set((s) => ({
          outbox: s.outbox.map((o) =>
            o.tempId === tempId ? { ...o, status: 'failed' as const, errorMessage } : o,
          ),
        })),
      outboxMarkPending: (tempId) =>
        set((s) => ({
          outbox: s.outbox.map((o) =>
            o.tempId === tempId ? { ...o, status: 'pending' as const, errorMessage: null } : o,
          ),
        })),
      outboxRemove: (tempId) =>
        set((s) => ({ outbox: s.outbox.filter((o) => o.tempId !== tempId) })),
      reset: () =>
        set({
          drafts: {},
          replyTo: {},
          editing: {},
          forwardDraft: null,
          forwardDropRef: null,
          pendingDropRef: {},
          outbox: [],
        }),
    }),
    {
      name: 'televo.chat',
      storage: createJSONStorage(() => storagePersistente),
      version: 1,
      // Su disco vanno SOLO coda d'invio e bozze (AH-4): il resto è effimero.
      partialize: (s) => ({ outbox: s.outbox, drafts: s.drafts }),
    },
  ),
);
