// =============================================================================
// chatStore — stato client della chat (Zustand).
// =============================================================================
// Solo stato EFFIMERO di UI che non appartiene alla cache server (React Query):
// le bozze di testo per conversazione (così cambiando schermata non si perdono)
// e il messaggio a cui si sta rispondendo. I messaggi/conversazioni veri stanno
// in React Query (vedi useChat).

import { create } from 'zustand';
import type { MessageRow } from '@/types';

interface ChatState {
  /** Bozza di testo per conversazione (convId → testo). */
  drafts: Record<string, string>;
  /** Messaggio a cui si sta rispondendo, per conversazione. */
  replyTo: Record<string, MessageRow | null>;
  setDraft: (convId: string, text: string) => void;
  clearDraft: (convId: string) => void;
  setReplyTo: (convId: string, message: MessageRow | null) => void;
  reset: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  drafts: {},
  replyTo: {},
  setDraft: (convId, text) => set((s) => ({ drafts: { ...s.drafts, [convId]: text } })),
  clearDraft: (convId) =>
    set((s) => {
      const { [convId]: _omit, ...rest } = s.drafts;
      return { drafts: rest };
    }),
  setReplyTo: (convId, message) => set((s) => ({ replyTo: { ...s.replyTo, [convId]: message } })),
  reset: () => set({ drafts: {}, replyTo: {} }),
}));
