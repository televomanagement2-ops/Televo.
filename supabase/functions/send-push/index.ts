// =============================================================================
// send-push — invio asincrono delle notifiche push (Expo).
// =============================================================================
// Preleva le notifiche con `pushed_at is null`, le invia ai dispositivi Expo
// registrati dell'utente e le marca come inviate. Idempotente per batch: marca
// SEMPRE le righe prelevate (anche per utenti senza device) così non vengono
// rilavorate all'infinito; restano comunque visibili in-app.
//
// Invocata da pg_cron → pg_net (dispatch_push) ogni minuto.
// Contratto:
//   POST con header x-cron-secret: <CRON_SECRET>
//   200 -> { ok: true, processed, sent } | 401/500 -> { error }
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient } from "../_shared/clients.ts";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const BATCH = 500; // notifiche per esecuzione
const CHUNK = 100; // messaggi per richiesta Expo

interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  payload: Record<string, unknown>;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

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

  const db = adminClient();

  // 1) Notifiche da inviare.
  const { data: notifs, error: nErr } = await db
    .from("notifications")
    .select("id, user_id, type, title, body, payload")
    .is("pushed_at", null)
    .order("created_at", { ascending: true })
    .limit(BATCH);
  if (nErr) return jsonResponse({ error: nErr.message }, 500);

  const rows = (notifs ?? []) as NotificationRow[];
  if (rows.length === 0) return jsonResponse({ ok: true, processed: 0, sent: 0 });

  // 2) Token dei dispositivi degli utenti coinvolti.
  const userIds = [...new Set(rows.map((r) => r.user_id))];
  const { data: devices, error: dErr } = await db
    .from("devices")
    .select("user_id, expo_push_token")
    .in("user_id", userIds);
  if (dErr) return jsonResponse({ error: dErr.message }, 500);

  const tokensByUser = new Map<string, string[]>();
  for (const d of devices ?? []) {
    const list = tokensByUser.get(d.user_id) ?? [];
    list.push(d.expo_push_token);
    tokensByUser.set(d.user_id, list);
  }

  // 3) Costruzione messaggi Expo.
  const messages = rows.flatMap((r) =>
    (tokensByUser.get(r.user_id) ?? []).map((to) => ({
      to,
      sound: "default",
      title: r.title,
      body: r.body ?? "",
      data: { type: r.type, notification_id: r.id, ...r.payload },
    }))
  );

  // 4) Invio a chunk di 100 (best effort: gli errori non bloccano la marcatura).
  let sent = 0;
  for (const part of chunk(messages, CHUNK)) {
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Accept-Encoding": "gzip, deflate",
        },
        body: JSON.stringify(part),
      });
      if (res.ok) sent += part.length;
      else console.error("expo_push_error", res.status, await res.text());
    } catch (e) {
      console.error("expo_push_exception", String(e));
    }
  }

  // 5) Marca come inviate TUTTE le righe prelevate (anti-reprocessing).
  const ids = rows.map((r) => r.id);
  const { error: uErr } = await db
    .from("notifications")
    .update({ pushed_at: new Date().toISOString() })
    .in("id", ids);
  if (uErr) return jsonResponse({ error: uErr.message }, 500);

  return jsonResponse({ ok: true, processed: rows.length, sent });
});
