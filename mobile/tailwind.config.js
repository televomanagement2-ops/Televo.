/** @type {import('tailwindcss').Config} */
// Televo — design system. NERO ASSOLUTO + accento BLU per la UI.
// Il logo (anello "o") resta viola→fucsia: vedi src/constants/theme.ts (fonte di verità).
module.exports = {
  content: [
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Sfondi — nero assoluto + grigi freddi
        base: '#000000',        // sfondo app
        surface: '#0b0c10',     // card, pannelli
        elevated: '#14161c',    // elementi sollevati, bottom sheet
        border: '#23262e',      // bordi sottili

        // Accento UI — blu
        accent: '#3b82f6',
        'accent-soft': '#60a5fa',
        'accent-deep': '#2563eb',

        // Brand — viola → fucsia: SOLO il logo
        viola: '#a855f7',
        fucsia: '#d946ef',

        // Testo — neutri freddi
        ink: '#f2f4f8',         // testo primario
        muted: '#8a8f9c',       // testo secondario
        faint: '#565b66',       // testo disabilitato / hint

        // Aura — colori per tratto dominante (vedi src/constants/aura.ts)
        'aura-chill': '#38bdf8',     // sereno — azzurro
        'aura-welcoming': '#f472b6', // accogliente — rosa
        'aura-humor': '#fbbf24',     // divertente — ambra
        'aura-helpful': '#34d399',   // utile — verde
        'aura-kind': '#a855f7',      // gentile — viola (default)

        // Stati semantici
        success: '#34d399',
        warning: '#fbbf24',
        danger: '#fb7185',
      },
      fontFamily: {
        sans: ['Poppins-Regular', 'sans-serif'],
        display: ['Poppins-Bold', 'sans-serif'],
      },
      borderRadius: {
        xl: '20px',
        '2xl': '28px',
      },
    },
  },
  plugins: [],
};
