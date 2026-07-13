// =============================================================================
// login-alert — notifica "nuovo accesso al tuo account" (M13/P6, audit §5.2).
// =============================================================================
// Chiamata FIRE-AND-FORGET dal client dopo un login con password riuscito (MAI
// su restore di sessione o TOKEN_REFRESHED). Ricava l'utente dal JWT, stima la
// CITTÀ dal primo hop di x-forwarded-for via https://ipwho.is (best-effort,
// decisione PO AH-3: timeout stretto, nessuna dipendenza dura da terzi — senza
// città la notifica esce comunque col solo nome del dispositivo) e accoda via
// RPC enqueue_login_alert (SECURITY DEFINER, eseguibile SOLO da service_role),
// che dedupa lo stesso install_id entro 1 ora. L'IP NON viene mai persistito
// né loggato: vive solo nella memoria di questa richiesta.
//
// Contratto (verify_jwt=true):
//   POST { install_id, device_label? } con Authorization: Bearer <jwt>
//   200 -> { ok: true } (anche quando la geo fallisce o la riga è dedupata)
//   4xx/5xx -> { error: "<codice>" }
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient, userClient } from "../_shared/clients.ts";

const GEO_TIMEOUT_MS = 1200;

/** Primo hop di x-forwarded-for = IP del client (gli altri sono i proxy). */
function clientIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for") ?? "";
  const first = xff.split(",")[0]?.trim() ?? "";
  return first.length > 0 ? first : null;
}

/** Città stimata dall'IP, best-effort: null su timeout/errore/IP non pubblico. */
async function cityFromIp(ip: string): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), GEO_TIMEOUT_MS);
    const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, {
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const json = await res.json().catch(() => null) as
      | { success?: boolean; city?: string }
      | null;
    // ipwho.is risponde 200 anche sugli errori: `success: false` (IP privato,
    // riservato, quota) → nessuna città, la notifica degrada al testo generico.
    if (!json || json.success === false) return null;
    const city = (json.city ?? "").trim();
    return city.length > 0 ? city : null;
  } catch {
    return null; // timeout/rete: la notifica esce senza città (AH-3)
  }
}

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

  let body: { install_id?: string; device_label?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }
  const installId = (body.install_id ?? "").trim();
  if (installId.length === 0 || installId.length > 64) {
    return jsonResponse({ error: "invalid_install_id" }, 400);
  }
  const deviceLabel = (body.device_label ?? "").trim().slice(0, 64) || null;

  // 1) Identità del chiamante dal JWT (userClient → auth.uid reale).
  const { data: userData, error: userErr } = await userClient(authHeader).auth
    .getUser();
  if (userErr || !userData.user) {
    return jsonResponse({ error: "not_authenticated" }, 401);
  }

  // 2) Geo best-effort dall'IP — mai persistito, mai bloccante.
  const ip = clientIp(req);
  const city = ip ? await cityFromIp(ip) : null;

  // 3) Accodamento sulla pipeline push esistente (dedup 1h lato RPC).
  const { error: rpcErr } = await adminClient().rpc("enqueue_login_alert", {
    p_user: userData.user.id,
    p_install_id: installId,
    p_device_label: deviceLabel,
    p_city: city,
  });
  if (rpcErr) {
    console.error("enqueue_login_alert_failed", rpcErr.message);
    return jsonResponse({ error: "enqueue_failed" }, 500);
  }

  return jsonResponse({ ok: true });
});
