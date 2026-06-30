// =============================================================================
// Aura — costanti di dominio (rispecchiano il backend, fonte di verità).
// =============================================================================
// I tratti e i colori DEVONO restare allineati a `public.vibe_color()` e
// all'enum `aura_event_type` (migrazione 160400_props_aura_v2.sql). Se cambi qui,
// cambia anche là. Il colore dell'anello deriva dal tratto DOMINANTE della
// settimana; in assenza di dati l'anello è "chill" (grigio).

/** I tratti positivi che alimentano l'Aura e le classifiche per carattere. */
export const AURA_TRAITS = [
  'kindness',
  'humor',
  'contribution',
  'welcoming',
  'consistency',
  'participation',
] as const;

export type AuraTrait = (typeof AURA_TRAITS)[number];

/** Colore dell'anello per tratto dominante — identico a vibe_color() nel DB. */
export const AURA_TRAIT_COLOR: Record<AuraTrait | 'chill', string> = {
  kindness: '#FF6B9D', // rosa caldo
  humor: '#FFD23F', // giallo
  contribution: '#3DD68C', // verde
  welcoming: '#2EC4B6', // teal
  consistency: '#4D7CFE', // blu
  participation: '#9B5DE5', // viola
  chill: '#8A8D91', // grigio — default senza tratto dominante
};

/** Etichette IT mostrate all'utente (l'app parla italiano). */
export const AURA_TRAIT_LABEL: Record<AuraTrait, string> = {
  kindness: 'Gentile',
  humor: 'Divertente',
  contribution: 'Contributo',
  welcoming: 'Accogliente',
  consistency: 'Costante',
  participation: 'Presente',
};

/**
 * Classifiche per carattere (Most Chill / Welcoming / Humor / Helpful…).
 * La materialized view `leaderboard_character` espone questi 5 tratti.
 */
export const LEADERBOARD_TRAITS = [
  'kindness',
  'consistency',
  'contribution',
  'welcoming',
  'humor',
] as const satisfies readonly AuraTrait[];

/** Nomi "di marca" delle classifiche, come da brief prodotto. */
export const LEADERBOARD_LABEL: Record<(typeof LEADERBOARD_TRAITS)[number], string> = {
  welcoming: 'Most Welcoming',
  humor: 'Best Humor',
  contribution: 'Most Helpful',
  consistency: 'Most Consistent',
  kindness: 'Most Kind',
};

/** Soglie milestone Aura che sbloccano achievement (lato backend: 100/250/500). */
export const AURA_MILESTONES = [100, 250, 500] as const;

/** Half-life del decadimento Aura, in giorni (allineato ad aura_decay()). */
export const AURA_HALF_LIFE_DAYS = 14;

/** Restituisce il colore dell'anello dato un tratto (o 'chill' di default). */
export function auraColorForTrait(trait: AuraTrait | null | undefined): string {
  return AURA_TRAIT_COLOR[trait ?? 'chill'];
}
