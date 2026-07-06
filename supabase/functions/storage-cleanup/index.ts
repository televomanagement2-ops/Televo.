// =============================================================================
// storage-cleanup — svuota la coda storage_cleanup_queue (M6 / DM6, R-09).
// =============================================================================
// L'hosted VIETA la DELETE SQL diretta su storage.objects ("Use the Storage API
// instead" — scoperto in CM8): i file dei contenuti cancellati (drop, commenti
// vocali, vocali/foto chat scaduti o azzerati dal GDPR) vengono quindi accodati
// dai trigger `enqueue_storage_cleanup` e rimossi QUI, con service_role via
// Storage API, a batch. Sana anche il debito storage della chat (CM8).
//
// Contratto di sicurezza:
//   • WHITELIST bucket: si rimuove SOLO dai bucket noti del progetto. Un bucket
//     inatteso in coda (mai prodotto dai trigger) NON viene MAI toccato: si logga
//     e si lascia in coda come segnale, non si cancella alla cieca (D-5).
//   • `remove` è idempotente: rimuovere un path già assente NON è un errore →
//     la riga si toglie comunque dalla coda (doppio accodamento / path fantasma).
//   • Solo un errore VERO della Storage API lascia le righe in coda: retry
//     naturale al giro successivo (nessuna perdita, nessun blocco del batch).
//
// Invocata da pg_cron → pg_net (dispatch_storage_cleanup) ogni 15 minuti.
//   POST con header x-cron-secret: <CRON_SECRET>
//   200 -> { ok: true, processed, removed, dequeued, skipped } | 401/500 -> { error }
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient } from "../_shared/clients.ts";

const BATCH = 500; // righe di coda per esecuzione
const CHUNK = 100; // path per singola chiamata Storage API

// Solo i bucket effettivamente prodotti dai trigger enqueue_storage_cleanup
// (drops/drop_comments → drop-media/drop-audio; messages/GDPR → voice-messages/
// chat-media). Qualsiasi altro bucket è un'anomalia da NON processare.
const BUCKET_WHITELIST = new Set<string>([
  "drop-media",
  "drop-audio",
  "voice-messages",
  "chat-media",
]);

interface QueueRow {
  id: number;
  bucket: string;
  path: string;
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

  // 1) Batch dalla coda (FIFO: i più vecchi prima).
  const { data: queued, error: qErr } = await db
    .from("storage_cleanup_queue")
    .select("id, bucket, path")
    .order("created_at", { ascending: true })
    .limit(BATCH);
  if (qErr) return jsonResponse({ error: qErr.message }, 500);

  const rows = (queued ?? []) as QueueRow[];
  if (rows.length === 0) return jsonResponse({ ok: true, processed: 0, removed: 0 });

  // 2) Raggruppa per bucket, scartando (senza toccarli) i bucket non in whitelist.
  const byBucket = new Map<string, { ids: number[]; paths: string[] }>();
  const skipped: QueueRow[] = [];
  for (const r of rows) {
    if (!BUCKET_WHITELIST.has(r.bucket)) {
      skipped.push(r);
      continue;
    }
    const g = byBucket.get(r.bucket) ?? { ids: [], paths: [] };
    g.ids.push(r.id);
    g.paths.push(r.path);
    byBucket.set(r.bucket, g);
  }
  if (skipped.length > 0) {
    // Non deve mai accadere (i trigger scrivono solo bucket noti): lascia in coda
    // come segnale investigabile, NON cancellare alla cieca.
    console.error(
      "storage_cleanup_bucket_non_whitelisted",
      JSON.stringify(skipped.map((r) => ({ id: r.id, bucket: r.bucket }))),
    );
  }

  // 3) Rimozione a chunk. Gli id delle righe rimosse con successo si accodano
  //    per il dequeue; un chunk fallito resta in coda (retry al giro dopo).
  const okIds: number[] = [];
  let removed = 0;
  for (const [bucket, g] of byBucket) {
    for (let i = 0; i < g.paths.length; i += CHUNK) {
      const paths = g.paths.slice(i, i + CHUNK);
      const ids = g.ids.slice(i, i + CHUNK);
      const { data: rm, error: rErr } = await db.storage.from(bucket).remove(paths);
      if (rErr) {
        // Errore VERO (rete, bucket assente): niente dequeue → retry naturale.
        console.error("storage_remove_error", bucket, rErr.message);
        continue;
      }
      removed += rm?.length ?? 0; // path già assenti non compaiono qui: ok
      okIds.push(...ids);
    }
  }

  // 4) Dequeue delle righe rimosse (o già assenti, quindi risolte).
  if (okIds.length > 0) {
    const { error: dErr } = await db
      .from("storage_cleanup_queue")
      .delete()
      .in("id", okIds);
    if (dErr) return jsonResponse({ error: dErr.message }, 500);
  }

  return jsonResponse({
    ok: true,
    processed: rows.length,
    removed,
    dequeued: okIds.length,
    skipped: skipped.length,
  });
});
