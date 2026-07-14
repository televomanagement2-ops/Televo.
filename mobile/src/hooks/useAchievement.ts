// =============================================================================
// useAchievement — traguardi (badge) dell'utente.
// =============================================================================
// I badge sono un layer SEPARATO dall'Aura (non ne toccano il punteggio). Lo
// sblocco è server-side (unlock_achievement via trigger): qui solo lettura.
// Mostriamo il catalogo completo, marcando quali sono sbloccati, e isoliamo il
// badge di livello Aura più alto raggiunto (aura_100/250/500) come "esclusivo".

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

export const achievementKeys = {
  mine: (uid: string) => ['achievements', uid] as const,
};

export interface AchievementView {
  key: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  unlocked: boolean;
  unlockedAt: string | null;
}

/** Le chiavi dei badge di livello Aura, dalla soglia più bassa alla più alta. */
export const AURA_LEVEL_KEYS = ['aura_100', 'aura_250', 'aura_500'] as const;

/**
 * Catalogo completo dei traguardi con lo stato di sblocco dell'utente. Un solo
 * round di query: catalogo (pubblico) + i propri user_achievements, poi merge.
 */
export function useMyAchievements() {
  const { uid } = useAuth();

  return useQuery({
    queryKey: uid ? achievementKeys.mine(uid) : ['achievements', 'anon'],
    enabled: !!uid,
    queryFn: async (): Promise<AchievementView[]> => {
      const [catalog, mine] = await Promise.all([
        supabase
          .from('achievements')
          .select('key, name, description, icon, category')
          .order('category', { ascending: true }),
        supabase
          .from('user_achievements')
          .select('achievement_key, unlocked_at')
          .eq('user_id', uid as string),
      ]);
      if (catalog.error) throw catalog.error;
      if (mine.error) throw mine.error;

      // Cast isolato: l'inferenza dei generici di postgrest-js collassa a `never`
      // coi tipi `Database` scritti a mano (vedi nota in auth.ts).
      type CatalogRow = {
        key: string;
        name: string;
        description: string;
        icon: string;
        category: string;
      };
      type MineRow = { achievement_key: string; unlocked_at: string };
      const catalogRows = (catalog.data ?? []) as unknown as CatalogRow[];
      const mineRows = (mine.data ?? []) as unknown as MineRow[];

      const unlockedMap = new Map<string, string>(
        mineRows.map((u) => [u.achievement_key, u.unlocked_at]),
      );

      return catalogRows.map((a) => ({
        key: a.key,
        name: a.name,
        description: a.description,
        icon: a.icon,
        category: a.category,
        unlocked: unlockedMap.has(a.key),
        unlockedAt: unlockedMap.get(a.key) ?? null,
      }));
    },
  });
}

/** Il badge di livello Aura più alto sbloccato (o null), dalla lista completa. */
export function highestAuraBadge(
  achievements: AchievementView[] | undefined,
): AchievementView | null {
  if (!achievements) return null;
  for (let i = AURA_LEVEL_KEYS.length - 1; i >= 0; i--) {
    const found = achievements.find((a) => a.key === AURA_LEVEL_KEYS[i] && a.unlocked);
    if (found) return found;
  }
  return null;
}
