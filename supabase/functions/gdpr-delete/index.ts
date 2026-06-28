// =============================================================================
// gdpr-delete — diritto alla cancellazione (art. 17).
// =============================================================================
// L'utente cancella SOLO il proprio account. Anonimizzazione IMMEDIATA dei dati
// (process_account_deletion: profilo, birth_date privata, contenuti, dispositivi)
// + ban dell'identità auth per impedire nuovi accessi. La rimozione DEFINITIVA
// (incl. auth.users/email) avviene col cron di retention dopo 30 giorni.
//
// verify_jwt = true.
//   POST -> 200 { ok: true, anonymized_at }
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient, userClient } from "../_shared/clients.ts";

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
  const uid = user.id;

  const db = adminClient();

  // 1) Anonimizzazione + soft-delete immediati (server-side, atomico).
  const { error: delErr } = await db.rpc("process_account_deletion", { p_user: uid });
  if (delErr) return jsonResponse({ error: delErr.message }, 500);

  // 2) Blocca l'accesso e svuota i metadati (username/birth_date nei metadata).
  //    Best effort: se l'admin API fallisce, l'account è comunque anonimizzato.
  try {
    await db.auth.admin.updateUserById(uid, {
      ban_duration: "876000h", // ~100 anni: niente nuovi login fino all'hard-delete
      user_metadata: {},
    });
  } catch (e) {
    console.error("auth_ban_failed", String(e));
  }

  // 3) Chiudi le richieste di cancellazione pendenti + audit.
  await db
    .from("gdpr_requests")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("user_id", uid).eq("kind", "delete").eq("status", "pending");

  await db.rpc("log_audit", {
    p_action: "gdpr_delete",
    p_target_type: "user",
    p_target_id: uid,
    p_meta: { retention_days: 30 },
  });

  return jsonResponse({ ok: true, anonymized_at: new Date().toISOString() });
});
