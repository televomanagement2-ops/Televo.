// =============================================================================
// send-push v4 — invio push (Expo) + RECEIPT + osservabilità — M13/P4, M14R2/F4.
// =============================================================================
// Preleva le notifiche con `pushed_at is null`, le invia ai dispositivi Expo
// registrati dell'utente e le marca come inviate.
//
// v2 (tech-debt CM6) — INVARIATO:
//   • MARCATURA PER-CHUNK: si marcano solo le notifiche dei chunk ACCETTATI da
//     Expo — un blackout non brucia più il batch. I 4xx (payload malformato,
//     permanente) si marcano comunque per non ritentare all'infinito. Le
//     notifiche di utenti SENZA device si marcano subito (anti-reprocessing).
//   • PRUNING TOKEN MORTI dai TICKET sincroni (DeviceNotRegistered).
//   • BADGE per-messaggio = notifiche non lette del destinatario.
//
// v3 (M13/P4) — receipt asincrone + osservabilità (§3.3 dell'audit):
//   • I ticket "ok" della risposta Expo (backref per indice, righe già sfruttate
//     in v2) vengono salvati in `push_tickets`.
//   • A OGNI run si interrogano le receipt dei ticket più vecchi di 15 min
//     (batch ≤300, endpoint getReceipts): `ok` → ticket risolto (delete);
//     `DeviceNotRegistered` → device potato; altro (InvalidCredentials,
//     MessageTooBig, MessageRateExceeded, …) → `push_health` + console.error;
//     ticket senza receipt oltre 24h → potato (Expo tiene le receipt ~24h).
//     È così che il breakpoint #4 (credenziali FCM v1/APNs) smette di essere
//     invisibile.
//   • `push_health.send_push_last_run` = {processed, sent, marked, pruned,
//     receipts_checked, receipt_errors} aggiornata a ogni invocazione.
//
// v4 (M14R2/F4) — anche gli errori a livello di TICKET diventano visibili:
//   • Expo può rifiutare GIÀ nel ticket sincrono (es. `InvalidCredentials`
//     quando le credenziali FCM non sono associate al progetto): quei ticket
//     non hanno receipt e non sono DeviceNotRegistered → prima sparivano nel
//     nulla e la run risultava "sent" con zero consegne. Ora finiscono in
//     `push_health.send_push_ticket_errors` (+ console.error) e la run riporta
//     `ticket_errors` — è così che la verifica M14R2 ha stanato la causa reale.
//
// Invocata da pg_cron → pg_net (dispatch_push) ogni minuto.
// Contratto:
//   POST con header x-cron-secret: <CRON_SECRET>
//   200 -> { ok: true, processed, sent, marked, pruned, ticket_errors,
//            receipts_checked, receipt_errors } | 401/405/500 -> { error }
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient } from "../_shared/clients.ts";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_RECEIPT_URL = "https://exp.host/--/api/v2/push/getReceipts";
const BATCH = 500; // notifiche per esecuzione
const CHUNK = 100; // messaggi per richiesta Expo
const RECEIPT_BATCH = 300;                    // ticket per interrogazione receipt
const RECEIPT_MIN_AGE_MS = 15 * 60 * 1000;    // le receipt maturano dopo qualche minuto
const RECEIPT_MAX_AGE_MS = 24 * 60 * 60 * 1000; // Expo conserva le receipt ~24h

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
  id?: string; // receipt id (solo sui ticket "ok")
  message?: string;
  details?: { error?: string };
}

interface ExpoReceipt {
  status?: string;
  message?: string;
  details?: { error?: string };
}

interface TicketRow {
  ticket_id: string;
  notification_id: string;
  expo_push_token: string;
  created_at: string;
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

  // Contatori di run (finiscono in push_health.send_push_last_run).
  let sent = 0;
  let pruned = 0;
  let ticketErrors = 0;

  // ===========================================================================
  // FASE INVIO — v2 invariata + salvataggio dei ticket "ok" (v3).
  // ===========================================================================

  // 1) Notifiche da inviare.
  const { data: notifs, error: nErr } = await db
    .from("notifications")
    .select("id, user_id, type, title, body, payload")
    .is("pushed_at", null)
    .order("created_at", { ascending: true })
    .limit(BATCH);
  if (nErr) return jsonResponse({ error: nErr.message }, 500);

  const rows = (notifs ?? []) as NotificationRow[];
  const daMarcare = new Set<string>();

  if (rows.length > 0) {
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

    // 4) Invio a chunk di 100 con marcatura per-chunk + raccolta token morti +
    //    raccolta dei ticket "ok" (v3).
    const tokenMorti = new Set<string>();
    const nuoviTicket: TicketRow[] = [];
    const erroriTicket: { error: string; message: string | null }[] = [];
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
        // Ticket allineati per indice: DeviceNotRegistered → token da potare;
        // "ok" con id → ticket da salvare per la fase receipt.
        const json = await res.json().catch(() => null);
        const tickets = (json?.data ?? []) as ExpoTicket[];
        tickets.forEach((t, i) => {
          const idx = ci + i;
          if (t?.status === "error" && t.details?.error === "DeviceNotRegistered") {
            tokenMorti.add(msgTokens[idx]);
          } else if (t?.status === "error") {
            // v4: rifiuto sincrono di Expo (InvalidCredentials & co.) — il
            // segnale va reso visibile, non ci sarà mai una receipt.
            const err = t.details?.error ?? "unknown";
            erroriTicket.push({ error: err, message: t.message ?? null });
            console.error("push_ticket_error", err, t.message ?? "");
          } else if (t?.status === "ok" && t.id) {
            nuoviTicket.push({
              ticket_id: t.id,
              notification_id: msgNotifIds[idx],
              expo_push_token: msgTokens[idx],
              created_at: new Date().toISOString(),
            });
          }
        });
      } catch (e) {
        console.error("expo_push_exception", String(e)); // transitorio: retry
      }
    }

    // 4b) Pruning dei device non più registrati (dai ticket sincroni).
    if (tokenMorti.size > 0) {
      const { error: pErr } = await db
        .from("devices")
        .delete()
        .in("expo_push_token", [...tokenMorti]);
      if (pErr) console.error("prune_error", pErr.message);
      else pruned += tokenMorti.size;
    }

    // 4c) Salvataggio dei ticket "ok" per la fase receipt (v3). upsert
    //     ignoreDuplicates: un ticket id Expo è unico → difesa contro re-run.
    if (nuoviTicket.length > 0) {
      const { error: tErr } = await db
        .from("push_tickets")
        .upsert(nuoviTicket, { onConflict: "ticket_id", ignoreDuplicates: true });
      if (tErr) console.error("push_tickets_insert_error", tErr.message);
    }

    // 4d) v4: errori sincroni di ticket → traccia diagnostica persistente
    //     (stessa forma dei receipt errors: at/count/sample).
    if (erroriTicket.length > 0) {
      ticketErrors = erroriTicket.length;
      await db.from("push_health").upsert({
        key: "send_push_ticket_errors",
        value: {
          at: new Date().toISOString(),
          count: erroriTicket.length,
          sample: erroriTicket.slice(0, 5),
        },
        updated_at: new Date().toISOString(),
      });
    }

    // 5) Marca SOLO le notifiche accettate (o senza device / errore permanente).
    if (daMarcare.size > 0) {
      const { error: uErr } = await db
        .from("notifications")
        .update({ pushed_at: new Date().toISOString() })
        .in("id", [...daMarcare]);
      if (uErr) return jsonResponse({ error: uErr.message }, 500);
    }
  }

  // ===========================================================================
  // FASE RECEIPT (v3) — a OGNI invocazione, indipendente dal traffico corrente.
  // ===========================================================================
  let receiptsChecked = 0;
  let receiptErrors = 0;
  const now = Date.now();

  const { data: pending, error: recErr } = await db
    .from("push_tickets")
    .select("ticket_id, notification_id, expo_push_token, created_at")
    .lt("created_at", new Date(now - RECEIPT_MIN_AGE_MS).toISOString())
    .order("created_at", { ascending: true })
    .limit(RECEIPT_BATCH);
  if (recErr) console.error("push_tickets_select_error", recErr.message);

  const candidates = (pending ?? []) as TicketRow[];

  // Ticket senza receipt oltre 24h: Expo non li serve più → potali direttamente.
  const scadutiIds: string[] = [];
  const daControllare: TicketRow[] = [];
  for (const t of candidates) {
    if (now - new Date(t.created_at).getTime() > RECEIPT_MAX_AGE_MS) scadutiIds.push(t.ticket_id);
    else daControllare.push(t);
  }
  if (scadutiIds.length > 0) {
    await db.from("push_tickets").delete().in("ticket_id", scadutiIds);
  }

  if (daControllare.length > 0) {
    const byId = new Map(daControllare.map((t) => [t.ticket_id, t]));
    const risoltiIds: string[] = [];       // ricevuta receipt determinata → delete
    const tokenMortiReceipt = new Set<string>();
    const erroriHealth: { ticket_id: string; error: string; message: string | null }[] = [];
    try {
      const res = await fetch(EXPO_RECEIPT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Accept-Encoding": "gzip, deflate",
        },
        body: JSON.stringify({ ids: daControllare.map((t) => t.ticket_id) }),
      });
      if (!res.ok) {
        console.error("expo_receipt_error", res.status, await res.text());
      } else {
        const json = await res.json().catch(() => null);
        const receipts = (json?.data ?? {}) as Record<string, ExpoReceipt>;
        for (const [id, r] of Object.entries(receipts)) {
          const ticket = byId.get(id);
          if (!ticket) continue;
          receiptsChecked++;
          if (r?.status === "ok") {
            risoltiIds.push(id); // consegnata: ticket risolto
          } else if (r?.status === "error") {
            risoltiIds.push(id); // determinata: comunque risolta
            const err = r.details?.error ?? "unknown";
            if (err === "DeviceNotRegistered") {
              tokenMortiReceipt.add(ticket.expo_push_token);
            } else {
              // Il segnale che conta (InvalidCredentials & co.): rendilo visibile.
              receiptErrors++;
              erroriHealth.push({ ticket_id: id, error: err, message: r.message ?? null });
              console.error("receipt_delivery_error", id, err, r.message ?? "");
            }
          }
          // id non presente nella risposta = receipt non pronta → lascia il ticket.
        }
      }
    } catch (e) {
      console.error("expo_receipt_exception", String(e));
    }

    // Device morti scoperti dalle receipt.
    if (tokenMortiReceipt.size > 0) {
      const { error: pErr } = await db
        .from("devices")
        .delete()
        .in("expo_push_token", [...tokenMortiReceipt]);
      if (pErr) console.error("prune_error_receipt", pErr.message);
      else pruned += tokenMortiReceipt.size;
    }

    // Ticket risolti (ok o errore determinato): rimossi dalla coda.
    if (risoltiIds.length > 0) {
      await db.from("push_tickets").delete().in("ticket_id", risoltiIds);
    }

    // Errori di consegna non banali → traccia diagnostica (breakpoint #4).
    if (erroriHealth.length > 0) {
      await db.from("push_health").upsert({
        key: "send_push_receipt_errors",
        value: {
          at: new Date().toISOString(),
          count: erroriHealth.length,
          sample: erroriHealth.slice(0, 5),
        },
        updated_at: new Date().toISOString(),
      });
    }
  }

  // ===========================================================================
  // OSSERVABILITÀ — esito del run (v3), sempre.
  // ===========================================================================
  await db.from("push_health").upsert({
    key: "send_push_last_run",
    value: {
      at: new Date().toISOString(),
      processed: rows.length,
      sent,
      marked: daMarcare.size,
      pruned,
      ticket_errors: ticketErrors,
      receipts_checked: receiptsChecked,
      receipt_errors: receiptErrors,
    },
    updated_at: new Date().toISOString(),
  });

  return jsonResponse({
    ok: true,
    processed: rows.length,
    sent,
    marked: daMarcare.size,
    pruned,
    ticket_errors: ticketErrors,
    receipts_checked: receiptsChecked,
    receipt_errors: receiptErrors,
  });
});
