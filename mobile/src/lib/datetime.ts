// =============================================================================
// datetime.ts — formattazione date/ore in italiano SENZA Intl.
// =============================================================================
// Hermes (Expo Go) ha un supporto Intl parziale/incoerente su Android: formattiamo
// a mano per avere lo stesso risultato ovunque. Usato da chat (orari bolle,
// separatori data) e liste (timestamp relativi).

const MESI = [
  'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre',
];
const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];

const pad = (n: number) => String(n).padStart(2, '0');

/** Mezzanotte locale (per confronti a granularità giorno). */
function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Differenza in giorni interi tra oggi e la data (0 = oggi, 1 = ieri, …). */
function daysAgo(iso: string): number {
  return Math.round((startOfDay(new Date()) - startOfDay(new Date(iso))) / 86_400_000);
}

/** "14:32" — orario di un messaggio. */
export function timeHHmm(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Due ISO cadono nello stesso giorno locale? */
export function isSameDay(a: string, b: string): boolean {
  return startOfDay(new Date(a)) === startOfDay(new Date(b));
}

/** Etichetta separatore data: "Oggi" / "Ieri" / "3 marzo" (+ anno se diverso). */
export function dayLabel(iso: string): string {
  const diff = daysAgo(iso);
  if (diff === 0) return 'Oggi';
  if (diff === 1) return 'Ieri';
  const d = new Date(iso);
  const base = `${d.getDate()} ${MESI[d.getMonth()]}`;
  return d.getFullYear() === new Date().getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

/** Timestamp compatto per la lista chat: oggi→ora, ieri→"Ieri", <7gg→giorno, else data. */
export function hubTimestamp(iso: string): string {
  const diff = daysAgo(iso);
  if (diff === 0) return timeHHmm(iso);
  if (diff === 1) return 'Ieri';
  const d = new Date(iso);
  if (diff < 7) return (GIORNI[d.getDay()] ?? '').slice(0, 3);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}

/**
 * Tempo relativo COMPATTO per i drop (vivono ≤ 24h): "adesso" / "5 min fa" /
 * "2h fa". Il tempo lo detta il server (created_at), il client lo rende soltanto:
 * niente calcoli locali di scadenza (caso limite orologio sballato, §11.14).
 * Oltre le 24h (Ricordi) degrada a giorni, mai numeri fuorvianti.
 */
export function tempoRelativo(iso: string): string {
  const sec = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 45) return 'adesso';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min fa`;
  const ore = Math.floor(sec / 3600);
  if (ore < 24) return `${ore}h fa`;
  const giorni = Math.floor(ore / 24);
  return giorni === 1 ? 'ieri' : `${giorni}g fa`;
}

/**
 * Tempo che MANCA alla scadenza di un drop (S4 Salvati: "scade tra 3h"). Promemoria
 * esplicito dell'effimerità (D-1: il segnalibro vive quanto il drop). `expires_at`
 * è sempre il dato del server; qui lo rendiamo soltanto. Già scaduto → "in scadenza"
 * (la riga sparirà al prossimo refetch: non fingiamo un tempo negativo).
 */
export function tempoRimanente(expiresAtIso: string): string {
  const sec = Math.round((new Date(expiresAtIso).getTime() - Date.now()) / 1000);
  if (sec <= 60) return 'in scadenza';
  const min = Math.round(sec / 60);
  if (min < 60) return `scade tra ${min} min`;
  const ore = Math.floor(sec / 3600);
  return `scade tra ${ore}h`;
}
