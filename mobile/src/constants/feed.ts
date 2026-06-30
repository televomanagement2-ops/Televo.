// =============================================================================
// Feed — categorie della Home. Singola fonte di verità per label e stato.
// =============================================================================
// La Home ha una barra di categorie: "Discover" (mix di tutto, default) + le
// verticali. ATTENZIONE allo stato `backed`: nel backend esistono dati SOLO per
// drops/stanze live/mappa/aura. NON esistono "reels" né "sport" (nessuna tabella
// video/sport): quelle categorie restano visibili ma in stato "Prossimamente"
// finché non avranno un backend dedicato. `discover/live/map/aura` avranno dati
// reali (collegati nei round M3/M4/M7); per ora il corpo del feed è scheletro.

export type FeedCategoryKey = 'discover' | 'reels' | 'live' | 'map' | 'aura' | 'sport';

export interface FeedCategory {
  key: FeedCategoryKey;
  label: string;
  /** true = avrà contenuto reale dal DB (per ora scheletro); false = "presto". */
  backed: boolean;
}

/** Ordine canonico mostrato nella barra (Discover sempre primo e di default). */
export const FEED_CATEGORIES: readonly FeedCategory[] = [
  { key: 'discover', label: 'Discover', backed: true },
  { key: 'reels', label: 'Reels', backed: false },
  { key: 'live', label: 'Live', backed: true },
  { key: 'map', label: 'Mappa', backed: true },
  { key: 'aura', label: 'Aura', backed: true },
  { key: 'sport', label: 'Sport', backed: false },
] as const;

/** Categoria selezionata all'apertura della Home. */
export const DEFAULT_FEED_CATEGORY: FeedCategoryKey = 'discover';
