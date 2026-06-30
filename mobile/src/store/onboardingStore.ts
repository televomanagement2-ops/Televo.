// =============================================================================
// onboardingStore — stato dell'onboarding (Zustand).
// =============================================================================
// L'accesso è diviso in schermate dedicate (welcome → email → verifica), poi il
// completamento profilo è un host a stati interni (registrazione.tsx) i cui dati
// sopravvivono al cambio di step. L'invito da deep link è già in `inviteCode`.

import { create } from 'zustand';

/** Step del completamento profilo (dopo che la sessione è già attiva). */
export type OnboardingStep = 'invito' | 'username' | 'nascita' | 'foto' | 'consensi';

/** Ordine canonico (per i dots di progresso e avanti/indietro). */
export const ONBOARDING_ORDER: OnboardingStep[] = [
  'invito',
  'username',
  'nascita',
  'foto',
  'consensi',
];

interface OnboardingData {
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
  step: 'invito',
  goTo: (step) => set({ step }),
  patch: (data) => set(data),
  // Tiene `inviteCode` (può arrivare da deep link prima del mount del wizard).
  reset: () =>
    set((s) => ({ ...INITIAL, inviteCode: s.inviteCode, step: 'invito' })),
}));
