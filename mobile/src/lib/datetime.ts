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
