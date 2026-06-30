// =============================================================================
// Wordmark — la scritta "Televo" del brand. Ora rende il marchio completo
// (BrandLockup: "Telev" in Poppins Bold + l'anello neon al posto della "o"), così
// il logo è IDENTICO ovunque compaia (login, home, placeholder).
// =============================================================================

import type { TextStyle } from 'react-native';
import { fontSize } from '@/constants/theme';
import { BrandLockup } from './BrandLockup';

interface Props {
  size?: number;
  /** Accettato per compatibilità con i call site esistenti (non usato). */
  style?: TextStyle;
}

export function Wordmark({ size = fontSize['2xl'] }: Props) {
  return <BrandLockup size={size} />;
}
