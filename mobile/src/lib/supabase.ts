// =============================================================================
// Client Supabase — singleton per l'app mobile.
// =============================================================================
// La sessione (access/refresh token) è persistita in modo SICURO via
// expo-secure-store (Keychain iOS / Keystore Android), MAI in AsyncStorage in
// chiaro: i token sono dati sensibili. Auto-refresh attivo. La anon key è
// pubblica per design — è la RLS sul backend a proteggere i dati.

import 'react-native-url-polyfill/auto';
import { createClient, processLock } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { AppState } from 'react-native';
import Constants from 'expo-constants';
import type { Database } from '@/types/supabase';

// Le credenziali pubbliche arrivano da app.json → extra (build time) con
// fallback alle env EXPO_PUBLIC_* (utile in dev).
const extra = Constants.expoConfig?.extra ?? {};
const supabaseUrl: string =
  (extra.supabaseUrl as string) ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey: string =
  (extra.supabaseAnonKey as string) ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

if (!supabaseUrl || !supabaseAnonKey) {
  // Fallire rumorosamente in dev: senza queste l'app non può autenticare.
  console.warn('[supabase] URL o anon key mancanti — controlla app.json/extra.');
}

// Adapter di storage: SecureStore ha un limite di ~2KB per voce, sufficiente per
// i token di sessione. Le chiavi non possono contenere caratteri speciali.
const SecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: SecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // niente OAuth redirect URL su mobile
    lock: processLock,
  },
});

// Sospende/riprende l'auto-refresh col ciclo di vita dell'app: refresha solo
// quando l'app è in foreground (risparmio batteria, niente refresh inutili).
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
