// =============================================================================
// create-vibe-purchase — acquisto di Vibes REALI con Stripe (18+). INERTE oggi.
// =============================================================================
// Struttura completa e pronta per il 2027: gate 18+ (verificato lato DB via
// is_adult), cliente Stripe idempotente, PaymentIntent con idempotency-key,
// registrazione della transazione 'real' in stato 'pending'. Finché
// STRIPE_SECRET_KEY è assente risponde 'stripe_not_configured' (nessun flusso
// monetario attivo: i minori non sono mai coinvolti).
//
// verify_jwt = true.
// Contratto:
//   POST { amount, idempotency_key }
//   200 -> { client_secret, transaction_id } | 403 minorenne | 501 inerte
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient, userClient } from "../_shared/clients.ts";

const PLATFORM_FEE_RATE = 0.20; // commissione piattaforma sul reale (creator economy 2027)

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

  let body: { amount?: number; idempotency_key?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "invalid_body" }, 400);
  }
  const amount = body.amount ?? 0;
  if (!Number.isFinite(amount) || amount <= 0) {
    return jsonResponse({ error: "invalid_amount" }, 400);
  }
  if (!body.idempotency_key) {
    return jsonResponse({ error: "idempotency_key_required" }, 400);
  }

  const db = adminClient();

  // --- Gate 18+ (autorità: la birth_date privata, via is_adult lato DB). ---
  const { data: isAdult, error: adultErr } = await db.rpc("is_adult", { uid: user.id });
  if (adultErr) return jsonResponse({ error: adultErr.message }, 500);
  if (!isAdult) return jsonResponse({ error: "adults_only" }, 403);

  // --- Stripe inerte finché non è configurato (lancio reale 2027). ---
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) {
    return jsonResponse({ error: "stripe_not_configured" }, 501);
  }

  // === Da qui in poi: percorso reale (attivo solo nel 2027). ===
  // Idempotenza applicativa: se la transazione per questa chiave esiste, riusala.
  const { data: existing } = await db
    .from("vibe_transactions")
    .select("id, stripe_payment_intent")
    .eq("idempotency_key", body.idempotency_key)
    .maybeSingle();
  if (existing) {
    return jsonResponse({ ok: true, transaction_id: existing.id, reused: true });
  }

  // 1) Cliente Stripe (creato una volta, salvato in stripe_customers).
  let customerId: string | null = null;
  const { data: customerRow } = await db
    .from("stripe_customers")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();
  customerId = customerRow?.stripe_customer_id ?? null;

  if (!customerId) {
    const custRes = await fetch("https://api.stripe.com/v1/customers", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${stripeKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ "metadata[user_id]": user.id }),
    });
    if (!custRes.ok) return jsonResponse({ error: "stripe_customer_failed" }, 502);
    const cust = await custRes.json();
    customerId = cust.id;
    await db.from("stripe_customers").insert({ user_id: user.id, stripe_customer_id: customerId });
  }

  // 2) PaymentIntent (importo in centesimi; idempotency-key Stripe).
  const amountCents = Math.round(amount * 100);
  const piRes = await fetch("https://api.stripe.com/v1/payment_intents", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${stripeKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": body.idempotency_key,
    },
    body: new URLSearchParams({
      amount: String(amountCents),
      currency: "eur",
      customer: customerId!,
      "metadata[user_id]": user.id,
      "metadata[vibes]": String(amount),
    }),
  });
  if (!piRes.ok) return jsonResponse({ error: "stripe_intent_failed" }, 502);
  const pi = await piRes.json();

  // 3) Transazione 'real' in 'pending' (verrà completata dal webhook firmato).
  const { data: tx, error: txErr } = await db
    .from("vibe_transactions")
    .insert({
      from_user: user.id,
      to_user: user.id, // acquisto: crediti al proprio wallet reale
      amount,
      currency_type: "real",
      kind: "gift",
      status: "pending",
      stripe_payment_intent: pi.id,
      idempotency_key: body.idempotency_key,
    })
    .select("id")
    .single();
  if (txErr) return jsonResponse({ error: txErr.message }, 500);

  return jsonResponse({
    ok: true,
    transaction_id: tx.id,
    client_secret: pi.client_secret,
    platform_fee_rate: PLATFORM_FEE_RATE,
  });
});
