// =============================================================================
// verify-invite — attiva l'account validando il codice invito + età (>=16).
// =============================================================================
// Punto d'ingresso HTTP per la redenzione invito. La logica vera (atomica) sta
// nella RPC public.redeem_invite, eseguita con il JWT dell'utente (RLS-aware).
//
// Contratto:
//   POST { "code": "TERNI-XXXX" }  con header Authorization: Bearer <jwt>
//   200  -> { ok: true, school_id, age_verified } | { ok: true, already_verified }
//   4xx  -> { error: "<codice>" }
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { userClient } from "../_shared/clients.ts";

// Mappa gli errori della RPC a status HTTP sensati.
const STATUS_BY_ERROR: Record<string, number> = {
  not_authenticated: 401,
  profile_not_found: 404,
  invite_invalid: 404,
  invite_expired: 410,
  invite_exhausted: 409,
  age_below_minimum: 403,
};

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

  let body: { code?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }

  const code = body.code?.trim();
  if (!code) {
    return jsonResponse({ error: "missing_code" }, 400);
  }

  const supabase = userClient(authHeader);
  const { data, error } = await supabase.rpc("redeem_invite", { p_code: code });

  if (error) {
    const key = error.message.replace(/^.*:\s*/, "").trim();
    return jsonResponse({ error: key }, STATUS_BY_ERROR[key] ?? 400);
  }

  return jsonResponse(data, 200);
});
