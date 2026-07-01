// =============================================================================
// Theme — design system Televo (fonte di verità per TS/Reanimated).
// =============================================================================
// Estetica: NERO ASSOLUTO (#000) protagonista, accento BLU netto per tutta la UI
// (bottoni, focus, link). Look sobrio da social vero, niente vetro/glow vistosi.
// IL LOGO fa eccezione: l'anello "o" del marchio resta viola→fucsia (come
// l'immagine di apertura) — è la firma di marca. Questi valori sono rispecchiati in
// tailwind.config.js; qui servono dove serve il valore "vivo" (gradient,
// animazioni Reanimated, shadow, SVG).

export const colors = {
  // Sfondi — nero assoluto + grigi freddi molto scuri
  base: '#000000',
  surface: '#0b0c10',
  elevated: '#14161c',
  border: '#23262e',

  // Accento UI — BLU (bottoni, outline, link, focus, stati attivi, underline,
  // dots). Allineato a tailwind.config.js. NIENTE viola nella UI.
  accent: '#3b82f6',
  accentSoft: '#60a5fa',
  accentDeep: '#2563eb',

  // Brand — viola → fucsia: SOLO l'anello/wordmark del logo (LaunchRing/
  // BrandLockup). È l'unica eccezione: non usarli come accento UI.
  viola: '#a855f7',
  fucsia: '#d946ef',

  // Testo — neutri freddi (niente tinta lavanda)
  ink: '#f2f4f8',
  muted: '#8a8f9c',
  faint: '#565b66',

  // Stati semantici
  success: '#34d399',
  warning: '#fbbf24',
  danger: '#fb7185',
} as const;

/** Gradient. `brand` = l'anello del logo (viola). `accent` = UI (blu). */
export const gradients = {
  // viola → fucsia: il marchio (come l'immagine) — SOLO logo
  brand: ['#a855f7', '#d946ef'] as const,
  // blu: accento della UI
  accent: ['#60a5fa', '#2563eb'] as const,
  // "alone" morbido blu per i glow attenuati
  glow: ['rgba(96,165,250,0.35)', 'rgba(37,99,235,0.10)'] as const,
} as const;

/** Spaziatura base 4pt — respiro, niente rumore visivo. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
  '4xl': 64,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 28,
  full: 9999,
} as const;

export const fontSize = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 22,
  '2xl': 28,
  '3xl': 34,
  '4xl': 44,
} as const;

export const fontFamily = {
  // Poppins (caricato in app/_layout.tsx) per tutto: corpo, titoli e wordmark.
  // `display`/`displayBold` = wordmark e titoli; `sans`/`medium`/`semibold` = corpo.
  sans: 'Poppins-Regular',
  medium: 'Poppins-Medium',
  semibold: 'Poppins-SemiBold',
  display: 'Poppins-SemiBold',
  displayBold: 'Poppins-Bold',
} as const;

/**
 * Durate animazioni — sempre lente e organiche, mai brusche (pulsing/breathing).
 * In ms. Usate da Reanimated per i loop dell'anello e delle bolle live.
 */
export const motion = {
  fast: 200,
  base: 350,
  slow: 600,
  breath: 2600, // ciclo "respiro" dell'anello Aura e delle bolle
  pulse: 1800, // pulsazione delle live sulla mappa
} as const;

/** Glow blu riusabile (accento UI) per superfici/elementi attivi — sobrio. */
export const glow = {
  shadowColor: colors.accent,
  shadowOpacity: 0.35,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 0 },
  elevation: 8,
} as const;

export const theme = {
  colors,
  gradients,
  spacing,
  radius,
  fontSize,
  fontFamily,
  motion,
  glow,
} as const;

export type Theme = typeof theme;
