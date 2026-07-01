// =============================================================================
// onboardingStore — stato dell'onboarding (Zustand).
// =============================================================================
// L'accesso è diviso in schermate dedicate (welcome → email → password), poi il
// completamento profilo è un host a 2 step (registrazione.tsx) i cui dati
// sopravvivono al cambio di step. L'invito da deep link è già in `inviteCode`.
// `intent` distingue chi arriva dalla welcome: 'signup' (Continua con email) crea
// l'account; 'signin' (Accedi) entra in un account esistente.

import { create } from 'zustand';

/** Intento dell'utente all'arrivo dalla welcome. */
export type AuthIntent = 'signup' | 'signin';

/** I due step del completamento profilo (dopo che la sessione è già attiva):
 *  'profilo' = invito + username + nome + nascita; 'finalizza' = foto + consensi. */
export type OnboardingStep = 'profilo' | 'finalizza';

/** Ordine canonico (per il progresso e avanti/indietro). */
export const ONBOARDING_ORDER: OnboardingStep[] = ['profilo', 'finalizza'];

interface OnboardingData {
  /** Intento: registrazione o accesso (scelto nella welcome). */
  intent: AuthIntent;
  /** Metodo di accesso scelto (per ora solo email; 'phone' arriverà con l'SMS). */
  method: 'email' | 'phone';
  /** True quando l'OTP è usato per RESET password (non per accesso normale). */
  resetFlow: boolean;
  inviteCode: string;
  birthDate: string | null; // YYYY-MM-DD
  email: string;
  phone: string;
  username: string;
  displayName: string;
  /** Foto profilo facoltativa: uri per l'anteprima, base64+mime per l'upload. */
  avatarUri: string | null;
  avatarBase64: string | null;
  avatarMime: string | null;
  consentPrivacy: boolean;
  consentTos: boolean;
}

interface OnboardingState extends OnboardingData {
  step: OnboardingStep;
  goTo: (step: OnboardingStep) => void;
  patch: (data: Partial<OnboardingData>) => void;
  reset: () => void;
}

const INITIAL: OnboardingData = {
  intent: 'signup',
  method: 'email',
  resetFlow: false,
  inviteCode: '',
  birthDate: null,
  email: '',
  phone: '',
  username: '',
  displayName: '',
  avatarUri: null,
  avatarBase64: null,
  avatarMime: null,
  consentPrivacy: false,
  consentTos: false,
};

export const useOnboardingStore = create<OnboardingState>((set) => ({
  ...INITIAL,
  step: 'profilo',
  goTo: (step) => set({ step }),
  patch: (data) => set(data),
  // Tiene `inviteCode` (può arrivare da deep link prima del mount del wizard).
  reset: () =>
    set((s) => ({ ...INITIAL, inviteCode: s.inviteCode, step: 'profilo' })),
}));
