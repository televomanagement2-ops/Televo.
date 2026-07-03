// =============================================================================
// chat.ts — costanti del dominio chat (CM4).
// =============================================================================

/**
 * Set curato di reazioni emoji (RC-07, confermato dall'utente il 2026-07-03).
 * ⚠️ DEVE restare byte-identico al CHECK di `message_reactions.emoji` nella
 * migrazione 20260703120000_chat_modern.sql (❤️ = U+2764 U+FE0F, con variation
 * selector): un'emoji "uguale a vista" ma con byte diversi verrebbe rifiutata
 * dal DB.
 */
export const REACTION_EMOJIS = ['❤️', '😂', '👍', '😮', '😢', '🔥'] as const;

export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

/**
 * Cap alla selezione multipla per l'inoltro: il rate-limit server è 30 msg/60s,
 * un inoltro di massa non deve poterlo innescare.
 */
export const MAX_FORWARD_SELECTION = 10;

/** Finestra di modifica dei messaggi (deve combaciare col trigger DB, R-15). */
export const EDIT_WINDOW_MS = 48 * 60 * 60 * 1000;
