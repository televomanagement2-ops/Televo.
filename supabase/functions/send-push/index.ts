// =============================================================================
// send-push v2 — invio asincrono delle notifiche push (Expo) — CM8.
// =============================================================================
// Preleva le notifiche con `pushed_at is null`, le invia ai dispositivi Expo
// registrati dell'utente e le marca come inviate. Novità v2 (tech-debt CM6):
//   • MARCATURA PER-CHUNK: si marcano solo le notifiche dei chunk ACCETTATI da
//     Expo — un blackout non brucia più il batch (prima si marcava tutto anche
//     su fallimento → notifiche perse per sempre). I 4xx (payload malformato,
//     permanente) si marcano comunque per non ritentare all'infinito.
//     Le notifiche di utenti SENZA device si marcano subito (anti-reprocessing,
//     come prima); duplicato possibile solo se si crasha tra accettazione Expo
//     e update: raro e accettato.
//   • PRUNING TOKEN MORTI: si leggono i ticket della risposta (stesso ordine
//     dei messaggi inviati) e i token con DeviceNotRegistered si cancellano da
//     `devices`.
//   • BADGE: campo `badge` per-messaggio = notifiche non lette del destinatario
//     (read_at is null, indice parziale esistente). È un proxy del badge in-app
//     (somma unread chat): il client riallinea con setBadgeCountAsync
//     all'apertura (CM6) — divergenza documentata nel piano.
//
// Invocata da pg_cron → pg_net (dispatch_push) ogni minuto.
// Contratto:
//   POST con header x-cron-secret: <CRON_SECRET>
//   200 -> { ok: true, processed, sent, marked, pruned } | 401/500 -> { error }
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

interface ExpoTicket {
  status?: string;
  details?: { error?: string };
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

  // 2b) Badge = notifiche non lette per destinatario (incluse quelle in volo).
  const badgeByUser = new Map<string, number>();
  const { data: unread } = await db
    .from("notifications")
    .select("user_id")
    .is("read_at", null)
    .in("user_id", userIds);
  for (const u of unread ?? []) {
    badgeByUser.set(u.user_id, (badgeByUser.get(u.user_id) ?? 0) + 1);
  }

  // 3) Costruzione messaggi Expo con backref (notifica e token per indice:
  //    i ticket della risposta arrivano NELLO STESSO ORDINE dei messaggi).
  const messages: Record<string, unknown>[] = [];
  const msgNotifIds: string[] = [];
  const msgTokens: string[] = [];
  const daMarcare = new Set<string>();

  for (const r of rows) {
    const tokens = tokensByUser.get(r.user_id) ?? [];
    if (tokens.length === 0) {
      daMarcare.add(r.id); // nessun device: marca subito (come v1)
      continue;
    }
    for (const to of tokens) {
      messages.push({
        to,
        sound: "default",
        title: r.title,
        body: r.body ?? "",
        badge: badgeByUser.get(r.user_id) ?? 1,
        data: { type: r.type, notification_id: r.id, ...r.payload },
      });
      msgNotifIds.push(r.id);
      msgTokens.push(to);
    }
  }

  // 4) Invio a chunk di 100 con marcatura per-chunk + raccolta token morti.
  let sent = 0;
  const tokenMorti = new Set<string>();
  for (let ci = 0; ci < messages.length; ci += CHUNK) {
    const part = messages.slice(ci, ci + CHUNK);
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
      if (!res.ok) {
        console.error("expo_push_error", res.status, await res.text());
        // 4xx = permanente (payload malformato): marca per non ciclare; i 5xx/
        // 429 sono transitori → NIENTE marcatura, retry al prossimo giro.
        if (res.status >= 400 && res.status < 500) {
          for (let i = 0; i < part.length; i++) daMarcare.add(msgNotifIds[ci + i]);
        }
        continue;
      }
      sent += part.length;
      for (let i = 0; i < part.length; i++) daMarcare.add(msgNotifIds[ci + i]);
      // Ticket allineati per indice: DeviceNotRegistered → token da potare.
      const json = await res.json().catch(() => null);
      const tickets = (json?.data ?? []) as ExpoTicket[];
      tickets.forEach((t, i) => {
        if (t?.status === "error" && t.details?.error === "DeviceNotRegistered") {
          tokenMorti.add(msgTokens[ci + i]);
        }
      });
    } catch (e) {
      console.error("expo_push_exception", String(e)); // transitorio: retry
    }
  }

  // 4b) Pruning dei device non più registrati.
  if (tokenMorti.size > 0) {
    const { error: pErr } = await db
      .from("devices")
      .delete()
      .in("expo_push_token", [...tokenMorti]);
    if (pErr) console.error("prune_error", pErr.message);
  }

  // 5) Marca SOLO le notifiche accettate (o senza device / errore permanente).
  if (daMarcare.size > 0) {
    const { error: uErr } = await db
      .from("notifications")
      .update({ pushed_at: new Date().toISOString() })
      .in("id", [...daMarcare]);
    if (uErr) return jsonResponse({ error: uErr.message }, 500);
  }

  return jsonResponse({
    ok: true,
    processed: rows.length,
    sent,
    marked: daMarcare.size,
    pruned: tokenMorti.size,
  });
});
