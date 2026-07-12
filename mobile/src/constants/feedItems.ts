// =============================================================================
// Feed items — dati STATICI del feed "Discover" (mix di tutte le categorie).
// =============================================================================
// "Discover" è il cuore della Home: NON una sola categoria, ma un mix di tutti i
// tipi di contenuto dell'app (drop effimeri, stanze live, mappa vibe, aura,
// sport). Per ora i contenuti sono SEGNAPOSTO: nessuna query reale, area media
// grigia. Le card si differenziano per `kind` (icona/etichetta/accento). Quando
// colleghiamo i dati veri (round successivi) questo file diventa la forma-target
// verso cui mappare le query (drops, rooms, vibe_map, aura_*).

import type { Ionicons } from '@expo/vector-icons';
import { colors } from './theme';

/** I tipi di contenuto che possono comparire nel feed Discover. */
export type FeedKind = 'drop' | 'live' | 'map' | 'aura' | 'sport';

/** Una card del feed (forma neutra, indipendente dal tipo). */
export interface FeedItem {
  id: string;
  kind: FeedKind;
  username: string;
  avatarUrl?: string | null;
  /** badge "verificato" (checkmark viola) accanto al nome */
  verified: boolean;
  /** tempo relativo già formattato, es. "2h fa" */
  timeAgo: string;
  caption: string;
  /** hashtag reso in viola sotto la caption, es. "#discover" */
  hashtag: string;
  /** tag musicale opzionale, es. "Skrillex • Leaving" */
  music?: string;
  /** conteggi già formattati (placeholder, niente logica) */
  likes: string;
  comments: string;
  shares: string;
  /** numero di "pagine" per i dot di paginazione del media */
  pages: number;
}

/** Meta per tipo: come si presenta il chip sul media (etichetta/icona/accento). */
export const FEED_KIND_META: Record<
  FeedKind,
  { label: string; icon: keyof typeof Ionicons.glyphMap; accent: string }
> = {
  drop: { label: 'Drop', icon: 'flash-outline', accent: colors.accent },
  live: { label: 'Live', icon: 'radio-outline', accent: colors.danger },
  map: { label: 'Map', icon: 'map-outline', accent: colors.accentSoft },
  aura: { label: 'Aura', icon: 'sparkles-outline', accent: colors.accent },
  sport: { label: 'Sport', icon: 'football-outline', accent: colors.success },
};

/** Contenuti finti del feed: coprono tutti i kind (il primo è il "void.exe"). */
export const FEED_ITEMS: readonly FeedItem[] = [
  {
    id: 'f1',
    kind: 'drop',
    username: 'void.exe',
    verified: true,
    timeAgo: '2h fa',
    caption: 'Frammenti di qualcosa di più grande.',
    hashtag: '#discover',
    music: 'Skrillex • Leaving',
    likes: '12.4K',
    comments: '342',
    shares: '120',
    pages: 6,
  },
  {
    id: 'f2',
    kind: 'aura',
    username: 'mira.k',
    verified: false,
    timeAgo: '4h fa',
    caption: 'Settimana gentile. L’anello si scalda. 🌅',
    hashtag: '#aura',
    music: 'Bonobo • Kerala',
    likes: '3.1K',
    comments: '88',
    shares: '24',
    pages: 3,
  },
  {
    id: 'f3',
    kind: 'live',
    username: 'terni.nightclub',
    verified: true,
    timeAgo: 'ora',
    caption: 'Si scalda la stanza, sali sul palco.',
    hashtag: '#live',
    likes: '920',
    comments: '210',
    shares: '47',
    pages: 1,
  },
  {
    id: 'f4',
    kind: 'map',
    username: 'leo_',
    verified: false,
    timeAgo: '1h fa',
    caption: 'Vibe in centro stasera, chi c’è?',
    hashtag: '#mappa',
    music: 'Fred again.. • Delilah',
    likes: '1.7K',
    comments: '63',
    shares: '15',
    pages: 4,
  },
  {
    id: 'f5',
    kind: 'sport',
    username: 'ternana.curva',
    verified: true,
    timeAgo: '6h fa',
    caption: 'Che gol all’ultimo minuto. 🔥',
    hashtag: '#sport',
    likes: '8.9K',
    comments: '540',
    shares: '301',
    pages: 5,
  },
];
