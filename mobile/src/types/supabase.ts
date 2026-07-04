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
  | 'achievement';
export type ModerationTarget = 'user' | 'room' | 'message' | 'drop';
export type DropType = 'text' | 'audio' | 'media';
export type DropAudience = 'friends' | 'school';
export type FriendshipStatus = 'pending' | 'accepted' | 'blocked';

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
          expo_push_token: string | null;
          last_active_at: string | null; // "ultimo accesso" (heartbeat via touch_presence)
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
          created_at: string;
          deleted_at: string | null;
        };
        // Grant insert: (conversation_id, type, body, audio_url, media_url, media_type, reply_to, expires_at, forwarded_from).
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
      drops: {
        // Momenti effimeri (24h): niente soft-delete, scadono via expires_at.
        Row: {
          id: string;
          author_id: string;
          type: DropType;
          body: string | null;
          audio_url: string | null;
          media_url: string | null;
          audience: DropAudience;
          expires_at: string;
          created_at: string;
        };
        Insert: {
          type?: DropType;
          body?: string | null;
          audio_url?: string | null;
          media_url?: string | null;
          audience?: DropAudience;
        };
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
      vibe_map: {
        Row: {
          user_id: string;
          username: string;
          aura_color: string | null;
          geohash5: string | null;
          kind: string;
          room_id: string | null;
        };
      };
      // Classifica per carattere (somme DECADUTE, ultime 8 settimane). Espone solo
      // user_id/type/score: per username/avatar serve un join con `profiles`.
      leaderboard_character: {
        Row: {
          user_id: string;
          type: AuraEventType;
          score: number;
        };
      };
      // Classifica per scuola (aggregati). `members` è un conteggio (bigint →
      // arriva come number via PostgREST js).
      leaderboard_school: {
        Row: {
          school_id: string;
          school_name: string;
          members: number;
          total_aura: number;
          avg_aura: number;
        };
      };
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
    };
    Enums: {
      aura_event_type: AuraEventType;
      conversation_type: ConversationType;
      message_type: MessageType;
      notification_type: NotificationType;
      friendship_status: FriendshipStatus;
      moderation_target: ModerationTarget;
    };
  };
}
