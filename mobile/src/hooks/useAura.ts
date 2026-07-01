// =============================================================================
// useAura — l'Aura del profilo: anello vivo, breakdown, classifiche, prop.
// =============================================================================
// L'Aura NON è popolarità: è la qualità della presenza. `aura_score`/`aura_color`
// su `profiles` sono CACHE ricalcolate settimanalmente da recompute_aura() (cron
// del lunedì); il breakdown settimanale vive in `aura_snapshots`. Tutto in sola
// lettura lato client: l'Aura la scrive solo il backend (ledger aura_events).

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import {
  AURA_TRAIT_COLOR,
  auraColorForTrait,
  type AuraTrait,
} from '@/constants/aura';
import { isPositiveTrait } from '@/types';
import type { AuraEventType } from '@/types/supabase';
import type { AuraProfile } from '@/types';

export const auraKeys = {
  mine: (uid: string) => ['aura', uid] as const,
  history: (uid: string) => ['aura', uid, 'history'] as const,
  receivedProps: (uid: string) => ['aura', uid, 'props'] as const,
  rank: (uid: string, trait: AuraTrait) => ['aura', uid, 'rank', trait] as const,
  schoolRank: (uid: string) => ['aura', uid, 'school-rank'] as const,
};

// --- Helper: tratto dominante dal colore cache (reverse-map di vibe_color) ----
const COLOR_TO_TRAIT: Record<string, AuraTrait> = Object.entries(AURA_TRAIT_COLOR)
  .filter(([trait]) => trait !== 'chill')
  .reduce(
    (acc, [trait, color]) => {
      acc[color.toUpperCase()] = trait as AuraTrait;
      return acc;
    },
    {} as Record<string, AuraTrait>,
  );

function traitFromColor(color: string | null | undefined): AuraTrait | null {
  if (!color) return null;
  return COLOR_TO_TRAIT[color.toUpperCase()] ?? null;
}

/** Estrae il tratto col peso maggiore da un breakdown (jsonb dello snapshot). */
function dominantFromBreakdown(
  breakdown: Partial<Record<AuraTrait, number>>,
): AuraTrait | null {
  let best: AuraTrait | null = null;
  let bestVal = -Infinity;
  for (const [trait, val] of Object.entries(breakdown)) {
    if (typeof val === 'number' && val > bestVal) {
      bestVal = val;
      best = trait as AuraTrait;
    }
  }
  return best;
}

/** Normalizza il character_breakdown (jsonb) ai soli tratti positivi numerici. */
function parseBreakdown(raw: unknown): Partial<Record<AuraTrait, number>> {
  const out: Partial<Record<AuraTrait, number>> = {};
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      const num = typeof v === 'number' ? v : Number(v);
      if (Number.isFinite(num) && isPositiveTrait(k as AuraEventType)) {
        out[k as AuraTrait] = num;
      }
    }
  }
  return out;
}

// --- Aura completa del profilo proprio ---------------------------------------

/**
 * Compone l'AuraProfile: score/color dalla cache su `profiles`, breakdown e
 * tratto dominante dall'ultimo snapshot (fallback: tratto dedotto dal colore).
 */
export function useMyAura() {
  const { session } = useAuth();
  const uid = session?.user.id;

  return useQuery({
    queryKey: uid ? auraKeys.mine(uid) : ['aura', 'anon'],
    enabled: !!uid,
    queryFn: async (): Promise<AuraProfile> => {
      // 1) cache aura su profiles
      const { data: profRaw, error: e1 } = await supabase
        .from('profiles')
        .select('aura_score, aura_color')
        .eq('id', uid as string)
        .single();
      if (e1) throw e1;
      // Cast isolato: l'inferenza dei generici di postgrest-js non aggancia le
      // Row ai tipi `Database` scritti a mano (collassa a `never`) → vedi auth.ts.
      const prof = profRaw as { aura_score: number; aura_color: string | null } | null;

      // 2) ultimo snapshot per il breakdown
      const { data: snapRaw, error: e2 } = await supabase
        .from('aura_snapshots')
        .select('score, vibe_color, character_breakdown, period_start')
        .eq('user_id', uid as string)
        .order('period_start', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (e2) throw e2;
      const snap = snapRaw as { character_breakdown: unknown } | null;

      const breakdown = parseBreakdown(snap?.character_breakdown);
      const dominantTrait =
        dominantFromBreakdown(breakdown) ?? traitFromColor(prof?.aura_color);

      return {
        score: Number(prof?.aura_score ?? 0),
        dominantTrait,
        color: prof?.aura_color ?? auraColorForTrait(dominantTrait),
        breakdown,
      };
    },
  });
}

// --- Andamento storico (per il grafico in profilo/aura) ----------------------

export interface AuraHistoryPoint {
  periodStart: string;
  score: number;
  vibeColor: string;
  breakdown: Partial<Record<AuraTrait, number>>;
}

/** Snapshot settimanali ordinati dal più vecchio al più recente (per il grafico). */
export function useAuraHistory(userId: string | undefined) {
  return useQuery({
    queryKey: userId ? auraKeys.history(userId) : ['aura', 'anon', 'history'],
    enabled: !!userId,
    queryFn: async (): Promise<AuraHistoryPoint[]> => {
      const { data, error } = await supabase
        .from('aura_snapshots')
        .select('period_start, score, vibe_color, character_breakdown')
        .eq('user_id', userId as string)
        .order('period_start', { ascending: true });
      if (error) throw error;
      type SnapRow = {
        period_start: string;
        score: number;
        vibe_color: string;
        character_breakdown: unknown;
      };
      return ((data ?? []) as unknown as SnapRow[]).map((r) => ({
        periodStart: r.period_start,
        score: Number(r.score),
        vibeColor: r.vibe_color,
        breakdown: parseBreakdown(r.character_breakdown),
      }));
    },
  });
}

// --- Prop ricevuti, raggruppati per tratto -----------------------------------

/**
 * Conteggio dei prop ricevuti per ciascun tratto (alimenta PropCard e combacia
 * coi badge di carattere: welcomer 5+, humorist 10+, helper 10+, kind_soul 10+).
 */
export function useReceivedProps(userId: string | undefined) {
  return useQuery({
    queryKey: userId ? auraKeys.receivedProps(userId) : ['aura', 'anon', 'props'],
    enabled: !!userId,
    queryFn: async (): Promise<Partial<Record<AuraTrait, number>>> => {
      const { data, error } = await supabase
        .from('props')
        .select('trait')
        .eq('recipient', userId as string);
      if (error) throw error;
      const rows = (data ?? []) as unknown as { trait: AuraEventType }[];
      const counts: Partial<Record<AuraTrait, number>> = {};
      for (const row of rows) {
        if (isPositiveTrait(row.trait)) {
          counts[row.trait as AuraTrait] = (counts[row.trait as AuraTrait] ?? 0) + 1;
        }
      }
      return counts;
    },
  });
}

// --- Posizione in classifica -------------------------------------------------

export interface RankInfo {
  /** posizione 1-based; null se l'utente non è in classifica per quel tratto */
  rank: number | null;
  /** punteggio dell'utente per quel tratto (0 se assente) */
  score: number;
}

/**
 * Posizione dell'utente nella classifica per carattere. `leaderboard_character`
 * non ha un rank pre-calcolato: leggiamo il nostro score e contiamo quanti ci
 * stanno davanti (rank = #score_maggiori + 1).
 */
export function useMyRank(trait: AuraTrait) {
  const { session } = useAuth();
  const uid = session?.user.id;

  return useQuery({
    queryKey: uid ? auraKeys.rank(uid, trait) : ['aura', 'anon', 'rank', trait],
    enabled: !!uid,
    queryFn: async (): Promise<RankInfo> => {
      const { data: mineRaw, error: e1 } = await supabase
        .from('leaderboard_character')
        .select('score')
        .eq('user_id', uid as string)
        .eq('type', trait)
        .maybeSingle();
      if (e1) throw e1;
      const mine = mineRaw as { score: number } | null;
      if (!mine) return { rank: null, score: 0 };

      const myScore = Number(mine.score);
      const { count, error: e2 } = await supabase
        .from('leaderboard_character')
        .select('*', { count: 'exact', head: true })
        .eq('type', trait)
        .gt('score', myScore);
      if (e2) throw e2;
      return { rank: (count ?? 0) + 1, score: myScore };
    },
  });
}

export interface SchoolRankInfo {
  rank: number | null;
  schoolName: string | null;
}

/**
 * Posizione della scuola dell'utente nella classifica per scuola (per total_aura).
 * Richiede lo `school_id` del profilo; null se l'utente non ha una scuola.
 */
export function useSchoolRank(
  userId: string | undefined,
  schoolId: string | null | undefined,
) {
  return useQuery({
    queryKey: userId ? auraKeys.schoolRank(userId) : ['aura', 'anon', 'school-rank'],
    enabled: !!userId && !!schoolId,
    queryFn: async (): Promise<SchoolRankInfo> => {
      const { data: mineRaw, error: e1 } = await supabase
        .from('leaderboard_school')
        .select('total_aura, school_name')
        .eq('school_id', schoolId as string)
        .maybeSingle();
      if (e1) throw e1;
      const mine = mineRaw as { total_aura: number; school_name: string } | null;
      if (!mine) return { rank: null, schoolName: null };

      const myTotal = Number(mine.total_aura);
      const { count, error: e2 } = await supabase
        .from('leaderboard_school')
        .select('*', { count: 'exact', head: true })
        .gt('total_aura', myTotal);
      if (e2) throw e2;
      return { rank: (count ?? 0) + 1, schoolName: mine.school_name };
    },
  });
}
