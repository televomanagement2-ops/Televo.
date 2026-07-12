// =============================================================================
// Feed — categorie della Home. Singola fonte di verità per label e stato.
// =============================================================================
// La Home ha una barra di categorie: "Discover" (mix di tutto, default) + le
// verticali. ATTENZIONE allo stato `backed`: nel backend esistono dati SOLO per
// drops/live/mappa/aura. NON esiste "sport" (nessuna tabella dedicata):
// resta visibile ma in stato "Prossimamente" finché non avrà un backend.
// Drops (M6), Map (M7) e Live (M12/LM7) sono COLLEGATE ai dati reali; "aura"
// arriverà in un round successivo; "discover" mostra ancora un mix di card
// placeholder (vedi constants/feedItems.ts).
// NB: "Reels" è stato RIMOSSO — il concept dell'app non lo contempla.

export type FeedCategoryKey = 'discover' | 'drops' | 'live' | 'map' | 'aura' | 'sport';

export interface FeedCategory {
  key: FeedCategoryKey;
  label: string;
  /** true = avrà contenuto reale dal DB (per ora scheletro); false = "presto". */
  backed: boolean;
}

/** Ordine canonico mostrato nella barra (Discover sempre primo e di default). */
export const FEED_CATEGORIES: readonly FeedCategory[] = [
  { key: 'discover', label: 'Discover', backed: true },
  { key: 'drops', label: 'Drops', backed: true },
  { key: 'live', label: 'Live', backed: true },
  { key: 'map', label: 'Map', backed: true },
  { key: 'aura', label: 'Aura', backed: true },
  { key: 'sport', label: 'Sport', backed: false },
] as const;

/** Categoria selezionata all'apertura della Home. */
export const DEFAULT_FEED_CATEGORY: FeedCategoryKey = 'discover';
