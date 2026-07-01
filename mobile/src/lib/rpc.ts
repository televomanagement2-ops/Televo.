// =============================================================================
// callRpc — helper condiviso per invocare le RPC Supabase.
// =============================================================================
// In postgrest-js 2.108 l'inferenza dei generici di `rpc()` non aggancia gli Args
// ai tipi `Database` scritti a mano (Args resta `never`). Isoliamo QUI il cast e
// lanciamo gli errori come oggetti Postgrest (message = codice-stringa della RPC),
// così i chiamanti restano tipizzati e gli errori mappabili in italiano.
// (Stesso pattern del callRpc privato in lib/auth.ts, qui esportato per il riuso.)

import { supabase } from '@/lib/supabase';

export async function callRpc<T = unknown>(
  fn: string,
  args: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.rpc(fn as never, args as never);
  if (error) throw error;
  return data as T;
}
