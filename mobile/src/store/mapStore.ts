// =============================================================================
// mapStore — stato client della Mappa della Città (M7 / MM6 + MM7).
// =============================================================================
// Due domìni nello stesso store:
//  · LA MIA presenza (MM6): la sessione di condivisione, il permesso OS, l'ultima
//    posizione nota (puntino "tu" + camera) e un eventuale problema del watcher.
//    La verità della sessione è il SERVER; questo è la fotografia locale che pilota
//    UI e watcher. Guidato dal device (posizione ESATTA per l'owner).
//  · GLI AMICI e gli EVENTI (MM7): dizionari popolati dallo snapshot (map_snapshot,
//    la verità a `server_now`) e aggiornati dai delta realtime (inbox privata). Gli
//    stati Live/Echo/LastSeen NON stanno qui: si DERIVANO dai timestamp UTC grezzi
//    con un clock calibrato (`clockOffsetMs` = server_now − Date.now(), map.md §8).
//
// Confine netto MM6↔MM7: lo snapshot NON tocca `sessione`/`myCoords` (dominio
// device-driven MM6) — aggiorna solo `clockOffsetMs`, `friends` ed `events`.

import { create } from 'zustand';
import type { Coordinate, PermessoPosizione } from '@/lib/location';
import type {
  MapEventStartedPayload,
  MapEventType,
  MapFriendRaw,
  MapPresencePayload,
  MapSnapshotRaw,
} from '@/types/supabase';

// -----------------------------------------------------------------------------
// LA MIA sessione (MM6)
// -----------------------------------------------------------------------------

/** La mia sessione di condivisione, come la conosce il client. */
export interface SessioneMappa {
  /** Fine sessione (epoch ms UTC): oltre questo istante torno "spento". */
  sharingUntil: number;
  /** L'ultimo publish è stato mascherato da una Safe Zone? */
  masked: boolean;
  /** Etichetta della zona se `masked` (es. "Casa"). */
  zoneLabel: string | null;
  /** Ultimo publish riuscito (epoch ms UTC) = "last seen at" lato server. */
  updatedAt: number | null;
}

/** Problema del runtime da mostrare in UI (es. permesso tolto a sessione attiva). */
export type ProblemaMappa = 'permesso' | 'servizi_off' | null;

// -----------------------------------------------------------------------------
// GLI AMICI e gli EVENTI (MM7) — forme NORMALIZZATE: epoch-ms UTC, camelCase. Le
// shape grezze del server (ISO, snake_case) vivono in types/supabase.ts.
// -----------------------------------------------------------------------------

/** Un amico sulla mappa. `username`/`aura*` sono null se conosco l'amico solo da un
 *  delta `presence` (che non porta identità): il refetch di arricchimento li riempie. */
export interface PuntoAmico {
  userId: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  auraScore: number | null;
  auraColor: string | null;
  lat: number;
  lng: number;
  masked: boolean;
  zoneLabel: string | null;
  updatedAt: number; //            ultimo publish (epoch ms UTC) → freshness
  sharingUntil: number; //         fine sessione dell'amico (epoch ms UTC)
  visibilityExpiresAt: number; //  updatedAt + 24h → oltre, il client lo nasconde
}

/** Un evento (stanza live/echo) sulla mappa. */
export interface PuntoEvento {
  id: string;
  userId: string;
  roomId: string | null;
  eventType: MapEventType;
  title: string | null;
  lat: number;
  lng: number;
  masked: boolean;
  zoneLabel: string | null;
  startedAt: number | null;
  endedAt: number | null; //          null = live; valorizzato = Echo
  visibilityExpiresAt: number | null; // ended_at + 12h (finestra dell'Echo)
}

const ms = (iso: string | null | undefined): number => (iso ? Date.parse(iso) : 0);

function normalizzaAmico(f: MapFriendRaw): PuntoAmico {
  return {
    userId: f.user_id,
    username: f.username,
    displayName: f.display_name,
    avatarUrl: f.avatar_url,
    auraScore: f.aura_score,
    auraColor: f.aura_color,
    lat: f.lat,
    lng: f.lng,
    masked: f.masked,
    zoneLabel: f.zone_label,
    updatedAt: ms(f.updated_at),
    sharingUntil: ms(f.sharing_until),
    visibilityExpiresAt: ms(f.visibility_expires_at),
  };
}

// -----------------------------------------------------------------------------
// Store
// -----------------------------------------------------------------------------

interface MapState {
  // Mia presenza (MM6)
  sessione: SessioneMappa | null;
  permesso: PermessoPosizione;
  myCoords: Coordinate | null;
  problema: ProblemaMappa;

  // Amici/eventi + clock (MM7)
  clockOffsetMs: number; // server_now − Date.now() (calibrazione stati/decadimenti)
  friends: Record<string, PuntoAmico>;
  events: Record<string, PuntoEvento>;

  // Azioni sessione (MM6)
  setSessione: (s: SessioneMappa | null) => void;
  aggiornaSessione: (patch: Partial<SessioneMappa>) => void;
  clearSessione: () => void;
  setPermesso: (p: PermessoPosizione) => void;
  setMyCoords: (c: Coordinate | null) => void;
  setProblema: (p: ProblemaMappa) => void;

  // Azioni amici/eventi (MM7)
  idrataSnapshot: (snap: MapSnapshotRaw) => void;
  applicaPresenza: (p: MapPresencePayload) => void;
  rimuoviAmico: (userId: string) => void;
  applicaEventoStart: (e: MapEventStartedPayload) => void;
  chiudiEvento: (id: string, endedAtMs: number, visibilityExpiresAtMs: number) => void;
  rimuoviEvento: (id: string) => void;
  resetDatiMappa: () => void; // all'unmount della mappa: svuota amici/eventi

  reset: () => void; // al logout: azzera tutto
}

export const useMapStore = create<MapState>((set) => ({
  sessione: null,
  permesso: 'undetermined',
  myCoords: null,
  problema: null,
  clockOffsetMs: 0,
  friends: {},
  events: {},

  setSessione: (sessione) => set({ sessione, problema: null }),
  aggiornaSessione: (patch) =>
    set((s) => (s.sessione ? { sessione: { ...s.sessione, ...patch } } : {})),
  clearSessione: () => set({ sessione: null }),
  setPermesso: (permesso) => set({ permesso }),
  setMyCoords: (myCoords) => set({ myCoords }),
  setProblema: (problema) => set({ problema }),

  // Lo snapshot è la VERITÀ a server_now: rimpiazza per intero i dizionari (così un
  // amico non più visibile — amicizia rimossa, sessione scaduta — sparisce al
  // refetch, map.md §11.3) e ricalibra il clock. NON tocca sessione/myCoords (MM6).
  idrataSnapshot: (snap) =>
    set(() => {
      const friends: Record<string, PuntoAmico> = {};
      for (const f of snap.friends) friends[f.user_id] = normalizzaAmico(f);
      const events: Record<string, PuntoEvento> = {};
      for (const e of snap.events) {
        events[e.id] = {
          id: e.id,
          userId: e.user_id,
          roomId: e.room_id,
          eventType: e.event_type,
          title: e.title,
          lat: e.lat,
          lng: e.lng,
          masked: e.masked,
          zoneLabel: e.zone_label,
          startedAt: ms(e.started_at),
          endedAt: e.ended_at ? ms(e.ended_at) : null,
          visibilityExpiresAt: e.visibility_expires_at ? ms(e.visibility_expires_at) : null,
        };
      }
      return { clockOffsetMs: Date.parse(snap.server_now) - Date.now(), friends, events };
    }),

  // Delta `presence` (senza identità): upsert posizione/timestamp. Se l'amico è già
  // noto ne CONSERVA l'identità (username/aura dallo snapshot); se è nuovo entra con
  // identità null (l'hook programma un refetch di arricchimento). Ignora delta stantii.
  applicaPresenza: (p) =>
    set((s) => {
      const prev = s.friends[p.user_id];
      const updatedAt = ms(p.updated_at);
      if (prev && prev.updatedAt > updatedAt) return {}; // già ho un fix più recente
      return {
        friends: {
          ...s.friends,
          [p.user_id]: {
            userId: p.user_id,
            username: prev?.username ?? null,
            displayName: prev?.displayName ?? null,
            avatarUrl: prev?.avatarUrl ?? null,
            auraScore: prev?.auraScore ?? null,
            auraColor: prev?.auraColor ?? null,
            lat: p.lat,
            lng: p.lng,
            masked: p.masked,
            zoneLabel: p.zone_label,
            updatedAt,
            sharingUntil: ms(p.sharing_until),
            visibilityExpiresAt: ms(p.visibility_expires_at),
          },
        },
      };
    }),

  rimuoviAmico: (userId) =>
    set((s) => {
      if (!s.friends[userId]) return {};
      const { [userId]: _tolto, ...resto } = s.friends;
      return { friends: resto };
    }),

  applicaEventoStart: (e) =>
    set((s) => ({
      events: {
        ...s.events,
        [e.id]: {
          id: e.id,
          userId: e.user_id,
          roomId: e.room_id,
          eventType: e.event_type,
          title: e.title,
          lat: e.lat,
          lng: e.lng,
          masked: e.masked,
          zoneLabel: e.zone_label,
          startedAt: ms(e.started_at),
          endedAt: null,
          visibilityExpiresAt: null,
        },
      },
    })),

  // Fine NATURALE della stanza → Echo: patcha solo endedAt/visibilityExpiresAt
  // dell'evento già in store (il delta `event_ended removed=false` non porta
  // posizione/titolo). Se l'evento manca (event_started perso), no-op: ci pensa il
  // refetch di arricchimento programmato dall'hook.
  chiudiEvento: (id, endedAtMs, visibilityExpiresAtMs) =>
    set((s) => {
      const prev = s.events[id];
      if (!prev) return {};
      return {
        events: {
          ...s.events,
          [id]: { ...prev, endedAt: endedAtMs, visibilityExpiresAt: visibilityExpiresAtMs },
        },
      };
    }),

  // Revoca (detach/stop/kill-switch): l'evento sparisce, niente Echo.
  rimuoviEvento: (id) =>
    set((s) => {
      if (!s.events[id]) return {};
      const { [id]: _tolto, ...resto } = s.events;
      return { events: resto };
    }),

  resetDatiMappa: () => set({ friends: {}, events: {} }),

  reset: () =>
    set({
      sessione: null,
      myCoords: null,
      problema: null,
      friends: {},
      events: {},
      clockOffsetMs: 0,
    }),
}));

// =============================================================================
// Selettori PURI — derivano gli stati dai soli timestamp UTC (map.md §2). Il "now"
// è SEMPRE calibrato su server_now: un device con orologio sballato mostra comunque
// stati e decadimenti corretti (map.md §8/§11.11).
// =============================================================================

/** Soglia di freshness "Live" per una persona (map.md §2, QA-6). */
export const FRESHNESS_MS = 10 * 60_000;

/** Cadenza del tick che ricalcola stati/decadimenti client-side senza nuovi dati
 *  (MM8): un Echo che sfuma, una sessione che scade. Su una finestra Echo di 12h
 *  è impercettibile → decadimento visivamente continuo. Condiviso da AuraLayer
 *  (ricalcolo) ed EchoBubble (durata del ramp d'opacità tra un tick e l'altro). */
export const MAP_TICK_MS = 30_000;

/** Istante corrente calibrato sul clock del server (epoch ms UTC). */
export function nowCalibrato(offsetMs: number): number {
  return Date.now() + offsetMs;
}

/** Pura: la MIA sessione è ATTIVA (mi vedono i miei amici) a un dato istante? */
export function sessioneAttiva(s: SessioneMappa | null, nowMs: number): boolean {
  return !!s && s.sharingUntil > nowMs;
}

export type StatoAmico = 'live' | 'last_seen';

/** Live = sessione ancora aperta E posizione fresca (<10min); altrimenti Last Seen. */
export function statoAmico(a: PuntoAmico, nowMs: number): StatoAmico {
  return a.sharingUntil > nowMs && a.updatedAt > nowMs - FRESHNESS_MS ? 'live' : 'last_seen';
}

/** L'amico va ancora mostrato? Oltre `visibility_expires_at` (24h) si nasconde
 *  (il cron poi cancella la riga; il client anticipa). */
export function amicoVisibile(a: PuntoAmico, nowMs: number): boolean {
  return a.visibilityExpiresAt > nowMs;
}

export type StatoEvento = 'live' | 'echo' | 'expired';

/** Live = `ended_at` nullo; Echo = finestra ancora aperta; poi expired (da nascondere). */
export function statoEvento(e: PuntoEvento, nowMs: number): StatoEvento {
  if (e.endedAt == null) return 'live';
  if (e.visibilityExpiresAt != null && e.visibilityExpiresAt > nowMs) return 'echo';
  return 'expired';
}

/**
 * Fattore di decadimento dell'Echo, 1→0 su millisecondi UTC (map.md §2, il cuore
 * visivo). `fattore = (visibility_expires_at − now) / (visibility_expires_at −
 * ended_at)`, clampato a [0,1]. Live (o dati incompleti) → 1.
 */
export function fattoreEcho(e: PuntoEvento, nowMs: number): number {
  if (e.endedAt == null || e.visibilityExpiresAt == null) return 1;
  const durata = e.visibilityExpiresAt - e.endedAt;
  if (durata <= 0) return 0;
  const f = (e.visibilityExpiresAt - nowMs) / durata;
  return Math.max(0, Math.min(1, f));
}
