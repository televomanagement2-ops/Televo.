// =============================================================================
// Drops — costanti di dominio lato client (M6). Rispecchiano il backend.
// =============================================================================
// Le reaction-tratto sono il "gesto forte" (→ prop → Aura): un sottoinsieme dei
// tratti Aura, con l'emoji e l'etichetta IT mostrate nella barra della card (S6).
// I `trait` DEVONO restare allineati al CHECK di `drop_reactions` (kindness,
// humor, welcoming, contribution). I colori riusano AURA_TRAIT_COLOR (fonte unica).

import type { DropReactionTrait } from '@/types/supabase';

/** Barra reaction-tratto: ordine, emoji e copy di S6 (long-press ♥). */
export const DROP_REACTION_TRAITS: readonly {
  trait: DropReactionTrait;
  emoji: string;
  label: string;
}[] = [
  { trait: 'kindness', emoji: '💛', label: 'Gentile' },
  { trait: 'humor', emoji: '😂', label: 'Divertente' },
  { trait: 'welcoming', emoji: '🤗', label: 'Accogliente' },
  { trait: 'contribution', emoji: '🧠', label: 'Utile' },
];

/** Emoji per tratto (lookup rapido nei contatori/indicatori della card). */
export const DROP_REACTION_EMOJI: Record<DropReactionTrait, string> = {
  kindness: '💛',
  humor: '😂',
  welcoming: '🤗',
  contribution: '🧠',
};

/**
 * Motivi di segnalazione (S6/§9): allineati a `MenuMessaggio` della chat. La UI
 * libera ("Altro" con testo) arriva con M10; qui sono le stesse quattro voci
 * passate a `file_report(target, id, motivo)`. Centralizzate perché usate sia dal
 * MenuDrop (segnala drop) sia dal menu commento (segnala commento).
 */
export const REPORT_REASONS = ['Spam', 'Contenuto offensivo', 'Bullismo', 'Altro'] as const;
