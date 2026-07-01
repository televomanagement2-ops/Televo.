// =============================================================================
// Routes — nomi di percorso tipizzati (allineati alla struttura app/ di Expo
// Router). Centralizzarli evita stringhe magiche sparse e refactor fragili.
// =============================================================================
// La navigazione è file-based: questi valori DEVONO corrispondere ai file in
// app/. Con typedRoutes attivo (app.json) Expo genera comunque i tipi, ma questi
// helper restano comodi per le route dinamiche e per leggibilità.

export const ROUTES = {
  // --- Auth (gruppo (auth)) ---
  welcome: '/welcome',
  email: '/email',
  password: '/password',
  nuovaPassword: '/nuova-password',
  verifica: '/verifica',
  telefono: '/telefono',
  invito: '/invito',
  registrazione: '/registrazione',

  // --- Tabs (gruppo (main)/(tabs)) — la bottom bar a 5 voci ---
  home: '/home',
  messages: '/messages',
  crea: '/crea',
  notifiche: '/notifiche',
  menu: '/menu',

  // --- Stack interni (gruppo (main)) — aperti dall'header, non dai tab ---
  profilo: '/profilo',
  profiloModifica: '/profilo/modifica',
  profiloAura: '/profilo/aura',
  profiloAchievement: '/profilo/achievement',
  cerca: '/cerca',
  amici: '/amici',
  nuovoGruppo: '/chat/nuovo-gruppo',
  messaggiImportante: '/messaggi/importante',
} as const;

/** Route dinamiche: costruttori tipizzati per gli id (in arrivo nei prossimi M). */
export const dynamicRoutes = {
  stanza: (id: string) => `/stanza/${id}` as const,
  chat: (id: string) => `/chat/${id}` as const,
  chatInfo: (id: string) => `/chat/${id}/info` as const,
  profiloUtente: (id: string) => `/profilo/${id}` as const,
};

export type AppRoute = (typeof ROUTES)[keyof typeof ROUTES];
