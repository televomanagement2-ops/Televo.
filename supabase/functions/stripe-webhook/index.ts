// =============================================================================
// stripe-webhook — conferma idempotente dei pagamenti Stripe. INERTE oggi.
// =============================================================================
// Verifica la FIRMA dell'evento (Stripe-Signature, HMAC-SHA256 sullo schema
// "t=...,v1=...") e accredita le Vibes reali in modo idempotente al
// payment_intent.succeeded. Finché STRIPE_WEBHOOK_SECRET è assente risponde
// 'stripe_not_configured'. Tutta la logica di firma/idempotenza è già pronta
// per il 2027.
//
// verify_jwt = false (lo chiama Stripe, non un utente): l'autenticità è data
// dalla verifica della firma, non dal JWT.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient } from "../_shared/clients.ts";

// Verifica la firma Stripe (HMAC-SHA256) con tolleranza temporale anti-replay.
async function verifyStripeSignature(
  payload: string,
  sigHeader: string,
  secret: string,
  toleranceSec = 300,
): Promise<boolean> {
  const parts = Object.fromEntries(
    sigHeader.split(",").map((kv) => kv.split("=") as [string, string]),
  );
  const timestamp = parts["t"];
  const expected = parts["v1"];
  if (!timestamp || !expected) return false;

  // Anti-replay: rifiuta eventi troppo vecchi.
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > toleranceSec) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${payload}`),
  );
  const digest = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");

  // Confronto a tempo costante.
  if (digest.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < digest.length; i++) diff |= digest.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!webhookSecret) {
    return jsonResponse({ error: "stripe_not_configured" }, 501);
  }

  const sig = req.headers.get("Stripe-Signature");
  const raw = await req.text();
  if (!sig || !(await verifyStripeSignature(raw, sig, webhookSecret))) {
    return jsonResponse({ error: "invalid_signature" }, 400);
  }

  let event: { type?: string; data?: { object?: Record<string, unknown> } };
  try {
    event = JSON.parse(raw);
  } catch {
    return jsonResponse({ error: "invalid_payload" }, 400);
  }

  const db = adminClient();

  if (event.type === "payment_intent.succeeded") {
    const pi = event.data?.object as { id?: string; metadata?: { vibes?: string } } | undefined;
    if (!pi?.id) return jsonResponse({ ok: true });

    // Idempotenza: completa solo le transazioni ancora 'pending'.
    const { data: tx } = await db
      .from("vibe_transactions")
      .select("id, to_user, amount, status")
      .eq("stripe_payment_intent", pi.id)
      .maybeSingle();

    if (tx && tx.status === "pending") {
      await db
        .from("vibe_transactions")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", tx.id)
        .eq("status", "pending"); // guard idempotente

      // Accredita il wallet reale (gate 18+ ridondante a livello DB).
      const { data: wallet } = await db
        .from("wallets")
        .select("balance_real")
        .eq("user_id", tx.to_user)
        .maybeSingle();
      await db
        .from("wallets")
        .update({ balance_real: Number(wallet?.balance_real ?? 0) + Number(tx.amount) })
        .eq("user_id", tx.to_user);

      await db.rpc("log_audit", {
        p_action: "vibe_purchase_completed",
        p_target_type: "vibe_transaction",
        p_target_id: tx.id,
        p_meta: { payment_intent: pi.id, amount: tx.amount },
      });
    }
  }

  return jsonResponse({ ok: true });
});
