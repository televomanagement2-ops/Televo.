// Factory di client Supabase per le Edge Functions.
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY sono iniettate
// automaticamente nel runtime delle Edge Functions da Supabase.
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

// Client con privilegi service_role: BYPASSA la RLS. Usare solo lato server,
// per operazioni controllate (lettura room, verifica età, job cron).
export function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

// Client legato all'utente chiamante: rispetta la RLS e popola auth.uid()
// in base al JWT passato nell'header Authorization.
export function userClient(authHeader: string): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}
