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
  | 'compulsive_use'
  | 'spam';

export type ConversationKind = 'dm' | 'group' | 'house';
export type MessageKind = 'text' | 'audio' | 'voice_thread';
export type DropAudience = 'friends' | 'school';
export type FriendshipStatus = 'pending' | 'accepted';

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
        Row: {
          user_id: string;
          friend_id: string;
          status: FriendshipStatus;
          requested_by: string;
          created_at: string;
          accepted_at: string | null;
        };
        Insert: never; // mutazioni via RPC (send/accept/remove)
        Update: never;
      };
      conversations: {
        Row: {
          id: string;
          kind: ConversationKind;
          title: string | null;
          school_id: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: never; // via RPC (get_or_create_dm, create_group_conversation)
        Update: never;
      };
      messages: {
        Row: {
          id: string;
          conversation_id: string;
          sender_id: string;
          kind: MessageKind;
          body: string | null;
          media_url: string | null;
          reply_to: string | null;
          expires_at: string | null;
          created_at: string;
          deleted_at: string | null;
        };
        Insert: {
          conversation_id: string;
          kind?: MessageKind;
          body?: string | null;
          media_url?: string | null;
          reply_to?: string | null;
          expires_at?: string | null;
        };
        Update: { deleted_at?: string | null };
      };
      drops: {
        Row: {
          id: string;
          author_id: string;
          kind: MessageKind;
          body: string | null;
          media_url: string | null;
          audience: DropAudience;
          expires_at: string;
          created_at: string;
        };
        Insert: {
          kind?: MessageKind;
          body?: string | null;
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
          kind: string;
          title: string;
          body: string | null;
          data: Json;
          read_at: string | null;
          pushed_at: string | null;
          created_at: string;
        };
        Insert: never;
        Update: { read_at?: string | null };
      };
      devices: {
        Row: {
          id: string;
          user_id: string;
          expo_push_token: string;
          platform: string | null;
          created_at: string;
        };
        Insert: never; // via RPC register_device
        Update: never;
      };
      achievements: {
        Row: {
          code: string;
          title: string;
          description: string | null;
          icon: string | null;
        };
        Insert: never;
        Update: never;
      };
      user_achievements: {
        Row: {
          user_id: string;
          achievement_code: string;
          unlocked_at: string;
        };
        Insert: never;
        Update: never;
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
      // Amicizie
      send_friend_request: { Args: { target: string }; Returns: undefined };
      accept_friend_request: { Args: { requester: string }; Returns: undefined };
      remove_friend: { Args: { other: string }; Returns: undefined };
      block_user: { Args: { target: string }; Returns: undefined };
      unblock_user: { Args: { target: string }; Returns: undefined };
      are_friends: { Args: { a: string; b: string }; Returns: boolean };
      // Conversazioni
      get_or_create_dm: { Args: { other: string }; Returns: string };
      create_group_conversation: { Args: { title: string }; Returns: string };
      add_conversation_member: {
        Args: { conv: string; member: string };
        Returns: undefined;
      };
      leave_conversation: { Args: { conv: string }; Returns: undefined };
      mark_conversation_read: { Args: { conv: string }; Returns: undefined };
      // Notifiche / device
      register_device: {
        Args: { token: string; platform: string };
        Returns: undefined;
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
      // Moderazione / GDPR
      file_report: {
        Args: {
          target_user: string;
          reason: string;
          context_type: string | null;
          context_id: string | null;
        };
        Returns: undefined;
      };
      record_consent: {
        Args: { kind: string; granted: boolean };
        Returns: undefined;
      };
      request_gdpr: { Args: { kind: string }; Returns: undefined };
    };
    Enums: {
      aura_event_type: AuraEventType;
    };
  };
}
