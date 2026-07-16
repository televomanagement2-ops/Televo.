// =============================================================================
// CuoriOverlay — il layer dei cuori locali dello schermo live (M15 / LR8).
// =============================================================================
// Velo assoluto `pointerEvents="none"` sopra il video: espone `spawn(x, y)`
// via ref (imperativo: una raffica di tap non deve costare re-render fuori da
// questo layer) e monta una CuoreParticella per cuore, che si auto-rimuove a
// fine animazione. I cuori sono SOLO PROPRI (RW-3a: dei like altrui si vede
// solo il contatore che sale) e SOLO visivi. Cap anti-spam-visivo: oltre
// MAX_CUORI il più vecchio viene droppato — raffiche leggibili, memoria
// bounded (rischio "spam visivo" dichiarato in LR8).

import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { CuoreParticella } from '@/components/live/CuoreParticella';

/** Particelle vive al massimo (drop del più vecchio oltre il cap, §8.5). */
const MAX_CUORI = 20;

interface Cuore {
  id: number;
  x: number;
  y: number;
}

export interface CuoriOverlayHandle {
  /** Fa nascere un cuore nel punto (coordinate del root dello schermo live). */
  spawn: (x: number, y: number) => void;
}

export const CuoriOverlay = forwardRef<CuoriOverlayHandle>(function CuoriOverlay(_, ref) {
  const [cuori, setCuori] = useState<Cuore[]>([]);
  const prossimoId = useRef(0);

  useImperativeHandle(
    ref,
    () => ({
      spawn: (x, y) => {
        setCuori((prev) => {
          const out = [...prev, { id: prossimoId.current++, x, y }];
          return out.length > MAX_CUORI ? out.slice(out.length - MAX_CUORI) : out;
        });
      },
    }),
    [],
  );

  const rimuovi = useCallback((id: number) => {
    setCuori((prev) => prev.filter((c) => c.id !== id));
  }, []);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {cuori.map((c) => (
        <CuoreParticella key={c.id} id={c.id} x={c.x} y={c.y} onFine={rimuovi} />
      ))}
    </View>
  );
});
