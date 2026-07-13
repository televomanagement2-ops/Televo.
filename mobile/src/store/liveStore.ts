// =============================================================================
// liveStore — stato client del dominio Live (M12 / LM5).
// =============================================================================
// Le live ATTIVE degli amici (striscia + feed verticale della Home, LM7),
// indicizzate per id, con l'ORDINE deciso dal server (lives_feed: Top Friends →
// spettatori reali → Aura host — i contatori ordinano senza essere esposti).
//
// Stesso modello a due sorgenti della mappa (M7 §13.3): lo SNAPSHOT
// (`lives_feed`) è la VERITÀ a `server_now` e rimpiazza per intero dizionario e
// ordine; i DELTA dell'inbox privata (`live_started`/`live_status`/`live_ended`)
// patchano tra un refetch e l'altro. A differenza dei delta mappa,
// `live_started` porta l'identità dell'host → niente refetch di arricchimento;
// il ranking esatto di una live arrivata via delta lo sistema il prossimo
// snapshot (in testa nel frattempo: è la novità che l'utente deve vedere).
//
// Qui NON vive lo stato della live che sto guardando/trasmettendo (quello è di
// LiveKit + live_detail, schermo /live/[id] in LM6): solo la fotografia "chi
// dei miei amici è in diretta ORA" che alimenta striscia, feed e badge.

import { create } from 'zustand';
import type { CursoreLiveFeed } from '@/lib/live';
import type {
  LiveFeedItemRaw,
  LivesFeedRaw,
  LiveStartedPayload,
  LiveStatus,
  LiveStatusPayload,
  LiveVisibility,
} from '@/types/supabase';

// -----------------------------------------------------------------------------
// Forme NORMALIZZATE: epoch-ms UTC, camelCase (le shape grezze ISO/snake_case
// vivono in types/supabase.ts, pattern mapStore).
// -----------------------------------------------------------------------------

/** L'identità dell'host di una live nel feed. */
export interface HostLive {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  auraScore: number | null;
  auraColor: string | null;
}

/** Una live attiva di un amico (mai la propria: lives_feed la esclude). */
export interface LiveAmico {
  liveId: string;
  title: string;
  status: LiveStatus; // 'live' | 'paused' (una 'ended' viene rimossa, mai tenuta)
  visibility: LiveVisibility;
  commentsEnabled: boolean;
  startedAt: number; //      epoch ms UTC
  pausedAt: number | null;
  isTopFriend: boolean; //   dal solo snapshot (i delta non lo portano → false)
  host: HostLive;
}

const ms = (iso: string | null | undefined): number => (iso ? Date.parse(iso) : 0);

function normalizzaLive(raw: LiveFeedItemRaw): LiveAmico {
  return {
    liveId: raw.live_id,
    title: raw.title,
    status: raw.status,
    visibility: raw.visibility,
    commentsEnabled: raw.comments_enabled,
    startedAt: ms(raw.started_at),
    pausedAt: raw.paused_at ? ms(raw.paused_at) : null,
    isTopFriend: raw.is_top_friend,
    host: {
      userId: raw.host.user_id,
      username: raw.host.username,
      displayName: raw.host.display_name,
      avatarUrl: raw.host.avatar_url,
      auraScore: raw.host.aura_score,
      auraColor: raw.host.aura_color,
    },
  };
}

// -----------------------------------------------------------------------------
// Store
// -----------------------------------------------------------------------------

interface LiveState {
  /** Live attive per id. */
  lives: Record<string, LiveAmico>;
  /** Ordine del feed (id): dal server allo snapshot; i delta prependono. */
  ordine: string[];
  /** server_now − Date.now() (clock calibrato, condiviso dalle superfici live). */
  clockOffsetMs: number;
  /** M13/P8: esiste una pagina successiva sul server (lives_feed keyset). */
  hasMore: boolean;
  /** M13/P8: cursore della prossima pagina, derivato dall'ULTIMA riga RAW
   *  ricevuta (started_at ISO verbatim: la precisione è parte del cursore). */
  cursore: CursoreLiveFeed | null;

  /** Lo snapshot è la verità: rimpiazza dizionario e ordine, ricalibra il clock.
   *  Un refetch della prima pagina RESETTA la paginazione (le pagine caricate
   *  oltre la prima si ricaricano scorrendo: il feed è contenuto deperibile). */
  idrataFeed: (snap: LivesFeedRaw) => void;
  /** M13/P8: append di una pagina successiva (dedup sugli id già presenti —
   *  una live prepesa via delta può ricomparire in una pagina più giù). */
  appendFeed: (snap: LivesFeedRaw) => void;
  /** Delta live_started: upsert in testa (il ranking vero arriva col prossimo snapshot). */
  applicaLiveStarted: (p: LiveStartedPayload) => void;
  /** Delta live_status (live↔paused): patch della live già nota; ignoto = no-op
   *  (l'hook riconcilia dallo snapshot). */
  applicaLiveStatus: (p: LiveStatusPayload) => void;
  /** Delta live_ended (o force-end scoperto altrove): la live SPARISCE — le live
   *  finite non hanno archivio né echo nel feed. */
  rimuoviLive: (liveId: string) => void;
  /** All'unmount della superficie live: svuota (il prossimo mount rifetcha). */
  resetDatiLive: () => void;

  reset: () => void; // al logout
}

/** Cursore keyset dall'ultima riga RAW di una pagina (null = pagina vuota). */
function cursoreDaPagina(snap: LivesFeedRaw): CursoreLiveFeed | null {
  const ultima = snap.lives[snap.lives.length - 1];
  if (!ultima) return null;
  return {
    top: ultima.is_top_friend,
    before: ultima.started_at,
    beforeId: ultima.live_id,
  };
}

export const useLiveStore = create<LiveState>((set) => ({
  lives: {},
  ordine: [],
  clockOffsetMs: 0,
  hasMore: false,
  cursore: null,

  idrataFeed: (snap) =>
    set(() => {
      const lives: Record<string, LiveAmico> = {};
      const ordine: string[] = [];
      for (const raw of snap.lives) {
        lives[raw.live_id] = normalizzaLive(raw);
        ordine.push(raw.live_id);
      }
      return {
        lives,
        ordine,
        clockOffsetMs: Date.parse(snap.server_now) - Date.now(),
        hasMore: snap.has_more,
        cursore: cursoreDaPagina(snap),
      };
    }),

  appendFeed: (snap) =>
    set((s) => {
      const lives = { ...s.lives };
      const ordine = [...s.ordine];
      for (const raw of snap.lives) {
        if (!lives[raw.live_id]) ordine.push(raw.live_id);
        lives[raw.live_id] = normalizzaLive(raw);
      }
      return {
        lives,
        ordine,
        hasMore: snap.has_more,
        // Il cursore avanza SEMPRE all'ultima riga della pagina server (anche
        // se dedupata in lista): la prossima pagina riparte da lì.
        cursore: cursoreDaPagina(snap) ?? s.cursore,
      };
    }),

  applicaLiveStarted: (p) =>
    set((s) => {
      const nota = s.lives[p.live_id];
      return {
        lives: {
          ...s.lives,
          [p.live_id]: {
            liveId: p.live_id,
            title: p.title,
            status: p.status,
            visibility: p.visibility,
            // I delta non portano comments_enabled/is_top_friend: default
            // prudenti se la live è nuova, conservati se già nota (riavvio raro).
            commentsEnabled: nota?.commentsEnabled ?? true,
            startedAt: ms(p.started_at),
            pausedAt: null,
            isTopFriend: nota?.isTopFriend ?? false,
            host: {
              userId: p.host.user_id,
              username: p.host.username,
              displayName: p.host.display_name,
              avatarUrl: p.host.avatar_url,
              auraScore: p.host.aura_score,
              auraColor: p.host.aura_color,
            },
          },
        },
        ordine: [p.live_id, ...s.ordine.filter((id) => id !== p.live_id)],
      };
    }),

  applicaLiveStatus: (p) =>
    set((s) => {
      const nota = s.lives[p.live_id];
      if (!nota || p.status === 'ended') return {}; // 'ended' viaggia su live_ended
      return {
        lives: {
          ...s.lives,
          [p.live_id]: {
            ...nota,
            status: p.status,
            // Il payload non porta paused_at: per il "in pausa da..." basta il
            // clock calibrato all'arrivo del delta (lo snapshot poi riallinea).
            pausedAt: p.status === 'paused' ? Date.now() + s.clockOffsetMs : null,
          },
        },
      };
    }),

  rimuoviLive: (liveId) =>
    set((s) => {
      if (!s.lives[liveId]) return {};
      const { [liveId]: _tolta, ...resto } = s.lives;
      return { lives: resto, ordine: s.ordine.filter((id) => id !== liveId) };
    }),

  resetDatiLive: () => set({ lives: {}, ordine: [], hasMore: false, cursore: null }),

  reset: () =>
    set({ lives: {}, ordine: [], clockOffsetMs: 0, hasMore: false, cursore: null }),
}));

// =============================================================================
// Selettori PURI (pattern mapStore: il "now" è sempre calibrato su server_now).
// =============================================================================

/** Le live nell'ordine del feed (server-side; i delta prependono le novità). */
export function livesOrdinate(s: Pick<LiveState, 'lives' | 'ordine'>): LiveAmico[] {
  const out: LiveAmico[] = [];
  for (const id of s.ordine) {
    const l = s.lives[id];
    if (l) out.push(l);
  }
  return out;
}

/** La live attiva di un dato amico (unique parziale a DB: al più una). */
export function liveDiHost(
  s: Pick<LiveState, 'lives' | 'ordine'>,
  hostId: string,
): LiveAmico | null {
  for (const id of s.ordine) {
    const l = s.lives[id];
    if (l && l.host.userId === hostId) return l;
  }
  return null;
}
