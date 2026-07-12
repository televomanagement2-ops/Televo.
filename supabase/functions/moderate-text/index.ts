// =============================================================================
// moderate-text — analisi tossicità di un testo (Perspective API) + accodamento.
// =============================================================================
// Pensata per essere chiamata su contenuti a rischio (testo di un drop/message,
// bio, contenuto segnalato). Comportamento:
//   * Con PERSPECTIVE_API_KEY: chiede i punteggi, li scrive in moderation_queue
//     via enqueue_moderation (che applica un mute soft automatico oltre soglia),
//     e ritorna { allowed } al client.
//   * Senza chiave (degrado): NON crasha. Accoda un elemento per revisione umana
//     (scores vuoti) e ritorna allowed=true (non blocca, fallback umano).
//
// verify_jwt = true → solo utenti autenticati. Le scritture usano adminClient
// (RLS sulla coda è moderator-only). enqueue_moderation è SECURITY DEFINER.
//
// Contratto:
//   POST { text, target_type: 'message'|'drop'|'drop_comment'|'user'|'room'
//                             |'live'|'live_comment', target_id }
//   200 -> { ok, allowed, degraded, severity, scores }
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient, userClient } from "../_shared/clients.ts";

const PERSPECTIVE_URL =
  "https://commentanalyzer.googleapis.com/v1alpha1/comments:analyze";
const ATTRS = ["TOXICITY", "SEVERE_TOXICITY", "INSULT", "THREAT", "PROFANITY", "IDENTITY_ATTACK"];
const SOFT_THRESHOLD = 0.8; // sopra questa soglia il client dovrebbe bloccare/avvertire

async function perspectiveScores(text: string, key: string): Promise<Record<string, number>> {
  const res = await fetch(`${PERSPECTIVE_URL}?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      comment: { text: text.slice(0, 3000) },
      languages: ["it", "en"],
      requestedAttributes: Object.fromEntries(ATTRS.map((a) => [a, {}])),
      doNotStore: true,
    }),
  });
  if (!res.ok) throw new Error(`perspective_${res.status}`);
  const json = await res.json();
  const out: Record<string, number> = {};
  for (const a of ATTRS) {
    const v = json?.attributeScores?.[a]?.summaryScore?.value;
    if (typeof v === "number") out[a] = v;
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  // Identità del chiamante (verify_jwt=true garantisce un JWT valido).
  const authHeader = req.headers.get("Authorization") ?? "";
  const { data: userData } = await userClient(authHeader).auth.getUser();
  if (!userData?.user) return jsonResponse({ error: "unauthorized" }, 401);

  let payload: { text?: string; target_type?: string; target_id?: string };
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "invalid_body" }, 400);
  }
  const text = (payload.text ?? "").trim();
  const targetType = payload.target_type ?? "message";
  const targetId = payload.target_id ?? null;
  if (!text) return jsonResponse({ error: "text_required" }, 400);
  // M12/LM4: +live/live_comment (commenti in diretta, §6). Già che siamo qui:
  // +drop_comment, che il client M6 invia da sempre ma l'array non ammetteva
  // (il fire-and-forget inghiottiva il 400 — bug latente, enum DB già pronto).
  if (
    !["user", "room", "message", "drop", "drop_comment", "live", "live_comment"]
      .includes(targetType)
  ) {
    return jsonResponse({ error: "invalid_target_type" }, 400);
  }

  const key = Deno.env.get("PERSPECTIVE_API_KEY");
  const db = adminClient();

  // --- Degrado con grazia: nessuna chiave -> revisione umana, nessun blocco. ---
  if (!key) {
    if (targetId) {
      await db.rpc("enqueue_moderation", {
        p_target_type: targetType,
        p_target_id: targetId,
        p_excerpt: text,
        p_scores: {},
      });
    }
    return jsonResponse({ ok: true, allowed: true, degraded: true, severity: 0, scores: {} });
  }

  // --- Percorso AI ---
  let scores: Record<string, number>;
  try {
    scores = await perspectiveScores(text, key);
  } catch (e) {
    // Errore upstream: degrada (accoda per revisione umana, non blocca).
    console.error("perspective_error", String(e));
    if (targetId) {
      await db.rpc("enqueue_moderation", {
        p_target_type: targetType,
        p_target_id: targetId,
        p_excerpt: text,
        p_scores: {},
      });
    }
    return jsonResponse({ ok: true, allowed: true, degraded: true, severity: 0, scores: {} });
  }

  const severity = scores.TOXICITY ?? 0;

  // Accoda + eventuale mute soft automatico (gestito server-side).
  if (targetId && severity >= 0.5) {
    await db.rpc("enqueue_moderation", {
      p_target_type: targetType,
      p_target_id: targetId,
      p_excerpt: text,
      p_scores: scores,
    });
  }

  return jsonResponse({
    ok: true,
    allowed: severity < SOFT_THRESHOLD,
    degraded: false,
    severity,
    scores,
  });
});
