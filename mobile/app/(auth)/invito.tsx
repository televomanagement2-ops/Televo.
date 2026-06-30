// =============================================================================
// /invito — punto d'atterraggio dei link invito (es. televo.app/i/CODICE o
// televo://invito?code=CODICE). Precompila il codice e lascia decidere l'index
// (welcome → email → verifica → completamento profilo, dove l'invito è validato).
// =============================================================================

import { useEffect } from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useOnboardingStore } from '@/store/onboardingStore';

export default function Invito() {
  const { code } = useLocalSearchParams<{ code?: string }>();

  useEffect(() => {
    if (code) {
      useOnboardingStore.getState().patch({ inviteCode: String(code).toUpperCase() });
    }
  }, [code]);

  return <Redirect href="/" />;
}
