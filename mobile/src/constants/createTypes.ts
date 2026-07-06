// =============================================================================
// Create types — le voci del menu di creazione (il "+" centrale, S0).
// =============================================================================
// Il "+" della BottomBar apre un bottom sheet (MenuCrea) invece di una schermata
// (R-16, decisione product owner). In testa la sezione DROP — Foto · Audio ·
// Testo, ATTIVE (M6): scegliere una voce apre il composer (S2) col formato
// preselezionato via `?tipo=`. Sotto, le altre creazioni dei domini reali
// (CLAUDE.md §4: stanze live, props, gruppi), ancora `enabled: false` → "presto":
// quando un flusso sarà pronto basta attivarlo qui. NB: niente "Reel".

import type { Ionicons } from '@expo/vector-icons';
import type { DropComposerTipo } from '@/store/dropStore';

export interface CreateType {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  /** false = non ancora attivabile (mostra "presto"). */
  enabled: boolean;
  /** Presente solo sulle voci Drop: il formato passato al composer (?tipo=). */
  dropTipo?: DropComposerTipo;
}

/** Sezione DROP: i tre formati del post effimero, attivi in M6. */
export const CREATE_DROPS: readonly CreateType[] = [
  {
    key: 'drop-foto',
    icon: 'camera-outline',
    title: 'Foto',
    subtitle: 'Un momento vero, sparisce in 24h',
    enabled: true,
    dropTipo: 'foto',
  },
  {
    key: 'drop-audio',
    icon: 'mic-outline',
    title: 'Audio',
    subtitle: "Di' la tua con la voce",
    enabled: true,
    dropTipo: 'audio',
  },
  {
    key: 'drop-testo',
    icon: 'create-outline',
    title: 'Testo',
    subtitle: 'Un pensiero al volo',
    enabled: true,
    dropTipo: 'testo',
  },
];

/** Sezione ALTRO: le creazioni non ancora costruite (badge "presto"). */
export const CREATE_ALTRO: readonly CreateType[] = [
  {
    key: 'live',
    icon: 'radio-outline',
    title: 'Stanza Live',
    subtitle: 'Apri una stanza audio dal vivo',
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
    subtitle: 'Crea una conversazione di gruppo',
    enabled: false,
  },
];
