// =============================================================================
// gdpr-export — diritto di accesso (art. 15): esporta TUTTI i dati dell'utente.
// =============================================================================
// L'utente esporta SOLO i propri dati. Usa adminClient (per completezza, oltre la
// RLS) ma filtrando rigorosamente su user.id ricavato dal JWT verificato. Marca
// come completate le richieste 'export' pendenti e logga l'accesso in audit_log.
//
// v3 (M6 / DM6, RC-08): aggiunte le interazioni drops dell'utente
// (drop_comments, drop_likes, drop_saves) — i drops erano già inclusi (v1).
//
// v4 (M7 / MM4): aggiunte le sezioni Mappa della Città — map_presence (ultima
// posizione/sessione), map_events (bolle stanze Live/Echo dell'utente),
// map_safe_zones (zone personali). Sono TUTTI dati personali dell'utente (posizione
// e zone), quindi rientrano nel diritto di accesso art. 15. La posizione è
// effimera per natura: l'export fotografa lo stato al momento della richiesta
// (il cron di auto-expiry potrebbe averle già rimosse — sezioni vuote = nessuna
// condivisione attiva). La colonna geography passa dalla serializzazione nativa
// di PostgREST. Il consenso alla posizione (consent_type='location') è già incluso
// nella sezione `consents`.
//
// verify_jwt = true.
//   POST -> 200 { ok: true, exported_at, data: {...} }
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient, userClient } from "../_shared/clients.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const { data: userData } = await userClient(authHeader).auth.getUser();
  const user = userData?.user;
  if (!user) return jsonResponse({ error: "unauthorized" }, 401);
  const uid = user.id;

  const db = adminClient();

  // Raccolta parallela di tutti i domini che riguardano l'utente.
  const [
    profile, profilePrivate, consents, auraEvents, auraSnapshots,
    friendships, messages, drops, propsGiven, propsReceived,
    achievements, wallet, txFrom, txTo, earnings, devices, reports, gdprReqs,
    savedMessages, convMemberships, contactHashes, messageReactions,
    dropComments, dropLikes, dropSaves,
    mapPresence, mapEvents, mapSafeZones,
  ] = await Promise.all([
    db.from("profiles").select("*").eq("id", uid).maybeSingle(),
    db.from("profiles_private").select("*").eq("id", uid).maybeSingle(),
    db.from("consents").select("*").eq("user_id", uid),
    db.from("aura_events").select("*").eq("user_id", uid),
    db.from("aura_snapshots").select("*").eq("user_id", uid),
    db.from("friendships").select("*").or(`user_id.eq.${uid},friend_id.eq.${uid}`),
    db.from("messages").select("*").eq("sender_id", uid),
    db.from("drops").select("*").eq("author_id", uid),
    db.from("props").select("*").eq("giver", uid),
    db.from("props").select("*").eq("recipient", uid),
    db.from("user_achievements").select("*").eq("user_id", uid),
    db.from("wallets").select("*").eq("user_id", uid).maybeSingle(),
    db.from("vibe_transactions").select("*").eq("from_user", uid),
    db.from("vibe_transactions").select("*").eq("to_user", uid),
    db.from("creator_earnings").select("*").eq("user_id", uid).maybeSingle(),
    db.from("devices").select("*").eq("user_id", uid),
    db.from("reports").select("*").eq("reporter_id", uid),
    db.from("gdpr_requests").select("*").eq("user_id", uid),
    // Tabelle chat aggiunte in CM1 (RC-12): bookmark, membership, hash rubrica.
    db.from("saved_messages").select("*").eq("user_id", uid),
    db.from("conversation_members").select("*").eq("user_id", uid),
    db.from("contact_hashes").select("*").eq("user_id", uid),
    // CM8: reazioni emoji proprie (CM4) — simmetria con process_account_deletion.
    // conversations/streaks NO: dati di gruppo non personali, le membership
    // proprie sono già esportate sopra.
    db.from("message_reactions").select("*").eq("user_id", uid),
    // M6 (RC-08): interazioni drops proprie, anche su drop altrui. I drops sono
    // già inclusi sopra (autore); qui i commenti/like/salvataggi dell'utente.
    db.from("drop_comments").select("*").eq("author_id", uid),
    db.from("drop_likes").select("*").eq("user_id", uid),
    db.from("drop_saves").select("*").eq("user_id", uid),
    // M7 (MM4): Mappa della Città — posizione/sessione, eventi georiferiti e zone
    // personali dell'utente (art. 15). Effimeri: sezioni vuote = niente condivisione.
    db.from("map_presence").select("*").eq("user_id", uid).maybeSingle(),
    db.from("map_events").select("*").eq("user_id", uid),
    db.from("map_safe_zones").select("*").eq("user_id", uid),
  ]);

  const data = {
    profile: profile.data,
    profile_private: profilePrivate.data,
    consents: consents.data ?? [],
    aura_events: auraEvents.data ?? [],
    aura_snapshots: auraSnapshots.data ?? [],
    friendships: friendships.data ?? [],
    messages: messages.data ?? [],
    drops: drops.data ?? [],
    props_given: propsGiven.data ?? [],
    props_received: propsReceived.data ?? [],
    achievements: achievements.data ?? [],
    wallet: wallet.data,
    vibe_transactions: [...(txFrom.data ?? []), ...(txTo.data ?? [])],
    creator_earnings: earnings.data,
    devices: devices.data ?? [],
    reports: reports.data ?? [],
    gdpr_requests: gdprReqs.data ?? [],
    saved_messages: savedMessages.data ?? [],
    conversation_memberships: convMemberships.data ?? [],
    contact_hashes: contactHashes.data ?? [],
    message_reactions: messageReactions.data ?? [],
    drop_comments: dropComments.data ?? [],
    drop_likes: dropLikes.data ?? [],
    drop_saves: dropSaves.data ?? [],
    map_presence: mapPresence.data,
    map_events: mapEvents.data ?? [],
    map_safe_zones: mapSafeZones.data ?? [],
  };

  // Marca completate le richieste di export pendenti + audit.
  await db
    .from("gdpr_requests")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("user_id", uid).eq("kind", "export").eq("status", "pending");

  await db.rpc("log_audit", {
    p_action: "gdpr_export",
    p_target_type: "user",
    p_target_id: uid,
    p_meta: {},
  });

  return jsonResponse({ ok: true, exported_at: new Date().toISOString(), data });
});
