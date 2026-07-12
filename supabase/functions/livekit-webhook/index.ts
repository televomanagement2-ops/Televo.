// =============================================================================
// livekit-webhook — riconciliazione server-side del ciclo di vita Live (M12).
// =============================================================================
// Endpoint per i webhook di LiveKit Cloud. verify_jwt=false: l'autenticità è
// di LiveKit, NON di un utente — la firma è verificata con WebhookReceiver
// (stessa API key/secret del mint; l'header Authorization contiene un JWT il
// cui claim sha256 deve combaciare con l'hash del body). Niente x-cron-secret.
//
// Eventi gestiti (live.md §15.3; tutto il resto è ignorato con 200):
//   * participant_left → riconcilia lo spettatore/co-host caduto in silenzio
//     (left_at / status='left') — specchio di live_leave, che il client chiama
//     best-effort. L'host PRINCIPALE non si tocca: può riconnettersi; se non
//     torna, room_finished (empty timeout) o le reti cron chiudono la live.
//   * room_finished → end della live server-side, idempotente se già 'ended'.
//     L'UPDATE di stato è la via unica (pattern expire_content v7): la macchina
//     a stati valorizza ended_at e gli after-trigger di dominio girano da soli
//     (badge mappa → Echo 3h, premio Aura se qualificata). NESSUN fan-out
//     live_ended nei force-end: snapshot-as-truth (scelta del piano, end_live v2).
//
// Solo stanze `live_*` (le Stanze audio usano `televo_*` e hanno il loro
// lifecycle — L-2: domini paralleli). Handler idempotenti: il sistema resta
// corretto anche SENZA webhook (reti di sicurezza LM3), solo più lento.
//
// Contratto:
//   POST <body LiveKit application/webhook+json> + header Authorization
//   200 -> { ok: true [, ignored: true] }    401/… -> { error: "<codice>" }
import { WebhookReceiver } from "npm:livekit-server-sdk@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient } from "../_shared/clients.ts";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  const apiKey = Deno.env.get("LIVEKIT_API_KEY");
  const apiSecret = Deno.env.get("LIVEKIT_API_SECRET");
  if (!apiKey || !apiSecret) {
    return jsonResponse({ error: "livekit_not_configured" }, 500);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ error: "missing_authorization" }, 401);
  }

  // 1) Verifica della firma: WebhookReceiver valida il JWT e l'hash del body.
  //    Un body manomesso o una chiave diversa → eccezione → 401.
  const raw = await req.text();
  let event;
  try {
    const receiver = new WebhookReceiver(apiKey, apiSecret);
    event = await receiver.receive(raw, authHeader);
  } catch (e) {
    console.error("livekit_webhook_invalid", String(e));
    return jsonResponse({ error: "invalid_signature" }, 401);
  }

  // 2) Solo il dominio Live: le stanze audio (televo_*) hanno il loro lifecycle.
  const roomName = event.room?.name ?? "";
  if (!roomName.startsWith("live_")) {
    return jsonResponse({ ok: true, ignored: true });
  }

  const db = adminClient();
  const { data: live } = await db
    .from("lives")
    .select("id, status")
    .eq("livekit_room_name", roomName)
    .maybeSingle();
  if (!live) {
    // Live già purgata (minimizzazione 30gg) o stanza sconosciuta: no-op.
    return jsonResponse({ ok: true, ignored: true });
  }

  const nowIso = new Date().toISOString();

  if (event.event === "participant_left") {
    // identity = user_id (così viene mintato il token); tutto il resto è
    // ignorato (egress/ingress o identity non-uuid non toccano il DB).
    const identity = event.participant?.identity ?? "";
    if (!UUID_RE.test(identity)) {
      return jsonResponse({ ok: true, ignored: true });
    }

    // Spettatore caduto → left_at (il kickato resta kickato: filtro esplicito).
    await db
      .from("live_viewers")
      .update({ left_at: nowIso })
      .eq("live_id", live.id)
      .eq("user_id", identity)
      .is("left_at", null)
      .is("kicked_at", null);

    // Co-host ATTIVO caduto → 'left' (come live_leave); può essere re-invitato.
    await db
      .from("live_hosts")
      .update({ status: "left", left_at: nowIso })
      .eq("live_id", live.id)
      .eq("user_id", identity)
      .eq("role", "cohost")
      .eq("status", "active");
  } else if (event.event === "room_finished") {
    // End server-side idempotente: il filtro di stato rende il retry un no-op
    // (l'UPDATE su una live già 'ended' verrebbe rifiutato dal trigger).
    if (live.status !== "ended") {
      const { error: endErr } = await db
        .from("lives")
        .update({ status: "ended" })
        .eq("id", live.id)
        .neq("status", "ended");
      if (endErr) {
        console.error("livekit_webhook_end_failed", endErr.message);
        return jsonResponse({ error: "end_failed" }, 500);
      }
    }
  }

  return jsonResponse({ ok: true });
});
