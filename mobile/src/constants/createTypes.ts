// =============================================================================
// Create types — i tipi di contenuto CREABILI dall'app (il menu del "+").
// =============================================================================
// Il "+" centrale è il punto d'accesso alla creazione. Qui c'è la STRUTTURA di
// tutto ciò che si potrà creare, derivata dai domini reali del backend
// (CLAUDE.md §4: drops, rooms/stanze live, messages text/audio/voice_thread,
// props, conversations dm/group/house). Per ora è solo il frame: ogni tipo è
// `enabled: false` → stato "presto". Quando un flusso sarà pronto basta metterlo
// `enabled: true` e dargli una rotta, senza toccare la schermata. NB: niente
// "Reel" — il concept dell'app non lo contempla.

import type { Ionicons } from '@expo/vector-icons';

export interface CreateType {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  /** false = non ancora attivabile (mostra "presto"). */
  enabled: boolean;
}

/** Ordine canonico mostrato nella schermata Crea. */
export const CREATE_TYPES: readonly CreateType[] = [
  {
    key: 'drop',
    icon: 'flash-outline',
    title: 'Drop',
    subtitle: 'Un momento effimero, sparisce in 24 ore',
    enabled: false,
  },
  {
    key: 'live',
    icon: 'radio-outline',
    title: 'Stanza Live',
    subtitle: 'Apri una stanza audio dal vivo',
    enabled: false,
  },
  {
    key: 'media',
    icon: 'image-outline',
    title: 'Media',
    subtitle: 'Condividi una foto o un media',
    enabled: false,
  },
  {
    key: 'voice',
    icon: 'mic-outline',
    title: 'Nota vocale',
    subtitle: 'Un messaggio audio o un thread vocale',
    enabled: false,
  },
  {
    key: 'prop',
    icon: 'sparkles-outline',
    title: 'Dai Aura',
    subtitle: 'Riconosci qualcuno: gentile, divertente, accogliente, utile',
    enabled: false,
  },
  {
    key: 'group',
    icon: 'people-outline',
    title: 'Gruppo',
    subtitle: 'Crea una conversazione di gruppo o una stanza-casa',
    enabled: false,
  },
];
