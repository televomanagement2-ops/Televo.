// =============================================================================
// livekit-token — emette un token LiveKit FIRMATO SERVER-SIDE.
// =============================================================================
// UN solo punto di mint per i due domini che coesistono (L-2, live.md §15.7):
//   * Stanze Live audio (`rooms`, Fase 3)  → body { room_id }
//   * Live video personale (`lives`, M12)  → body { live_id }
// Mai generare token lato client: la chiave/segreto LiveKit restano nei secret.
//
// Ramo rooms (invariato): permessi dal ruolo (host/speaker pubblicano,
// listener solo ascolta); stanze private solo per host/partecipanti.
//
// Ramo live (M12/LM4, live.md §15.3):
//   * live joinable in stato live/paused ('ended' → 409 live_not_joinable —
//     entrare in pausa è previsto: lo spettatore vede "Live in pausa", §12.19);
//   * host o co-host ATTIVO → canPublish; il co-host 'invited' NON pubblica
//     finché non accetta (il suo token è da spettatore);
//   * chiunque altro passa dall'UNICO predicato can_see_live (amici degli host
//     attivi L-3, top_friends, bloccati e KICKATI esclusi) → 403 forbidden;
//   * IL MINT È IL JOIN: upsert in live_viewers con rientro (left_at azzerato).
//     Una chiamata sola, e ogni ricontrollo di visibilità (revalidation,
//     reconnect a token scaduto) passa da qui — il rientro post-kick muore qui.
//
// Contratto:
//   POST { "room_id": "<uuid>" } XOR { "live_id": "<uuid>" }
//        con header Authorization: Bearer <jwt>
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

  let body: { room_id?: string; live_id?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }
  const roomId = body.room_id?.trim();
  const liveId = body.live_id?.trim();
  if (!roomId && !liveId) {
    return jsonResponse({ error: "missing_room_id" }, 400);
  }
  if (roomId && liveId) {
    return jsonResponse({ error: "ambiguous_target" }, 400);
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

  // Nome stanza LiveKit e permesso di publish, decisi dal ramo di dominio.
  let livekitRoomName: string;
  let canPublish: boolean;

  if (liveId) {
    // ------------------------- Ramo LIVE (M12) ------------------------------
    const { data: live } = await admin
      .from("lives")
      .select("id, host_id, status, livekit_room_name")
      .eq("id", liveId)
      .maybeSingle();
    if (!live) {
      return jsonResponse({ error: "live_not_found" }, 404);
    }
    if (live.status === "ended") {
      return jsonResponse({ error: "live_not_joinable" }, 409);
    }

    const { data: hostRow } = await admin
      .from("live_hosts")
      .select("role, status")
      .eq("live_id", liveId)
      .eq("user_id", userId)
      .maybeSingle();

    if (hostRow?.status === "active") {
      // Host principale o co-host attivo: pubblica. Se prima era entrato da
      // spettatore (co-host che accetta a metà live), la sua riga viewer si
      // chiude: un host attivo non è uno spettatore (contatori onesti).
      canPublish = true;
      await admin
        .from("live_viewers")
        .update({ left_at: new Date().toISOString() })
        .eq("live_id", liveId)
        .eq("user_id", userId)
        .is("left_at", null);
    } else {
      // Spettatore (incluso co-host 'invited'/'left'): l'UNICO predicato del
      // dominio decide — kickati, rimossi, bloccati e non-amici muoiono qui.
      const { data: visible, error: visErr } = await admin.rpc("can_see_live", {
        p_live: liveId,
        p_viewer: userId,
      });
      if (visErr || !visible) {
        return jsonResponse({ error: "forbidden" }, 403);
      }
      canPublish = false;

      // IL MINT È IL JOIN (§5): spettatore reale a DB, rientro con left_at
      // azzerato. joined_at resta quello del primo ingresso (solo default
      // all'insert); kicked_at qui è sempre null (il predicato ha già negato).
      const { error: joinErr } = await admin
        .from("live_viewers")
        .upsert(
          { live_id: liveId, user_id: userId, left_at: null },
          { onConflict: "live_id,user_id" },
        );
      if (joinErr) {
        return jsonResponse({ error: "join_failed" }, 500);
      }
    }

    livekitRoomName = live.livekit_room_name;
  } else {
    // ------------------------- Ramo ROOMS (Fase 3) --------------------------
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

    canPublish = isHost ||
      participant?.role === "host" ||
      participant?.role === "speaker";
    livekitRoomName = room.livekit_room_name;
  }

  // 4) Mint del token LiveKit (identico per i due domini; i dati in-stanza
  //    li pubblica solo chi pubblica media — gli spettatori sono subscribe-only).
  const at = new AccessToken(apiKey, apiSecret, {
    identity: userId,
    name: profile.username,
    ttl: "1h",
  });
  at.addGrant({
    roomJoin: true,
    room: livekitRoomName,
    canPublish,
    canSubscribe: true,
    canPublishData: canPublish,
  });
  const token = await at.toJwt();

  return jsonResponse({
    token,
    ws_url: wsUrl,
    room: livekitRoomName,
    identity: userId,
    can_publish: canPublish,
  });
});
