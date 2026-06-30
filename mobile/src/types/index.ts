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
export type MessageRow = Tables['messages']['Row'];
export type DropRow = Tables['drops']['Row'];
export type PropRow = Tables['props']['Row'];
export type NotificationRow = Tables['notifications']['Row'];
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
  kind: Database['public']['Tables']['conversations']['Row']['kind'];
  title: string | null;
  lastMessage: MessageRow | null;
  unreadCount: number;
  /** per le DM: l'altro partecipante */
  peer: ProfileCard | null;
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

/** I tratti positivi (escludono i segnali negativi come toxicity/spam). */
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
