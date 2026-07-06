// =============================================================================
// dropStore — stato client del dominio Drops (Zustand).
// =============================================================================
// Solo stato EFFIMERO che non appartiene alla cache server (React Query):
//  · l'OUTBOX di pubblicazione ottimistica (RC-01, specchio dell'outbox chat):
//    i drop in uscita vivono qui finché il server non li conferma (pending →
//    rimosso + feed invalidata) o li rifiuta (failed → Riprova/Elimina).
//  · le BOZZE del composer per formato, così chiudere per sbaglio la schermata
//    non perde il testo/la didascalia (S2 §4).
// Coda IN-SESSIONE: la persistenza su disco è un non-obiettivo (come in chat).

import { create } from 'zustand';
import type { DropType } from '@/types/supabase';

/** Formato scelto nel composer (param ?tipo=), mappato su DropType al momento
 *  dell'insert: foto→media, audio→audio, testo→text. */
export type DropComposerTipo = 'foto' | 'audio' | 'testo';

/** Bersaglio della risposta nel dettaglio (S3): un commento top-level + il nome
 *  dell'autore (per la barra "Rispondi a…"). Reply a 1 livello soltanto (R-07). */
export interface CommentReplyTarget {
  id: string;
  authorName: string;
}

/** Commento in uscita non ancora confermato dal server (invio ottimistico DM3).
 *  Specchio di OutboxItem chat: id temporaneo ("temp-"), non l'id definitivo. */
export interface DropCommentOutboxItem {
  tempId: string;
  dropId: string;
  /** Reply a un commento top-level (null = commento di primo livello). */
  parentId: string | null;
  type: 'text' | 'audio';
  body: string | null;
  audioLocalUri: string | null;
  audioSeconds: number | null;
  createdAt: string;
  status: 'pending' | 'failed';
  errorMessage: string | null;
}

/** Drop in uscita non ancora confermato dal server (pubblicazione ottimistica). */
export interface DropOutboxItem {
  /** ID REALE del drop (uuid), generato dal client (R-03): usato nel path dei
   *  file e nell'insert. NON un "temp-": è già l'id definitivo. */
  dropId: string;
  type: DropType;
  /** Testo del drop (type text) o didascalia opzionale (media/audio). */
  body: string | null;
  /** Vocale: URI locale del file registrato (upload al momento dell'invio). */
  audioLocalUri: string | null;
  audioSeconds: number | null;
  /** Foto: URI locale + MIME (upload al momento dell'invio). */
  mediaLocalUri: string | null;
  mediaMimeType: string | null;
  /** Istante di composizione (ordina la card ottimistica nel feed, DM2). */
  createdAt: string;
  status: 'pending' | 'failed';
  /** Messaggio d'errore (mappato IT) quando failed. */
  errorMessage: string | null;
}

interface DropState {
  /** Coda di pubblicazione ottimistica (ordine di enqueue). */
  outbox: DropOutboxItem[];
  /** Bozza di testo/didascalia per formato del composer. */
  bozze: Record<DropComposerTipo, string>;
  // --- Commenti del dettaglio (S3, DM3) ---
  /** Bozza del composer commenti per drop (dropId → testo). */
  commentDrafts: Record<string, string>;
  /** Commento a cui si sta rispondendo, per drop. */
  commentReplyTo: Record<string, CommentReplyTarget | null>;
  /** Coda d'invio ottimistica dei commenti (tutti i drop, ordine di enqueue). */
  commentOutbox: DropCommentOutboxItem[];
  outboxAdd: (item: DropOutboxItem) => void;
  outboxMarkFailed: (dropId: string, errorMessage: string) => void;
  outboxMarkPending: (dropId: string) => void;
  outboxRemove: (dropId: string) => void;
  setBozza: (tipo: DropComposerTipo, text: string) => void;
  clearBozza: (tipo: DropComposerTipo) => void;
  setCommentDraft: (dropId: string, text: string) => void;
  clearCommentDraft: (dropId: string) => void;
  setCommentReplyTo: (dropId: string, target: CommentReplyTarget | null) => void;
  commentOutboxAdd: (item: DropCommentOutboxItem) => void;
  commentOutboxMarkFailed: (tempId: string, errorMessage: string) => void;
  commentOutboxMarkPending: (tempId: string) => void;
  commentOutboxRemove: (tempId: string) => void;
  reset: () => void;
}

const BOZZE_VUOTE: Record<DropComposerTipo, string> = { foto: '', audio: '', testo: '' };

export const useDropStore = create<DropState>((set) => ({
  outbox: [],
  bozze: { ...BOZZE_VUOTE },
  commentDrafts: {},
  commentReplyTo: {},
  commentOutbox: [],
  outboxAdd: (item) => set((s) => ({ outbox: [...s.outbox, item] })),
  outboxMarkFailed: (dropId, errorMessage) =>
    set((s) => ({
      outbox: s.outbox.map((o) =>
        o.dropId === dropId ? { ...o, status: 'failed' as const, errorMessage } : o,
      ),
    })),
  outboxMarkPending: (dropId) =>
    set((s) => ({
      outbox: s.outbox.map((o) =>
        o.dropId === dropId ? { ...o, status: 'pending' as const, errorMessage: null } : o,
      ),
    })),
  outboxRemove: (dropId) => set((s) => ({ outbox: s.outbox.filter((o) => o.dropId !== dropId) })),
  setBozza: (tipo, text) => set((s) => ({ bozze: { ...s.bozze, [tipo]: text } })),
  clearBozza: (tipo) => set((s) => ({ bozze: { ...s.bozze, [tipo]: '' } })),
  setCommentDraft: (dropId, text) =>
    set((s) => ({ commentDrafts: { ...s.commentDrafts, [dropId]: text } })),
  clearCommentDraft: (dropId) =>
    set((s) => {
      const { [dropId]: _omit, ...rest } = s.commentDrafts;
      return { commentDrafts: rest };
    }),
  setCommentReplyTo: (dropId, target) =>
    set((s) => ({ commentReplyTo: { ...s.commentReplyTo, [dropId]: target } })),
  commentOutboxAdd: (item) => set((s) => ({ commentOutbox: [...s.commentOutbox, item] })),
  commentOutboxMarkFailed: (tempId, errorMessage) =>
    set((s) => ({
      commentOutbox: s.commentOutbox.map((o) =>
        o.tempId === tempId ? { ...o, status: 'failed' as const, errorMessage } : o,
      ),
    })),
  commentOutboxMarkPending: (tempId) =>
    set((s) => ({
      commentOutbox: s.commentOutbox.map((o) =>
        o.tempId === tempId ? { ...o, status: 'pending' as const, errorMessage: null } : o,
      ),
    })),
  commentOutboxRemove: (tempId) =>
    set((s) => ({ commentOutbox: s.commentOutbox.filter((o) => o.tempId !== tempId) })),
  reset: () =>
    set({
      outbox: [],
      bozze: { ...BOZZE_VUOTE },
      commentDrafts: {},
      commentReplyTo: {},
      commentOutbox: [],
    }),
}));
