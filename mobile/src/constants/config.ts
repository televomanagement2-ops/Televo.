// =============================================================================
// Config — costanti di configurazione dell'app (valori che cambiano al lancio).
// =============================================================================
// UNICA fonte per i link outbound (M16/AC4, classifica.md §6.3): oggi l'app non
// è negli store, quindi il link punta alla presenza web — MAI un link store
// morto in giro per i social. Al lancio si sostituisce qui con gli store link
// (o un link dinamico landing→store) senza toccare altro codice.
// ⚠️ QA-7 (classifica.md §20): il valore definitivo va confermato dal PO.

/** URL di invito nella share card e nei messaggi di condivisione esterni. */
export const INVITE_URL = 'https://televo.app';
