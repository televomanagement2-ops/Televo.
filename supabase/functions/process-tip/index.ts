// =============================================================================
// process-tip — invio di una "Vibe" (tip) tra utenti.
// =============================================================================
// Endpoint unico per i tip. Oggi è attivo SOLO il percorso simbolico (sicuro per
// i minori, niente denaro): delega all'RPC atomica/idempotente
// process_symbolic_tip eseguita con l'identità del chiamante (RLS-aware).
// Il percorso 'real' (denaro vero, 18+) passa da create-vibe-purchase + Stripe:
// qui resta inerte finché Stripe non è configurato (lancio 2027).
//
// verify_jwt = true.
// Contratto:
//   POST { to_user, amount, room_id?, currency_type?='symbolic', idempotency_key? }
//   200 -> { ok, transaction_id, idempotent } | 4xx/5xx -> { error }
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { userClient } from "../_shared/clients.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return jsonResponse({ error: "unauthorized" }, 401);

  let body: {
    to_user?: string;
    amount?: number;
    room_id?: string | null;
    currency_type?: string;
    idempotency_key?: string;
  };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "invalid_body" }, 400);
  }

  const currency = body.currency_type ?? "symbolic";
  if (currency === "real") {
    // Le Vibes reali si acquistano con Stripe (create-vibe-purchase): inerte ora.
    return jsonResponse({ error: "stripe_not_configured" }, 501);
  }
  if (currency !== "symbolic") {
    return jsonResponse({ error: "invalid_currency_type" }, 400);
  }
  if (!body.to_user || typeof body.amount !== "number") {
    return jsonResponse({ error: "missing_fields" }, 400);
  }

  const { data, error } = await userClient(authHeader).rpc("process_symbolic_tip", {
    p_to: body.to_user,
    p_amount: body.amount,
    p_room: body.room_id ?? null,
    p_idempotency_key: body.idempotency_key ?? null,
  });
  if (error) return jsonResponse({ error: error.message }, 400);
  return jsonResponse(data);
});
