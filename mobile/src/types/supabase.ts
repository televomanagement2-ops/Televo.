// =============================================================================
// Tipi del Database Supabase — Televo.
// =============================================================================
// ⚠️ MANTENUTO A MANO (per ora). La generazione automatica
// (`npm run types:supabase`) richiede privilegi management API che l'account
// attuale non ha ancora. Quando saranno disponibili, RIGENERARE questo file e
// rimuovere questa nota. Nel frattempo copre le tabelle/RPC realmente usate dal
// client, fedeli alle migrazioni in supabase/migrations/.
//
// Convenzione: Row = come leggi, Insert = cosa puoi inserire (le colonne di
// sistema sono forzate dai trigger *_before_* lato DB, quindi qui sono opzionali
// o omesse), Update = cosa l'utente può modificare (solo le colonne con GRANT).

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// --- Enum di dominio (allineati al DB) ---
export type AuraEventType =
  | 'kindness'
  | 'humor'
  | 'contribution'
  | 'welcoming'
  | 'consistency'
  | 'participation'
  | 'toxicity'
  | 'compulsive_use';

export type ConversationType = 'dm' | 'group' | 'house';
export type ConversationRole = 'admin' | 'member';
export type MessageType = 'text' | 'audio' | 'voice_thread' | 'media';
export type NotificationType =
  | 'friend_request'
  | 'friend_accepted'
  | 'message'
  | 'prop'
  | 'achievement'
  | 'aura_upgrade' // Aura v3: crescita significativa (>= +5%)
  | 'aura_downgrade' // Aura v3: calo da penalità (mai da sola inattività)
  | 'drop_comment' // M6: commento/reply su un mio drop
  | 'drop_prompt' // DM7: "tema del giorno" (§16.2, notifica broadcast dosata)
  | 'live_started' // M12: un amico ha avviato una live (default TUTTI, L-4)
  | 'live_cohost_invite' // M12: invito co-host
  | 'new_login' // M13/P6: nuovo accesso al tuo account (Edge login-alert)
  | 'aura_podio' // M16/AC1: sei entrato nel podio (ieri rank >3, oggi <=3)
  | 'aura_sorpasso' // M16/AC1: un amico ANONIMO ti ha superato (solo ex-podio, AC-4)
  | 'aura_recap'; // M16/AC1: recap settimanale della classifica (broadcast dosato)
export type ModerationTarget =
  | 'user'
  | 'room'
  | 'message'
  | 'drop'
  | 'drop_comment'
  | 'live' // M12: report sulla live (→ host principale)
  | 'live_comment'; // M12: report sul singolo commento (→ autore)
export type DropType = 'text' | 'audio' | 'media';
// M6 (R-02, D-3): la "scuola" esce dal progetto → i drop sono SOLO friends.
// La colonna resta a DB come punto di estensione (futuro 'circle').
export type DropAudience = 'friends';
// Le reaction-tratto (gesto forte → prop → Aura): sottoinsieme di AuraEventType.
export type DropReactionTrait = 'kindness' | 'humor' | 'welcoming' | 'contribution';
export type FriendshipStatus = 'pending' | 'accepted' | 'blocked';
// M7 (MM0) — tipo di evento georiferito sulla Mappa. M12 (LM0) aggiunge il
// badge LIVE degli amici (attach/detach in LM1).
export type MapEventType = 'room_live' | 'live_broadcast';
// M12 (LM0) — Live: broadcast video personale solo-amici (docs/live/live.md).
// Stati espliciti a DB (mai inferenza client); i toggle fotografano l'avvio.
export type LiveStatus = 'live' | 'paused' | 'ended';
export type LiveVisibility = 'all_friends' | 'top_friends';
export type LiveNotifyMode = 'none' | 'top_friends' | 'all';
export type LiveHostRole = 'host' | 'cohost';
export type LiveHostStatus = 'invited' | 'active' | 'left' | 'removed';

// =============================================================================
// M7 (MM2/MM3) — Mappa v2: shape GREZZE restituite dal server (snapshot + delta
// realtime). Timestamp UTC come stringhe ISO; il client li normalizza a epoch-ms
// e deriva gli stati Live/Echo/LastSeen con un clock calibrato su `server_now`
// (map.md §2/§8). Il server restituisce FATTI, mai stati. Fedeli ai payload delle
// migrazioni 20260707140000_map_rooms_snapshot.sql e 20260707150000_map_realtime.sql.
// =============================================================================

/** Una Safe Zone dell'utente (solo nella propria vista: l'amico ne vede la maschera). */
export interface MapZoneRaw {
  id: string;
  label: string;
  radius_m: number;
  lat: number;
  lng: number;
}

/** `me` nello snapshot: stato della PROPRIA sessione + zone. Campi assenti finché
 *  non ho mai condiviso (sharing_until null). lat/lng possono essere null (nessun fix). */
export interface MapMeRaw {
  user_id: string;
  sharing_until: string | null;
  updated_at?: string | null;
  visibility_expires_at?: string | null;
  masked?: boolean;
  zone_label?: string | null;
  lat?: number | null;
  lng?: number | null;
  zones?: MapZoneRaw[];
}

/** Un amico visibile nello snapshot: identità minima + aura + posizione + timestamp UTC. */
export interface MapFriendRaw {
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  aura_score: number | null;
  aura_color: string | null;
  lat: number;
  lng: number;
  masked: boolean;
  zone_label: string | null;
  updated_at: string;
  sharing_until: string;
  visibility_expires_at: string;
}

/** Un evento (stanza o live, vivo/echo) nello snapshot. live_id: M12 LM1. */
export interface MapEventRaw {
  id: string;
  user_id: string;
  room_id: string | null;
  live_id: string | null;
  event_type: MapEventType;
  title: string;
  lat: number;
  lng: number;
  masked: boolean;
  zone_label: string | null;
  started_at: string;
  ended_at: string | null;
  visibility_expires_at: string | null;
}

/** Ritorno di map_snapshot(): la porta di lettura della mappa. */
export interface MapSnapshotRaw {
  server_now: string;
  me: MapMeRaw;
  friends: MapFriendRaw[];
  events: MapEventRaw[];
}

// --- Payload dei delta realtime sull'inbox privata `map:u:{uid}` --------------
// (map_fanout, migrazione MM3). Payload minimo: NON portano identità/aura — quella
// vive solo nello snapshot (un delta di un amico sconosciuto → refetch di arricchimento).

/** `presence`: un amico ha (ri)pubblicato la posizione. Nessuna identità nel payload. */
export interface MapPresencePayload {
  user_id: string;
  lat: number;
  lng: number;
  masked: boolean;
  zone_label: string | null;
  updated_at: string;
  sharing_until: string;
  visibility_expires_at: string;
}

/** `presence_removed`: un amico ha spento (revoca/kill-switch) → sparizione fisica. */
export interface MapPresenceRemovedPayload {
  user_id: string;
}

/** `event_started`: bolla stanza live di un amico appena messa in mappa. */
export interface MapEventStartedPayload {
  id: string;
  user_id: string;
  room_id: string | null;
  live_id?: string | null; // presente solo sugli eventi live_broadcast (M12 LM1)
  event_type: MapEventType;
  title: string;
  lat: number;
  lng: number;
  masked: boolean;
  zone_label: string | null;
  started_at: string;
}

/** `event_ended`: fine evento. `removed=true` = revoca (niente Echo, va rimosso);
 *  `removed=false` = fine naturale → Echo (arriva ended_at + visibility_expires_at,
 *  MA non lat/lng/title: si patcha l'evento già in store). */
export interface MapEventEndedPayload {
  id: string;
  user_id: string;
  room_id: string | null;
  live_id?: string | null; // presente solo sugli eventi live_broadcast (M12 LM1)
  removed: boolean;
  ended_at?: string;
  visibility_expires_at?: string;
}

// =============================================================================
// M12 (LM5) — Live: shape GREZZE di lives_feed / live_detail e payload dei
// delta live_* sull'inbox privata (live_fanout, LM2). Fedeli ai payload di
// 20260711130000_live_social.sql. Timestamp UTC come stringhe ISO; il client
// li normalizza a epoch-ms e calibra il clock su `server_now` (liveStore,
// stesso pattern del clock mappa M7 §8).
// =============================================================================

/** Identità dell'host denormalizzata nei payload live (feed, detail, live_started). */
export interface LiveHostIdentityRaw {
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  aura_score: number | null;
  aura_color: string | null;
}

/** Una live nel feed Home (lives_feed v3): SOLO live di amici (la propria è
 *  esclusa), stato live/paused. M15/LR1 (RW-2+RW-4): `viewer_count` è nel
 *  payload — PUBBLICO a chi vede la live (eccezione del PO 2026-07-15 a R-04,
 *  limitata alle live) e pezzo del cursore keyset quaternario. */
export interface LiveFeedItemRaw {
  live_id: string;
  title: string;
  status: LiveStatus; // nel feed mai 'ended' (solo live attive)
  visibility: LiveVisibility;
  comments_enabled: boolean;
  started_at: string;
  paused_at: string | null;
  is_top_friend: boolean; // l'host è nella cerchia del VIEWER (ordinamento)
  viewer_count: number; //  spettatori concorrenti = l'engagement del ranking (RW-2)
  host: LiveHostIdentityRaw;
}

/** Ritorno di lives_feed(): la porta di lettura della Home live (striscia +
 *  feed). M13/P8: paginata keyset — `has_more` dice se esiste una pagina
 *  successiva; il cursore si deriva dall'ULTIMA riga ricevuta e da M15/LR1 è
 *  QUATERNARIO (is_top_friend, viewer_count, started_at, live_id). */
export interface LivesFeedRaw {
  server_now: string;
  lives: LiveFeedItemRaw[];
  has_more: boolean;
}

/** Un host ATTIVO in live_detail (host principale primo, poi i co-host). */
export interface LiveDetailHostRaw {
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  aura_color: string | null;
  role: LiveHostRole;
  joined_at: string | null;
}

/** Ritorno di live_detail() v3: dettaglio + revalidation 60s (live.md §5 — su
 *  errore `not_visible`/stato `ended` il client si disconnette). M15/LR1
 *  (RW-4): viewer_count e like_count vivono nel jsonb `live` di base — li
 *  ricevono TUTTI i visibili; peak_viewers resta PRIVATO degli host ATTIVI
 *  (principale e co-host, M14/V6) e arriva top-level solo a loro. */
export interface LiveDetailRaw {
  server_now: string;
  live: {
    live_id: string;
    title: string;
    status: LiveStatus;
    visibility: LiveVisibility;
    comments_enabled: boolean;
    show_on_map: boolean;
    started_at: string;
    paused_at: string | null;
    ended_at: string | null;
    viewer_count: number; // pubblico ai visibili (RW-4)
    like_count: number; //   totale storico, mai decrementato (RW-3b)
  };
  hosts: LiveDetailHostRaw[];
  me: {
    is_host: boolean;
    is_cohost: boolean;
    can_comment: boolean;
  };
  peak_viewers?: number; // SOLO host/co-host attivi (R-04 non abrogato)
}

// --- M15 (LR2) — striscia: le terminate <24h ----------------------------------

/** Un segnaposto di live terminata nella striscia (lives_strip): cerchio
 *  spento, visivamente inequivocabile, che porta al PROFILO dell'amico
 *  (RW-1a) — non esiste replay. NIENTE aura nel payload (nessun anello
 *  colore) e NIENTE contatori. */
export interface LiveStripEndedRaw {
  live_id: string;
  ended_at: string;
  host: {
    user_id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  };
}

/** Ritorno di lives_strip(): le live terminate da <24h visibili al chiamante
 *  (ended_at desc, cap 20; la propria esclusa server-side). La sparizione a
 *  24h ESATTE tra un refetch e l'altro è compito del client: filtro sul clock
 *  calibrato con `server_now` (pattern M7 §8). */
export interface LivesStripRaw {
  server_now: string;
  ended: LiveStripEndedRaw[];
}

// --- M16 (AC0) — Classifica Aura: envelope di aura_leaderboard() --------------

/** Una riga della classifica: un partecipante (io o un amico accettato) con
 *  rank personale 1-based SEMPRE sequenziale (row_number; pari merito risolto
 *  per anzianità su Televo, §2.2). */
export interface ClassificaAuraRigaRaw {
  rank: number;
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  aura_score: number;
  aura_color: string | null;
  is_me: boolean;
}

/** Envelope di aura_leaderboard(). Se `listed` è false (opt-out reciproco,
 *  AC-2) arriva SOLO {server_now, listed}: niente righe, niente me — il
 *  client mostra lo stato dedicato con la CTA di rientro. `me` è calcolato
 *  sull'insieme PIENO (visibile anche oltre il cap difensivo di 200 righe). */
export interface ClassificaAuraEnvelope {
  server_now: string;
  listed: boolean;
  friends_total?: number; // partecipanti, me incluso
  me?: { rank: number; aura_score: number; aura_color: string | null } | null;
  rows?: ClassificaAuraRigaRaw[];
  has_more?: boolean;
}

// --- Payload dei delta live sull'inbox privata `map:u:{uid}` ------------------
// (live_fanout, LM2). A differenza dei delta mappa, `live_started` PORTA
// l'identità dell'host (denormalizzata al momento dell'invio): nessun refetch
// di arricchimento. live_status/live_ended patchano la live già nota per id;
// se non è nota, lo snapshot (lives_feed) resta la verità e riconcilia.

/** `live_started`: un amico ha avviato una live visibile a me. */
export interface LiveStartedPayload {
  live_id: string;
  title: string;
  visibility: LiveVisibility;
  status: 'live';
  started_at: string;
  host: LiveHostIdentityRaw;
}

/** `live_status`: transizione live↔paused (la fine ha il suo evento dedicato). */
export interface LiveStatusPayload {
  live_id: string;
  status: LiveStatus;
}

/** `live_ended`: la live è finita → sparisce da striscia e feed (nessun archivio). */
export interface LiveEndedPayload {
  live_id: string;
}

/** Ritorno di create_live: la stanza LiveKit la decide il server (mai il
 *  client); `map_attached` dice la VERITÀ sull'attach best-effort della mappa
 *  (live.md §12.12: se false con show_on_map, il client mostra l'hint). */
export interface CreateLiveResult {
  live_id: string;
  livekit_room_name: string;
  map_attached: boolean;
}

// Autore embeddato nelle RPC di lettura dei drop (drops_feed/drop_detail).
export interface DropAuthor {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  aura_score: number;
  aura_color: string | null;
}

// Riga restituita da drops_feed/drop_detail (stessa shape). I CONTATORI privati
// (like/comment/save/reaction_counts) sono valorizzati SOLO se sei l'autore
// (R-04, anti-vanity enforced a livello dati); altrimenti arrivano null.
export interface DropFeedRow {
  id: string;
  author_id: string;
  type: DropType;
  body: string | null;
  audio_url: string | null;
  media_url: string | null;
  audio_seconds: number | null;
  audience: DropAudience;
  expires_at: string;
  created_at: string;
  author: DropAuthor;
  mio_like: boolean;
  mio_salvataggio: boolean;
  mie_reactions: DropReactionTrait[];
  ha_commenti: boolean; // booleano, MAI una cifra (anche per i non-autori)
  like_count: number | null;
  comment_count: number | null;
  save_count: number | null;
  reaction_counts: Partial<Record<DropReactionTrait, number>> | null;
}

// Autore di un commento (DM3): profilo minimo embeddato via FK PostgREST
// (author:profiles!drop_comments_author_id_fkey). Niente Aura: nei commenti
// non serve l'anello, basta identificare chi parla.
export interface DropCommentAuthor {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

// Riga di `drop_comments` con l'autore embeddato (lista commenti di S3). I
// commenti sono CONTENUTO (leggibile da chi vede il drop): nessuna cifra
// aggregata, solo il testo/vocale e chi lo ha scritto.
export interface DropCommentWithAuthor {
  id: string;
  drop_id: string;
  author_id: string;
  parent_id: string | null;
  type: 'text' | 'audio';
  body: string | null;
  audio_url: string | null;
  audio_seconds: number | null;
  created_at: string;
  author: DropCommentAuthor;
}

// Chi ha messo like a un mio drop (StatistichePrivate, R-04): visibile SOLO
// all'autore (RLS drop_likes: se stessi ∨ autore del drop). I salvataggi NON
// hanno l'equivalente (R-14: l'autore vede il numero, mai chi).
export interface DropLiker {
  user_id: string;
  created_at: string;
  user: DropCommentAuthor;
}

// Snapshot dei numeri congelato dal sistema alla scadenza (R-01, §2.8). È il
// contenuto di `drops.stats_finali`: permette di cancellare le righe di
// interazione senza perdere la gratificazione privata dell'autore nei Ricordi.
// Le chiavi rispecchiano ESATTAMENTE `jsonb_build_object` di expire_content.
export interface DropStatsFinali {
  likes: number;
  comments: number;
  saves: number;
  reactions: Partial<Record<DropReactionTrait, number>>;
}

// DM7 — "Drop del giorno" (§16.2): il tema curato di oggi, letto via la RPC
// SECURITY DEFINER drop_prompt_today() (le tabelle drop_prompts/drop_prompt_of_day
// sono di SISTEMA: nessuna lettura client diretta). È solo uno SPUNTO informativo
// nel composer, mai contenuto. La RPC ritorna null se oggi non c'è tema.
export interface DropPromptOfDay {
  id: string;
  body: string;
  for_date: string; // YYYY-MM-DD (giorno Europe/Rome)
}

// Il drop di un mio Ricordo (S5): la riga di `drops` scaduta, visibile solo
// all'autore (RLS). Niente contatori live (cancellati alla scadenza): resta lo
// snapshot `stats_finali`. L'autore sono sempre io → nessun profilo embeddato.
export interface MemoryRow {
  id: string;
  type: DropType;
  body: string | null;
  audio_url: string | null;
  media_url: string | null;
  audio_seconds: number | null;
  expires_at: string;
  created_at: string;
  stats_finali: DropStatsFinali | null;
}

// Un mio segnalibro (S4): riga di `drop_saves` con il drop embeddato (RLS). Il
// drop può essere `null` se nel frattempo è scaduto/non più visibile (ex-amico):
// la UI mostra "non disponibile". I salvataggi di drop scaduti sono già stati
// cancellati dal sistema, quindi qui arrivano quasi sempre drop vivi.
export interface SavedDropRow {
  drop_id: string;
  created_at: string; // quando l'ho salvato
  drop: {
    id: string;
    author_id: string;
    type: DropType;
    body: string | null;
    audio_url: string | null;
    media_url: string | null;
    audio_seconds: number | null;
    expires_at: string;
    created_at: string;
    author: DropCommentAuthor;
  } | null;
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string;
          display_name: string | null;
          age_verified: boolean;
          avatar_url: string | null;
          audio_bio_url: string | null;
          status_text: string | null;
          customization: Json;
          interests: string[];
          school_id: string | null;
          aura_score: number;
          aura_color: string | null;
          share_location: boolean;
          // ⚠️ Le 2 colonne sotto NON hanno grant SELECT per authenticated
          // (grants_audit CM8): mai selezionarle (niente `*`, vedi PROFILE_COLS
          // in lib/auth.ts). Nelle letture client arrivano sempre undefined.
          expo_push_token: string | null;
          last_active_at: string | null; // "ultimo accesso" (heartbeat via touch_presence, letto via RPC get_peer_presence)
          show_last_seen: boolean; // toggle privacy: mostra l'ultimo accesso
          show_read_receipts: boolean; // toggle privacy: spunte di lettura
          muted_until: string | null; // sanzione moderazione (mute GLOBALE, non per-conversazione)
          banned_at: string | null; // sanzione moderazione (ban account)
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: never; // i profili nascono dal trigger handle_new_user
        Update: {
          username?: string;
          display_name?: string | null;
          avatar_url?: string | null;
          audio_bio_url?: string | null;
          status_text?: string | null;
          customization?: Json;
          interests?: string[];
          share_location?: boolean;
          expo_push_token?: string | null;
          show_last_seen?: boolean; // grant update (show_last_seen, show_read_receipts)
          show_read_receipts?: boolean;
          // M16 (AC0): opt-out reciproco della Classifica Aura. SOLO update
          // (mai in Row: è FUORI dal grant SELECT — anti-enumerazione §13.1;
          // .update() SENZA .select(), lo stato proprio arriva come `listed`
          // nell'envelope di aura_leaderboard).
          show_in_leaderboard?: boolean;
        };
      };
      profiles_private: {
        Row: { id: string; birth_date: string; created_at: string };
        Insert: never;
        Update: never;
      };
      schools: {
        Row: { id: string; name: string; city: string; created_at: string };
        Insert: never;
        Update: never;
      };
      friendships: {
        // Coppia normalizzata (user_id < friend_id): UNA sola riga simmetrica.
        Row: {
          user_id: string;
          friend_id: string;
          requested_by: string;
          status: FriendshipStatus;
          blocked_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: never; // mutazioni via RPC (send/accept/remove/block)
        Update: never;
      };
      top_friends: {
        // Cerchia stretta (1–8), ordinata e gestita dall'owner.
        Row: {
          user_id: string;
          friend_id: string;
          position: number;
          created_at: string;
        };
        Insert: never; // gestita dall'owner via RPC/update dedicati (M5)
        Update: never;
      };
      conversations: {
        Row: {
          id: string;
          type: ConversationType;
          name: string | null;
          topic: string | null;
          avatar_url: string | null;
          dm_key: string | null; // "<least>:<greatest>" solo per le DM
          created_by: string | null;
          created_at: string;
          updated_at: string; // bumpato da ogni messaggio → ordinamento lista chat
        };
        Insert: never; // via RPC (get_or_create_dm, create_group_conversation)
        Update: never;
      };
      conversation_members: {
        // Relazione utente↔conversazione. last_read_at = base di unread e spunte.
        // Campi di organizzazione PER-UTENTE (D4): tutti null = attivo/visibile.
        Row: {
          conversation_id: string;
          user_id: string;
          role: ConversationRole;
          joined_at: string;
          last_read_at: string;
          muted_until: string | null; // null=attivo, futuro=silenziato (per-conversazione)
          archived_at: string | null; // archiviata (fuori dalla lista principale)
          pinned_at: string | null; // fissata in cima
          cleared_at: string | null; // nascondi i messaggi con created_at <= cleared_at
          hidden_at: string | null; // "elimina chat" (DM): fuori dalla lista finché nuovo msg
        };
        Insert: never; // via RPC (get_or_create_dm / create_group / add_member)
        Update: never; // mark_conversation_read / set_conversation_* via RPC
      };
      messages: {
        Row: {
          id: string;
          conversation_id: string;
          sender_id: string;
          type: MessageType;
          body: string | null;
          audio_url: string | null;
          media_url: string | null; // path nel bucket privato chat-media (foto/media, D3)
          media_type: string | null; // es. 'image'
          reply_to: string | null;
          expires_at: string | null;
          edited_at: string | null; // timestamp ultima modifica (max 48h dall'invio)
          forwarded_from: string | null; // origine di un inoltro (CM4, RC-06); null se non inoltrato
          drop_ref: string | null; // M6/DM5: riferimento a un drop (inoltro/risposta privata, R-08); on delete set null
          created_at: string;
          deleted_at: string | null;
        };
        // Grant insert: (conversation_id, type, body, audio_url, media_url, media_type, reply_to, expires_at, forwarded_from, drop_ref).
        Insert: {
          conversation_id: string;
          type?: MessageType;
          body?: string | null;
          audio_url?: string | null;
          media_url?: string | null;
          media_type?: string | null;
          reply_to?: string | null;
          expires_at?: string | null;
          forwarded_from?: string | null;
          drop_ref?: string | null; // DM5: puntatore a un drop (mai una copia)
        };
        // Grant update (body, deleted_at): edit del proprio testo + soft-delete.
        Update: { body?: string | null; deleted_at?: string | null };
      };
      message_reactions: {
        // Reazioni emoji (CM4, RC-07): 1 per utente per messaggio, set curato
        // (REACTION_EMOJIS in constants/chat.ts, byte-identico al CHECK DB).
        // conversation_id è derivata dal trigger (serve al filtro realtime).
        // Cambio emoji = delete + insert (nessun grant UPDATE).
        Row: {
          message_id: string;
          user_id: string;
          conversation_id: string;
          emoji: string;
          created_at: string;
        };
        Insert: {
          message_id: string;
          emoji: string;
        };
        Update: never;
      };
      streaks: {
        // Streak per conversazione (giorni consecutivi, con freeze). Sola lettura.
        Row: {
          conversation_id: string;
          current_streak: number;
          longest_streak: number;
          last_activity_date: string | null;
          freezes_available: number;
          updated_at: string;
        };
        Insert: never; // touch_streak (trigger) lato server
        Update: never;
      };
      usage_daily: {
        // Secondi attivi per giorno (anti-doomscroll). Owner-only via RLS.
        Row: {
          user_id: string;
          day: string;
          active_seconds: number;
          compulsive_flagged: boolean;
        };
        Insert: never; // via RPC record_session
        Update: never;
      };
      saved_messages: {
        // Bookmark personale cross-conversazione (D4). Owner-only via RLS.
        Row: {
          user_id: string;
          message_id: string;
          created_at: string;
        };
        Insert: never; // via RPC save_message
        Update: never;
      };
      contact_hashes: {
        // Hash del proprio contatto (opt-in, rubrica D1). Nessuna lettura diretta
        // (solo via RPC match_contacts): RLS attiva senza policy di select.
        Row: {
          user_id: string;
          kind: 'phone' | 'email';
          hash: string;
          created_at: string;
        };
        Insert: never; // via RPC register_contact_hash
        Update: never;
      };
      consents: {
        // Consensi GDPR (select owner-only). Scrittura SOLO via record_consent /
        // revoke_contacts_sync: il client li legge per mostrare lo stato (CM7).
        Row: {
          user_id: string;
          consent_type: string;
          version: string;
          granted_at: string | null;
          revoked_at: string | null;
          updated_at: string;
        };
        Insert: never; // via RPC record_consent
        Update: never;
      };
      // M7 (MM0) — Mappa v2. Le tabelle di posizione NON sono leggibili dal client
      // (RLS senza policy): la lettura passa SOLO da map_snapshot (RPC definer, MM2).
      // Qui restano documentate; solo map_safe_zones è leggibile owner-only.
      map_presence: {
        // Una riga per utente = sessione opt-in + Last Seen. Solo via RPC.
        Row: {
          user_id: string;
          masked: boolean;
          zone_label: string | null;
          sharing_until: string;
          updated_at: string | null;
          visibility_expires_at: string | null;
          // location (geography) non è esposta al client raw: arriva via snapshot.
        };
        Insert: never; // via RPC map_start_sharing / map_publish_location
        Update: never;
      };
      map_events: {
        // Eventi georiferiti (stanze e live, vivi/echo). Solo via RPC (snapshot MM2).
        Row: {
          id: string;
          user_id: string;
          live_id: string | null; // M12 LM1: bolla live_broadcast (Echo a +3h)
          room_id: string | null;
          event_type: MapEventType;
          title: string;
          masked: boolean;
          zone_label: string | null;
          started_at: string;
          ended_at: string | null;
          visibility_expires_at: string | null;
        };
        Insert: never; // via RPC map_attach_room (MM2)
        Update: never;
      };
      map_safe_zones: {
        // Fino a 2 zone personali (owner-only in lettura via RLS). Mutazioni via
        // RPC map_set_safe_zone / map_delete_safe_zone. `center` (geography) non è
        // tipizzata qui: l'editor (MM9) userà label/radius_m.
        Row: {
          id: string;
          user_id: string;
          label: string;
          radius_m: number;
          created_at: string;
        };
        Insert: never; // via RPC map_set_safe_zone
        Update: never;
      };
      drops: {
        // Momenti effimeri (24h): alla scadenza NON si cancellano più (R-01),
        // diventano "Ricordi" del solo autore con stats_finali congelate.
        Row: {
          id: string;
          author_id: string;
          type: DropType;
          body: string | null; // testo (≤2000) o caption di foto/audio (≤280)
          audio_url: string | null; // path bucket drop-audio (drop vocali)
          media_url: string | null; // path bucket drop-media (foto)
          audio_seconds: number | null; // durata del vocale (1–300)
          audience: DropAudience;
          expires_at: string;
          stats_finali: Json | null; // snapshot scritto SOLO dal sistema alla scadenza
          created_at: string;
        };
        // Grant insert: (id, type, body, audio_url, media_url, audio_seconds, audience).
        // id generato dal client (R-03): i file si caricano PRIMA dell'insert su
        // path <id>/<author_id>/…. stats_finali NON è insertabile (solo sistema).
        Insert: {
          id?: string;
          type?: DropType;
          body?: string | null;
          audio_url?: string | null;
          media_url?: string | null;
          audio_seconds?: number | null;
          audience?: DropAudience;
        };
        Update: never; // niente edit (R-12); solo delete (eliminazione anticipata)
      };
      drop_reactions: {
        // Reaction-tratto (gesto forte): il trigger la trasforma in prop→Aura.
        // PK (drop_id, user_id, trait). Modellata ora (M6, RC-10).
        Row: {
          drop_id: string;
          user_id: string;
          trait: DropReactionTrait;
          created_at: string;
        };
        Insert: {
          drop_id: string;
          trait: DropReactionTrait;
        };
        Update: never;
      };
      drop_comments: {
        // Commenti testo/vocale, 1 solo livello di reply (R-07). Contenuto, non
        // contatore: leggibili da chi vede il drop; niente edit (R-12).
        Row: {
          id: string;
          drop_id: string;
          author_id: string;
          parent_id: string | null; // reply a un top-level dello stesso drop
          type: 'text' | 'audio';
          body: string | null; // testo ≤1000
          audio_url: string | null; // path bucket drop-audio, prefisso commento_
          audio_seconds: number | null; // 1–120
          created_at: string;
        };
        // Grant insert: (drop_id, parent_id, type, body, audio_url, audio_seconds).
        Insert: {
          drop_id: string;
          parent_id?: string | null;
          type?: 'text' | 'audio';
          body?: string | null;
          audio_url?: string | null;
          audio_seconds?: number | null;
        };
        Update: never;
      };
      drop_likes: {
        // Gesto leggero (R-05): zero Aura/notifiche/realtime. La riga è visibile
        // a se stessi ∨ all'autore del drop; il NUMERO solo all'autore (via RPC).
        Row: {
          drop_id: string;
          user_id: string;
          created_at: string;
        };
        Insert: { drop_id: string }; // toggle diretto (delete per togliere)
        Update: never;
      };
      drop_saves: {
        // Segnalibro effimero (D-1): vive quanto il drop. Mutazioni SOLO via RPC
        // (save_drop/unsave_drop). Owner-only in lettura; l'autore vede solo il
        // numero, mai CHI salva (R-14).
        Row: {
          user_id: string;
          drop_id: string;
          created_at: string;
        };
        Insert: never; // via RPC save_drop
        Update: never;
      };
      lives: {
        // M12 (LM0) — un broadcast per riga. Scrittura SOLO via RPC (create_live,
        // pause/resume/end). Il grant select è PER-COLONNA: da M15/LR1 (RW-4)
        // include anche viewer_count e like_count (contatori PUBBLICI ai
        // visibili — eccezione PO 2026-07-15 a R-04, solo live); peak_viewers e
        // livekit_room_name restano ESCLUSI → mai `select *` dal client.
        Row: {
          id: string;
          host_id: string;
          title: string;
          status: LiveStatus;
          visibility: LiveVisibility;
          comments_enabled: boolean;
          show_on_map: boolean;
          notify_mode: LiveNotifyMode;
          clip_consent: boolean; // riservato Fase 2, sempre false in v1
          started_at: string;
          paused_at: string | null; // valorizzato SOLO mentre in pausa
          ended_at: string | null; // null = attiva; stato finale immutabile
          viewer_count: number; // M15/LR1: spettatori concorrenti (sync a delta)
          like_count: number; //   M15/LR0: totale storico, mai decrementato
          created_at: string;
        };
        Insert: never; // via RPC create_live
        Update: never;
      };
      live_hosts: {
        // Host principale + co-host (tetto 4). RLS: l'host della live vede
        // tutto, l'utente le proprie righe. Mutazioni solo via RPC.
        Row: {
          live_id: string;
          user_id: string;
          role: LiveHostRole;
          status: LiveHostStatus;
          invited_at: string;
          joined_at: string | null;
          left_at: string | null;
        };
        Insert: never;
        Update: never;
      };
      live_viewers: {
        // Spettatori reali (il mint del token è il join, LM4) + registro kick.
        // RLS come live_hosts. Il client scrive solo via live_leave/Edge.
        Row: {
          live_id: string;
          user_id: string;
          joined_at: string;
          left_at: string | null;
          kicked_at: string | null;
          kicked_by: string | null;
        };
        Insert: never;
        Update: never;
      };
      live_comments: {
        // Commenti effimeri (fade client-side; purge 24h dopo la fine, LM3).
        // Solo testo ≤200, niente reply. Insert diretta validata dal trigger
        // (stato live, comments_enabled, can_see_live, rate-limit 5/30s).
        Row: {
          id: string;
          live_id: string;
          author_id: string;
          body: string;
          created_at: string;
        };
        Insert: { live_id: string; body: string };
        Update: never;
      };
      live_likes: {
        // M15 (LR0) — un LOTTO di like TikTok (RW-3: illimitati, non-toggle).
        // Un tap NON è un insert: il client accumula e fa flush ~800ms (cap 50
        // tap per riga). Insert diretta arbitrata dal trigger (stato 'live',
        // can_see_live, is_active_user, rate-limit 15 lotti/10s); user_id e
        // created_at forzati server-side (fuori dal grant). Niente
        // update/delete: il totale (lives.like_count) è storico; purge a 24h
        // dalla fine della live. In pubblicazione realtime (postgres_changes).
        Row: {
          id: string;
          live_id: string;
          user_id: string;
          count: number; // tap nel lotto, 1..50 (check a DB)
          created_at: string;
        };
        Insert: { live_id: string; count: number };
        Update: never;
      };
      props: {
        Row: {
          id: string;
          giver: string;
          recipient: string;
          trait: AuraEventType;
          source_type: string | null;
          source_id: string | null;
          created_at: string;
        };
        Insert: {
          recipient: string;
          trait: AuraEventType;
          source_type?: string | null;
          source_id?: string | null;
        };
        Update: never;
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          type: NotificationType;
          title: string;
          body: string | null;
          payload: Json;
          read_at: string | null;
          pushed_at: string | null;
          created_at: string;
        };
        Insert: never;
        Update: { read_at?: string | null }; // grant update (read_at)
      };
      devices: {
        Row: {
          id: string;
          user_id: string;
          expo_push_token: string;
          platform: string; // 'ios' | 'android' | 'web' (check DB)
          last_seen: string;
          created_at: string;
        };
        Insert: never; // via RPC register_device
        Update: never;
      };
      achievements: {
        // Catalogo statico dei traguardi (vedi seed in 180100_achievements.sql).
        Row: {
          key: string;
          name: string;
          description: string;
          icon: string;
          category: string;
          created_at: string;
        };
        Insert: never;
        Update: never;
      };
      user_achievements: {
        Row: {
          user_id: string;
          achievement_key: string;
          is_public: boolean;
          unlocked_at: string;
        };
        Insert: never; // sblocco server-side (unlock_achievement)
        Update: { is_public?: boolean }; // l'owner può nascondere un badge
      };
      wallets: {
        Row: {
          user_id: string;
          balance_symbolic: number;
          balance_real: number;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: never;
      };
      rooms: {
        Row: {
          id: string;
          host_id: string;
          title: string;
          mood: string | null;
          is_private: boolean;
          status: string;
          started_at: string | null;
          ends_at: string | null;
          created_at: string;
        };
        Insert: never; // via RPC / Edge
        Update: never;
      };
      aura_snapshots: {
        Row: {
          user_id: string;
          period_start: string;
          score: number;
          vibe_color: string;
          character_breakdown: Json;
        };
        Insert: never;
        Update: never;
      };
    };
    Views: {
      // Classifica per carattere (somme DECADUTE, ultime 8 settimane). Espone solo
      // user_id/type/score: per username/avatar serve un join con `profiles`.
      leaderboard_character: {
        Row: {
          user_id: string;
          type: AuraEventType;
          score: number;
        };
      };
      // M16/AC6: `leaderboard_school` RIMOSSA dai tipi client (scuola fuori
      // dal progetto, PO 2026-07-05 — la vista materializzata resta a DB per
      // la bonifica backend di un round futuro, ma il mobile non la legge più).
    };
    Functions: {
      // Onboarding / inviti (vedi migrazione onboarding_oauth)
      check_invite: {
        Args: { p_code: string };
        Returns: { valid: boolean; reason: string | null };
      };
      complete_onboarding: {
        Args: {
          p_username: string;
          p_display_name: string | null;
          p_birth_date: string; // YYYY-MM-DD
          p_invite_code: string;
        };
        Returns: { ok: boolean };
      };
      create_invite: {
        Args: Record<string, never>;
        Returns: { code: string; expires_at: string };
      };
      // Amicizie — le mutazioni ritornano jsonb { ok, status }.
      send_friend_request: { Args: { p_target: string }; Returns: Json };
      accept_friend_request: { Args: { p_other: string }; Returns: Json };
      remove_friend: { Args: { p_other: string }; Returns: Json };
      block_user: { Args: { p_target: string }; Returns: Json };
      unblock_user: { Args: { p_target: string }; Returns: Json };
      are_friends: { Args: { a: string; b: string }; Returns: boolean };
      // Conversazioni — ritornano jsonb { ok, conversation_id?, created? }.
      get_or_create_dm: { Args: { p_other: string }; Returns: Json };
      create_group_conversation: {
        Args: { p_type: ConversationType; p_name: string | null; p_members?: string[] };
        Returns: Json;
      };
      add_conversation_member: { Args: { p_conv: string; p_user: string }; Returns: Json };
      remove_conversation_member: { Args: { p_conv: string; p_user: string }; Returns: Json };
      leave_conversation: { Args: { p_conv: string }; Returns: Json };
      mark_conversation_read: { Args: { p_conv: string }; Returns: Json };
      // Organizzazione chat per-utente (D4) — jsonb { ok }.
      set_conversation_mute: { Args: { p_conv: string; p_until: string | null }; Returns: Json };
      set_conversation_flag: {
        Args: { p_conv: string; p_flag: 'archived' | 'pinned' | 'hidden'; p_on: boolean };
        Returns: Json;
      };
      clear_conversation_history: { Args: { p_conv: string }; Returns: Json };
      // Messaggi salvati (D4) — jsonb { ok }.
      save_message: { Args: { p_message: string }; Returns: Json };
      unsave_message: { Args: { p_message: string }; Returns: Json };
      // Ricerca full-text (CM4, RC-08): in-chat (p_conv) o globale (p_conv null).
      // Visibilità identica alla lista messaggi (membership/cleared/hidden/deleted).
      search_messages: {
        Args: { p_query: string; p_conv?: string | null; p_limit?: number; p_before?: string | null };
        Returns: {
          message_id: string;
          conversation_id: string;
          body: string | null;
          created_at: string;
          sender_id: string;
          sender_username: string | null;
          conv_type: ConversationType;
          conv_title: string;
        }[];
      };
      // Gestione gruppo (CM4, R-09) — jsonb { ok }. Solo admin, mai su DM.
      update_conversation_meta: {
        Args: { p_conv: string; p_name: string; p_avatar_url?: string | null };
        Returns: Json;
      };
      promote_conversation_admin: { Args: { p_conv: string; p_user: string }; Returns: Json };
      // Presenza "ultimo accesso" (§3.13) — jsonb { ok }.
      touch_presence: { Args: Record<string, never>; Returns: Json };
      // Presenza del peer, privacy-safe (CM1, R-03): amici/co-membri + reciprocità.
      get_peer_presence: {
        Args: { p_peer_user: string };
        Returns: { online: boolean | null; last_active_at: string | null };
      };
      // Ricevute di lettura privacy-safe (CM8, §6.4): membership + reciprocità
      // applicate dal server; esclude sempre il chiamante e chi nasconde le spunte.
      get_read_receipts: {
        Args: { p_conv: string };
        Returns: { user_id: string; last_read_at: string }[];
      };
      // Rubrica (D1) — register: jsonb { ok }; match: righe { user_id, username, avatar_url }.
      register_contact_hash: { Args: { p_kind: 'phone' | 'email'; p_hash: string }; Returns: Json };
      match_contacts: {
        Args: { p_hashes: string[] };
        Returns: { user_id: string; username: string; avatar_url: string | null }[];
      };
      // Revoca ATOMICA del consenso rubrica (CM7): delete hash propri + revoca.
      revoke_contacts_sync: { Args: Record<string, never>; Returns: Json };
      // Hub in una query (CM8): una riga per membership del chiamante, con org
      // D4, ultimo messaggio valido (jsonb), unread ESATTO, peer DM e streak.
      chat_overview: {
        Args: Record<string, never>;
        Returns: {
          conversation_id: string;
          type: ConversationType;
          name: string | null;
          avatar_url: string | null;
          updated_at: string;
          muted_until: string | null;
          archived_at: string | null;
          pinned_at: string | null;
          cleared_at: string | null;
          hidden_at: string | null;
          my_last_read_at: string;
          peer: Json | null;
          last_message: Json | null;
          unread_count: number;
          streak: number | null;
        }[];
      };
      // Streak / presenza sana
      record_session: { Args: { p_seconds: number }; Returns: Json };
      // Notifiche / device
      register_device: { Args: { p_token: string; p_platform?: string }; Returns: Json };
      unregister_device: { Args: { p_token: string }; Returns: Json };
      // M13/P6 — "nuovo accesso": eseguibile SOLO da service_role (la Edge
      // login-alert); il client non la chiama mai direttamente. Dedup 1h per
      // (utente, install_id); p_city = solo il nome della città (mai l'IP).
      enqueue_login_alert: {
        Args: {
          p_user: string;
          p_install_id: string;
          p_device_label?: string | null;
          p_city?: string | null;
        };
        Returns: Json;
      };
      // Economia
      process_symbolic_tip: {
        Args: {
          recipient: string;
          amount: number;
          source_room: string | null;
          idem: string;
        };
        Returns: undefined;
      };
      // Drops M6 (DM0) — lettura feed/dettaglio + salvataggi.
      // drops_feed: pagina keyset (created_at desc, id desc); contatori privati
      // valorizzati SOLO per i propri drop. drop_detail: stessa shape, singolo.
      drops_feed: {
        Args: { p_before?: string | null; p_before_id?: string | null; p_limit?: number };
        Returns: DropFeedRow[];
      };
      drop_detail: {
        Args: { p_drop: string };
        Returns: DropFeedRow[]; // 0 righe se scaduto/non visibile (identico al client)
      };
      save_drop: { Args: { p_drop: string }; Returns: Json };
      unsave_drop: { Args: { p_drop: string }; Returns: Json };
      // DM7 — "Drop del giorno" (§16.2): tema di oggi per il banner del composer
      // (S2). null se oggi non c'è tema. Tabelle di sistema → lettura solo via RPC.
      drop_prompt_today: { Args: Record<string, never>; Returns: DropPromptOfDay | null };
      // Moderazione / GDPR
      file_report: {
        Args: {
          p_target_type: ModerationTarget;
          p_target_id: string;
          p_reason: string;
          p_details?: string | null;
        };
        Returns: Json;
      };
      record_consent: {
        Args: { p_type: string; p_granted: boolean };
        Returns: undefined;
      };
      request_gdpr: { Args: { kind: string }; Returns: undefined };
      // M7 (MM0) — Mappa v2: RPC di scrittura (opt-in/posizione/Safe Zone).
      // Tutte definer, ritornano jsonb {ok, …}. La lettura (map_snapshot) è MM2.
      map_start_sharing: { Args: { p_hours: number }; Returns: Json }; // accende l'aura per N ore (1–12)
      map_stop_sharing: { Args: Record<string, never>; Returns: Json }; // revoca istantanea (sparizione fisica)
      map_publish_location: { Args: { p_lat: number; p_lng: number }; Returns: Json }; // {ok, masked} · no-op se rate-limited
      map_set_safe_zone: {
        Args: { p_label: string; p_lat: number; p_lng: number; p_radius_m?: number };
        Returns: Json; // {ok, id}
      };
      map_delete_safe_zone: { Args: { p_id: string }; Returns: Json };
      // M7 (MM2) — stanze sulla mappa + snapshot di lettura. attach/detach: {ok}.
      // map_snapshot è LA porta di lettura: ritorna {server_now, me, friends[],
      // events[]} con timestamp UTC grezzi (gli stati Live/Echo/LastSeen li deriva
      // il client sul clock calibrato con server_now). Tipizzata come Json: la
      // forma dell'oggetto è documentata nel dominio mappa (MM7).
      map_attach_room: { Args: { p_room: string }; Returns: Json };
      map_detach_room: { Args: { p_room: string }; Returns: Json };
      map_snapshot: { Args: Record<string, never>; Returns: Json };
      // M12 (LM1) — la Live sulla mappa: specchio delle versioni room (badge
      // dell'host principale, Echo a +3h). In v1 il client non le chiama
      // direttamente (l'attach è dentro create_live v2, LM2): tipizzate per
      // completezza del contratto.
      map_attach_live: { Args: { p_live: string }; Returns: Json };
      map_detach_live: { Args: { p_live: string }; Returns: Json };
      // M12 (LM0+LM2) — Live: RPC di scrittura. Da LM2 sono la versione
      // "sociale": create_live notifica gli amici secondo notify_mode (dedup
      // 10 min), fa fan-out live_started sull'inbox realtime e aggancia la
      // mappa best-effort (map_attached dice la verità); pause/resume/end
      // fanno fan-out live_status/live_ended; live_invite_cohost notifica
      // l'invitato. Errori come stringhe-codice (live_already_active,
      // not_live_host, invalid_transition, live_already_ended,
      // cohost_cap_reached, cohost_removed, not_friends, no_invite…).
      create_live: {
        Args: {
          p_title: string;
          p_visibility?: LiveVisibility;
          p_comments_enabled?: boolean;
          p_show_on_map?: boolean;
          p_notify_mode?: LiveNotifyMode;
        };
        Returns: Json; // { live_id, livekit_room_name, map_attached }
      };
      pause_live: { Args: { p_live: string }; Returns: Json }; // { ok, status }
      resume_live: { Args: { p_live: string }; Returns: Json };
      end_live: { Args: { p_live: string }; Returns: Json }; // stato finale
      live_invite_cohost: { Args: { p_live: string; p_user: string }; Returns: Json };
      live_accept_cohost: { Args: { p_live: string }; Returns: Json };
      live_remove_cohost: { Args: { p_live: string; p_user: string }; Returns: Json };
      live_leave: { Args: { p_live: string }; Returns: Json }; // best-effort { ok, role }
      // M12 (LM2) — Live: porte di lettura. lives_feed = Home (striscia +
      // feed verticale): live ATTIVE (live/paused) degli amici visibili al
      // chiamante; la propria live è esclusa (il feed è "amici in live").
      // Ritorna { server_now, lives: [LiveFeedItemRaw], has_more }.
      // live_detail = dettaglio + revalidation 60s (LiveDetailRaw); errore
      // not_visible se il predicato nega → il client si disconnette.
      // M13/P8: lives_feed è paginata keyset, cap 20 per pagina; senza
      // argomenti = prima pagina (compatibile con la chiamata storica).
      // M15/LR1 (v3, RW-2+RW-4): ranking a engagement — Best Friends del
      // viewer SEMPRE primi, poi viewer_count desc, recenza a tie-break
      // (l'Aura esce dal ranking); viewer_count nel payload dell'item e nel
      // cursore, ora QUATERNARIO: (p_top=is_top_friend, p_viewers=
      // viewer_count, p_before=started_at, p_before_id=live_id) dall'ultima
      // riga ricevuta. Il ramo keyset si attiva solo con TUTTI i pezzi
      // non-null. live_detail v3: viewer_count/like_count nel jsonb `live` per
      // tutti i visibili; peak_viewers top-level solo host/co-host attivi.
      lives_feed: {
        Args: {
          p_top?: boolean | null;
          p_viewers?: number | null;
          p_before?: string | null;
          p_before_id?: string | null;
          p_limit?: number;
        };
        Returns: Json;
      };
      live_detail: { Args: { p_live: string }; Returns: Json };
      // M15 (LR2) — striscia: le live TERMINATE da <24h visibili al chiamante
      // (RW-1). Ritorna { server_now, ended: [LiveStripEndedRaw] } — niente
      // aura, niente contatori: il cerchio spento è una scorciatoia al profilo.
      lives_strip: { Args: Record<string, never>; Returns: Json };
      // M16 (AC0) — l'UNICA porta di lettura della Classifica Aura (solo
      // amici accettati, AC-1). Ritorna ClassificaAuraEnvelope: se il
      // chiamante è non listed l'envelope è CORTO ({server_now, listed:false},
      // reciprocità AC-2); altrimenti righe ordinate (score desc, anzianità,
      // id), cap 200 + has_more, con `me` sempre presente (sticky).
      aura_leaderboard: { Args: Record<string, never>; Returns: Json };
    };
    Enums: {
      aura_event_type: AuraEventType;
      conversation_type: ConversationType;
      message_type: MessageType;
      notification_type: NotificationType;
      friendship_status: FriendshipStatus;
      moderation_target: ModerationTarget;
      map_event_type: MapEventType;
      live_status: LiveStatus;
      live_visibility: LiveVisibility;
      live_notify_mode: LiveNotifyMode;
    };
  };
}
