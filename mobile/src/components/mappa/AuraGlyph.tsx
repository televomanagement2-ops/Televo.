// =============================================================================
// AuraGlyph — la primitiva visiva dell'Aura sulla mappa, in Skia (M7 / MM8).
// =============================================================================
// L'anello cromatico È il linguaggio della Mappa della Città (map.md §1/§6): mai
// un pin, mai un numero — un alone luminoso che respira. Qui lo disegniamo con
// `@shopify/react-native-skia`: bloom radiale morbido (BlurMask) + anello + nucleo,
// nella tinta del tratto dominante dell'amico. È VOLUTAMENTE STATICO: il "respiro"
// (scala/opacità) e il decadimento li mette il wrapper animato di chi lo usa
// (transform Reanimated NATIVO, 60fps, zero redraw Skia per-frame) — così anche
// con ~40 aure a schermo il canvas non ridisegna a ogni frame.
//
// ⚠️ Modulo NATIVO (Skia): importabile SOLO sotto il confine lazy di MapSurface
// (Dev Build). In Expo Go non ci si arriva mai (MapCanvas fa da guardia).
//
// Riusato da: AuraDot (amico), ClusterAura (aggregato), MeMarker (la mia aura).

import { Canvas, Circle, BlurMask } from '@shopify/react-native-skia';

interface Props {
  /** Tinta dell'aura (hex): l'aura_color dell'amico o un neutro per l'aggregato. */
  color: string;
  /** Lato del canvas quadrato in px: l'aura è centrata e ci sta dentro col bloom. */
  size: number;
  /** Memoria (Last Seen / echo): opacità basse, bloom quasi assente. */
  dimmed?: boolean;
}

export function AuraGlyph({ color, size, dimmed = false }: Props) {
  const c = size / 2;
  const rBloom = size * 0.44;
  const rRing = size * 0.26;
  const rCore = size * 0.11;
  const ring = Math.max(2, size * 0.045);

  // Due palette di opacità: viva (Live) vs spenta (memoria/Last Seen).
  const bloomOpacity = dimmed ? 0.1 : 0.24;
  const ringOpacity = dimmed ? 0.3 : 0.7;
  const coreOpacity = dimmed ? 0.55 : 1;

  return (
    <Canvas style={{ width: size, height: size }}>
      {/* Bloom radiale morbido: l'alone che dà "presenza". */}
      <Circle cx={c} cy={c} r={rBloom} color={color} opacity={bloomOpacity}>
        <BlurMask blur={size * 0.16} style="normal" />
      </Circle>
      {/* Anello: la firma dell'Aura. */}
      <Circle
        cx={c}
        cy={c}
        r={rRing}
        color={color}
        opacity={ringOpacity}
        style="stroke"
        strokeWidth={ring}
      />
      {/* Nucleo netto: il punto "sono qui". */}
      <Circle cx={c} cy={c} r={rCore} color={color} opacity={coreOpacity} />
    </Canvas>
  );
}
