// =============================================================================
// livekit-token — emette un token LiveKit FIRMATO SERVER-SIDE per una stanza.
// =============================================================================
// Mai generare token lato client: la chiave/segreto LiveKit restano nei secret.
// Permessi (publish) decisi dal ruolo: host/speaker pubblicano, listener solo
// ascolta. Richiede utente autenticato e verificato (>=16 + invito).
//
// Contratto:
//   POST { "room_id": "<uuid>" }  con header Authorization: Bearer <jwt>
//   200  -> { token, ws_url, room, identity, can_publish }
//   4xx  -> { error: "<codice>" }
import { AccessToken } from "npm:livekit-server-sdk@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient, userClient } from "../_shared/clients.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ error: "missing_authorization" }, 401);
  }

  const apiKey = Deno.env.get("LIVEKIT_API_KEY");
  const apiSecret = Deno.env.get("LIVEKIT_API_SECRET");
  const wsUrl = Deno.env.get("LIVEKIT_WS_URL");
  if (!apiKey || !apiSecret || !wsUrl) {
    return jsonResponse({ error: "livekit_not_configured" }, 500);
  }

  let body: { room_id?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }
  const roomId = body.room_id?.trim();
  if (!roomId) {
    return jsonResponse({ error: "missing_room_id" }, 400);
  }

  // 1) Identità del chiamante dal JWT.
  const { data: userData, error: userErr } = await userClient(authHeader).auth
    .getUser();
  if (userErr || !userData.user) {
    return jsonResponse({ error: "not_authenticated" }, 401);
  }
  const userId = userData.user.id;

  // 2) Lettura controllata via service_role (gate applicati a mano qui sotto).
  const admin = adminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("username, age_verified, deleted_at")
    .eq("id", userId)
    .maybeSingle();
  if (!profile || !profile.age_verified || profile.deleted_at) {
    return jsonResponse({ error: "user_not_active" }, 403);
  }

  const { data: room } = await admin
    .from("rooms")
    .select("id, host_id, status, visibility, livekit_room_name")
    .eq("id", roomId)
    .maybeSingle();
  if (!room) {
    return jsonResponse({ error: "room_not_found" }, 404);
  }
  if (room.status !== "live" && room.status !== "scheduled") {
    return jsonResponse({ error: "room_not_joinable" }, 409);
  }

  // 3) Partecipazione/ruolo.
  const { data: participant } = await admin
    .from("room_participants")
    .select("role, left_at")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .maybeSingle();

  const isHost = room.host_id === userId;

  // Le stanze private richiedono di essere host o partecipante.
  if (room.visibility === "private" && !isHost && !participant) {
    return jsonResponse({ error: "forbidden" }, 403);
  }

  const canPublish = isHost ||
    participant?.role === "host" ||
    participant?.role === "speaker";

  // 4) Mint del token LiveKit.
  const at = new AccessToken(apiKey, apiSecret, {
    identity: userId,
    name: profile.username,
    ttl: "1h",
  });
  at.addGrant({
    roomJoin: true,
    room: room.livekit_room_name,
    canPublish,
    canSubscribe: true,
    canPublishData: true,
  });
  const token = await at.toJwt();

  return jsonResponse({
    token,
    ws_url: wsUrl,
    room: room.livekit_room_name,
    identity: userId,
    can_publish: canPublish,
  });
});
