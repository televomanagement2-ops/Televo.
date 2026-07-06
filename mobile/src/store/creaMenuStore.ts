// =============================================================================
// creaMenuStore — visibilità del menu di creazione (S0), aperto dal + centrale.
// =============================================================================
// Il pulsante + della BottomBar NON naviga più a una schermata-frame: apre un
// bottom sheet (MenuCrea) montato una sola volta nella shell autenticata
// (decisione product owner, R-16). Store a slot singolo: MenuCrea è l'unico
// consumer in render; il + chiama open(), le voci/backdrop chiudono con close().

import { create } from 'zustand';

interface CreaMenuState {
  visible: boolean;
  open: () => void;
  close: () => void;
}

export const useCreaMenuStore = create<CreaMenuState>((set) => ({
  visible: false,
  open: () => set({ visible: true }),
  close: () => set({ visible: false }),
}));
