// =============================================================================
// live-kick — rimozione forzata di uno spettatore o co-host da una Live (M12).
// =============================================================================
// Solo l'host PRINCIPALE. Ordine NON negoziabile (live.md §15.3): DB PRIMA,
// media DOPO — prima si chiude la visibilità a livello dati (kicked_at /
// status='removed': can_see_live e il mint del token negano da subito il
// rientro), POI si taglia il media su LiveKit con removeParticipant. Se la
// seconda fallisce il predicato ha già chiuso e il retry è idempotente; il
// kickato cade comunque alla revalidation (~60s) o alla scadenza token (1h).
//
// Kick ≠ block (§11): vale per QUESTA live; il blocco è block_user. Nessuna
// notifica al kickato (§9). Il kick "preventivo" (spettatore mai entrato) è
// consentito: la riga viewer nasce direttamente kickata — meno aperto.
//
// Contratto (verify_jwt=true):
//   POST { live_id, user_id, scope: 'viewer'|'cohost' }
//        con header Authorization: Bearer <jwt dell'host>
//   200  -> { ok: true, media_removed: boolean }
//   4xx  -> { error: "<codice>" }
import { RoomServiceClient } from "npm:livekit-server-sdk@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient, userClient } from "../_shared/clients.ts";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  let body: { live_id?: string; user_id?: string; scope?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }
  const liveId = body.live_id?.trim() ?? "";
  const targetId = body.user_id?.trim() ?? "";
  const scope = body.scope?.trim() ?? "";
  if (!UUID_RE.test(liveId) || !UUID_RE.test(targetId)) {
    return jsonResponse({ error: "invalid_target" }, 400);
  }
  if (scope !== "viewer" && scope !== "cohost") {
    return jsonResponse({ error: "invalid_scope" }, 400);
  }

  // 1) Identità del chiamante dal JWT.
  const { data: userData, error: userErr } = await userClient(authHeader).auth
    .getUser();
  if (userErr || !userData.user) {
    return jsonResponse({ error: "not_authenticated" }, 401);
  }
  const callerId = userData.user.id;

  const admin = adminClient();

  // 2) Guardie: la live esiste, non è finita, il chiamante è l'host
  //    PRINCIPALE, il bersaglio non è l'host stesso.
  const { data: live } = await admin
    .from("lives")
    .select("id, host_id, status, livekit_room_name")
    .eq("id", liveId)
    .maybeSingle();
  if (!live) {
    return jsonResponse({ error: "live_not_found" }, 404);
  }
  if (live.host_id !== callerId) {
    return jsonResponse({ error: "not_live_host" }, 403);
  }
  if (live.status === "ended") {
    return jsonResponse({ error: "live_already_ended" }, 409);
  }
  if (targetId === live.host_id) {
    return jsonResponse({ error: "invalid_target" }, 400);
  }

  // 3) DB PRIMA: la visibilità si chiude qui, in modo idempotente.
  const nowIso = new Date().toISOString();
  if (scope === "viewer") {
    // Upsert: marca il kick preservando joined_at (default solo all'insert).
    const { error: kickErr } = await admin
      .from("live_viewers")
      .upsert(
        { live_id: liveId, user_id: targetId, kicked_at: nowIso, kicked_by: callerId },
        { onConflict: "live_id,user_id" },
      );
    if (kickErr) {
      return jsonResponse({ error: "kick_failed" }, 500);
    }
  } else {
    // Co-host → 'removed' (revoca invito o rimozione attiva; non rientra,
    // §0.4). Specchio della RPC live_remove_cohost, via admin.
    const { data: cohost } = await admin
      .from("live_hosts")
      .select("role, status, left_at")
      .eq("live_id", liveId)
      .eq("user_id", targetId)
      .maybeSingle();
    if (!cohost || cohost.role !== "cohost") {
      return jsonResponse({ error: "not_cohost" }, 404);
    }
    if (cohost.status !== "removed") {
      const { error: remErr } = await admin
        .from("live_hosts")
        .update({ status: "removed", left_at: cohost.left_at ?? nowIso })
        .eq("live_id", liveId)
        .eq("user_id", targetId);
      if (remErr) {
        return jsonResponse({ error: "kick_failed" }, 500);
      }
    }
  }

  // 4) Media DOPO: taglio immediato su LiveKit (best-effort — un partecipante
  //    già disconnesso non è un errore; il predicato ha comunque già chiuso).
  let mediaRemoved = false;
  try {
    const roomService = new RoomServiceClient(
      wsUrl.replace(/^ws/, "http"),
      apiKey,
      apiSecret,
    );
    await roomService.removeParticipant(live.livekit_room_name, targetId);
    mediaRemoved = true;
  } catch (e) {
    console.error("livekit_remove_participant_failed", String(e));
  }

  return jsonResponse({ ok: true, media_removed: mediaRemoved });
});
