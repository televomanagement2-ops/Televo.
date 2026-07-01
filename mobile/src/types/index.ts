// =============================================================================
// Tipi di dominio dell'app — modelli "puliti" usati nei componenti/hook.
// =============================================================================
// Derivano dai Row di Supabase ma li ricompongono in forme comode per la UI
// (es. il profilo con l'Aura già pronta, una conversazione con l'ultimo
// messaggio). Tenere qui i tipi che attraversano più schermate.

import type { Database, AuraEventType } from '@/types/supabase';
import type { AuraTrait } from '@/constants/aura';

type Tables = Database['public']['Tables'];

// --- Alias diretti sui Row del DB (comodità) ---
export type ProfileRow = Tables['profiles']['Row'];
export type ConversationRow = Tables['conversations']['Row'];
export type ConversationMemberRow = Tables['conversation_members']['Row'];
export type MessageRow = Tables['messages']['Row'];
export type StreakRow = Tables['streaks']['Row'];
export type FriendshipRow = Tables['friendships']['Row'];
export type DropRow = Tables['drops']['Row'];
export type PropRow = Tables['props']['Row'];
export type NotificationRow = Tables['notifications']['Row'];
export type DeviceRow = Tables['devices']['Row'];
export type AchievementRow = Tables['achievements']['Row'];
export type AuraSnapshotRow = Tables['aura_snapshots']['Row'];
export type RoomRow = Tables['rooms']['Row'];

// --- Modelli compositi per la UI ---

/** Profilo pubblico come mostrato in lista/card (sottoinsieme leggero). */
export interface ProfileCard {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  auraScore: number;
  auraColor: string | null;
  statusText: string | null;
}

/** Aura completa di un utente, pronta per il profilo (anello + grafico). */
export interface AuraProfile {
  score: number;
  /** tratto dominante della settimana → colore dell'anello */
  dominantTrait: AuraTrait | null;
  color: string;
  /** breakdown per tratto dall'ultimo snapshot (per il grafico) */
  breakdown: Partial<Record<AuraTrait, number>>;
}

/** Voce di classifica per carattere o per scuola. */
export interface LeaderboardEntry {
  rank: number;
  profile: ProfileCard;
  trait: AuraTrait;
  score: number;
}

/** Conversazione in lista, con anteprima dell'ultimo messaggio. */
export interface ConversationPreview {
  id: string;
  type: ConversationRow['type'];
  /** titolo derivato: nome peer per DM, `name` per group/house */
  title: string | null;
  avatarUrl: string | null;
  lastMessage: MessageRow | null;
  unreadCount: number;
  /** ISO dell'ultimo aggiornamento (ordinamento lista). */
  updatedAt: string;
  /** streak attiva (giorni consecutivi) se presente. */
  streak: number | null;
  /** per le DM: l'altro partecipante */
  peer: ProfileCard | null;
  /** organizzazione per-utente (D4): silenziata (mute non scaduto). */
  muted: boolean;
  /** ISO se archiviata, altrimenti null. */
  archivedAt: string | null;
  /** ISO se fissata in cima, altrimenti null. */
  pinnedAt: string | null;
  /** ISO se "eliminata" (DM soft-hide); riappare a nuovo messaggio. */
  hiddenAt: string | null;
}

/** Un messaggio salvato (bookmark), con la conversazione d'origine, per la vista S7. */
export interface SavedMessage {
  message: MessageRow;
  conversationId: string;
  conversationTitle: string;
  savedAt: string;
}

/** Stato di una stanza live nella griglia/lista (con "energia" per la bolla). */
export interface RoomCard {
  id: string;
  title: string;
  mood: string | null;
  hostId: string;
  isPrivate: boolean;
  participantCount: number;
  /** 0..1 — quanto è "viva" la stanza, guida dimensione/glow della bolla */
  energy: number;
}

/** Riconoscimento (prop) con etichetta IT pronta. */
export interface Prop {
  id: string;
  trait: AuraTrait;
  giverId: string;
  recipientId: string;
  createdAt: string;
}

/** I tratti positivi (escludono i segnali negativi come toxicity/compulsive_use). */
export type PositiveTrait = AuraTrait;

/** Guard: distingue i tratti positivi dai segnali negativi dell'enum DB. */
export function isPositiveTrait(t: AuraEventType): t is AuraTrait {
  return (
    t === 'kindness' ||
    t === 'humor' ||
    t === 'contribution' ||
    t === 'welcoming' ||
    t === 'consistency' ||
    t === 'participation'
  );
}
