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

// =============================================================================
// Anello Aura attorno all'avatar — scala colori in funzione della percentuale.
// =============================================================================
// L'Aura v3 è una percentuale 0–100 (profiles.aura_score). L'anello attorno
// all'avatar cresce come arco e cambia colore: parte caldo (rosso), si fa
// prezioso a metà strada (oro) e al 100% diventa il viola→fucsia del marchio
// (gestito a parte con gradiente+bloom, vedi AuraAvatarRing). Caldo→prezioso→firma.

/** Fermi della scala colore dell'anello (0→90%). Il 100% usa il gradiente brand. */
export const AURA_RING_STOPS = [
  { at: 0, color: '#FF3B30' }, // rosso — appena partito
  { at: 25, color: '#FF9500' }, // arancio
  { at: 50, color: '#FFD23F' }, // giallo
  { at: 75, color: '#2EC4B6' }, // teal
  { at: 90, color: '#FFD700' }, // oro — quasi in cima
] as const;

/** Soglia (inclusa) oltre la quale l'anello usa il gradiente neon del marchio. */
export const AURA_RING_BRAND_THRESHOLD = 100;

// --- Interpolazione RGB tra due colori esadecimali --------------------------
function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (v: number) => Math.round(v).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

/**
 * Colore dell'anello per una percentuale Aura (0–100), interpolato in RGB tra i
 * fermi adiacenti. Funzione pura. Al 100% il chiamante usa comunque il gradiente
 * di marca; questo restituisce il colore "tinta unita" più vicino (l'oro/fucsia).
 */
export function auraRingColor(percent: number): string {
  const p = Math.max(0, Math.min(100, percent));
  const stops: ReadonlyArray<{ at: number; color: string }> = AURA_RING_STOPS;
  const first = stops[0] ?? { at: 0, color: '#FF3B30' };
  const last = stops[stops.length - 1] ?? first;
  if (p <= first.at) return first.color;
  if (p >= last.at) return last.color;

  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    if (a && b && p >= a.at && p <= b.at) {
      const t = (p - a.at) / (b.at - a.at);
      const [ar, ag, ab] = hexToRgb(a.color);
      const [br, bg, bb] = hexToRgb(b.color);
      return rgbToHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
    }
  }
  return last.color;
}
