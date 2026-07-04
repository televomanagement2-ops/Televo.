// =============================================================================
// dialoghi — API imperativa dei popup dark (CM6.5, sostituisce Alert.alert).
// =============================================================================
// Tre primitive con la stessa ergonomia di Alert.alert (callback, niente
// Promise): `mostraMenu` (bottom sheet di azioni, "Annulla" sempre appesa dal
// host), `conferma` (card centrata per azioni distruttive/importanti) e
// `avvisa` (card centrata di errore/info con solo "OK"). Lo stato vive in uno
// store Zustand a SLOT SINGOLO letto da <DialogHost/> (montato una sola volta
// nel root layout): se una voce apre un altro dialogo in modo sincrono, lo
// slot viene rimpiazzato nello stesso tick e il Modal resta montato — niente
// modali impilati (inaffidabili su Android), niente flicker. Il tap fuori e il
// back Android chiudono SEMPRE (decisione utente). Utilizzabile fuori da React
// (onError delle mutation, lib).

import { Keyboard } from 'react-native';
import * as Haptics from 'expo-haptics';
import { create } from 'zustand';
import type { Ionicons } from '@expo/vector-icons';

/** Voce di un menu: etichetta + icona opzionale (+ variante distruttiva). */
export interface VoceMenu {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  danger?: boolean;
  /** Eseguita DOPO la chiusura, nello stesso tick: può aprire un altro dialogo. */
  onPress?: () => void;
}

interface MenuDialogo {
  kind: 'menu';
  titolo?: string;
  sottotitolo?: string;
  voci: VoceMenu[];
}

interface ConfermaDialogo {
  kind: 'conferma';
  titolo: string;
  messaggio?: string;
  confermaLabel: string;
  annullaLabel: string;
  distruttiva: boolean;
  onConferma: () => void;
}

interface AvvisoDialogo {
  kind: 'avviso';
  titolo: string;
  messaggio?: string;
  onChiudi?: () => void;
}

export type DialogoAttivo = MenuDialogo | ConfermaDialogo | AvvisoDialogo;

interface DialoghiState {
  dialogo: DialogoAttivo | null;
  apri: (dialogo: DialogoAttivo) => void;
  chiudi: () => void;
}

/** Store a slot singolo: il DialogHost è l'unico consumer in render. */
export const useDialoghiStore = create<DialoghiState>()((set) => ({
  dialogo: null,
  apri: (dialogo) => set({ dialogo }),
  chiudi: () => set({ dialogo: null }),
}));

/** Apertura comune: i menu partono spesso col composer attivo → giù la tastiera. */
function apri(dialogo: DialogoAttivo) {
  Keyboard.dismiss();
  useDialoghiStore.getState().apri(dialogo);
}

/**
 * Bottom sheet dark di azioni. "Annulla" NON si passa: la appende sempre il
 * host in coda (separatore + colore muted).
 */
export function mostraMenu(opts: { titolo?: string; sottotitolo?: string; voci: VoceMenu[] }) {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  apri({ kind: 'menu', ...opts });
}

/** Card centrata di conferma; `distruttiva` colora il bottone in danger. */
export function conferma(opts: {
  titolo: string;
  messaggio?: string;
  confermaLabel?: string;
  annullaLabel?: string;
  distruttiva?: boolean;
  onConferma: () => void;
}) {
  if (opts.distruttiva) {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  }
  apri({
    kind: 'conferma',
    titolo: opts.titolo,
    messaggio: opts.messaggio,
    confermaLabel: opts.confermaLabel ?? 'Conferma',
    annullaLabel: opts.annullaLabel ?? 'Annulla',
    distruttiva: opts.distruttiva ?? false,
    onConferma: opts.onConferma,
  });
}

/** Card centrata di errore/info con solo "OK" (niente haptics: arriva spesso da onError). */
export function avvisa(titolo: string, messaggio?: string, opts?: { onChiudi?: () => void }) {
  apri({ kind: 'avviso', titolo, messaggio, onChiudi: opts?.onChiudi });
}

/** Chiude il dialogo attivo (tap fuori, back Android, voce scelta). */
export function chiudiDialogo() {
  useDialoghiStore.getState().chiudi();
}
