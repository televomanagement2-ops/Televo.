// =============================================================================
// aura-recompute — trigger HTTP del ricalcolo Aura.
// =============================================================================
// Lo scheduling ricorrente è gestito da pg_cron (aura-recompute-weekly) che
// chiama direttamente public.recompute_aura(). Questa funzione è un entry point
// per trigger manuali/esterni, protetto da header x-cron-secret.
//
// Contratto:
//   POST  con header x-cron-secret: <CRON_SECRET>
//   200 -> { ok: true } | 401/500 -> { error }
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient } from "../_shared/clients.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  const secret = Deno.env.get("CRON_SECRET");
  if (!secret || req.headers.get("x-cron-secret") !== secret) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  const { error } = await adminClient().rpc("recompute_aura");
  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }
  return jsonResponse({ ok: true });
});
