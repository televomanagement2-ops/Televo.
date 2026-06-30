// =============================================================================
// Routes — nomi di percorso tipizzati (allineati alla struttura app/ di Expo
// Router). Centralizzarli evita stringhe magiche sparse e refactor fragili.
// =============================================================================
// La navigazione è file-based: questi valori DEVONO corrispondere ai file in
// app/. Con typedRoutes attivo (app.json) Expo genera comunque i tipi, ma questi
// helper restano comodi per le route dinamiche e per leggibilità.

export const ROUTES = {
  // --- Auth (gruppo (auth)) ---
  splash: '/splash',
  invito: '/invito',
  registrazione: '/registrazione',
  login: '/login',

  // --- Tabs (gruppo (main)/(tabs)) ---
  home: '/home',
  live: '/live',
  mappa: '/mappa',
  notifiche: '/notifiche',
  profilo: '/profilo',

  // --- Stack interni (gruppo (main)) ---
  creaStanza: '/stanza/crea',
  chatLista: '/chat',
  profiloModifica: '/profilo/modifica',
  profiloAura: '/profilo/aura',
  profiloAchievement: '/profilo/achievement',
} as const;

/** Route dinamiche: costruttori tipizzati per gli id. */
export const dynamicRoutes = {
  stanza: (id: string) => `/stanza/${id}` as const,
  chat: (id: string) => `/chat/${id}` as const,
  profiloUtente: (id: string) => `/profilo/${id}` as const,
};

export type AppRoute = (typeof ROUTES)[keyof typeof ROUTES];
