// =============================================================================
// BrandLockup — il marchio "Televo" come immagine ufficiale (wordmark.jpg: lettere
// + anello neon già inclusi e allineati nel file). È la via di MASSIMA fedeltà al
// mockup: niente font/anello ricostruiti a codice. Lo sfondo del JPG è nero come la
// UI, quindi si fonde; usiamo `contain` per non deformarlo.
//
// `size` = altezza del wordmark in pt (la larghezza segue il ratio 2.671 del file).
// =============================================================================

import { Image } from 'expo-image';
import type { ImageStyle, StyleProp } from 'react-native';

const WORDMARK = require('../../../assets/images/login/wordmark.jpg');
const RATIO = 1111 / 416; // ratio del file (≈2.671)

interface Props {
  /** Altezza del wordmark in pt; la larghezza segue il ratio del file. */
  size?: number;
}

export function BrandLockup({ size = 56 }: Props) {
  // Il file ha margine nero sopra/sotto: l'altezza-glifo reale è ~0.62 del canvas.
  // Per ottenere un'altezza-glifo ≈ `size`, scaliamo il box di conseguenza.
  const boxH = size / 0.62;
  const boxW = boxH * RATIO;

  // Il JPG ha fondo nero (non trasparente): con mixBlendMode "screen" (additivo, RN
  // 0.76+) il nero sparisce nel fondo e restano solo le lettere bianche e l'anello
  // neon — niente riquadro visibile attorno al logo. (Cast: la prop esiste a runtime
  // ma non è ancora nei tipi ImageStyle di questa versione RN.)
  const style = { width: boxW, height: boxH, mixBlendMode: 'screen' } as unknown as StyleProp<ImageStyle>;

  return <Image source={WORDMARK} style={style} contentFit="contain" />;
}
