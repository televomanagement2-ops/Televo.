// =============================================================================
// MapPresenceControl — la pill di stato/azione della mia Aura (M7 / MM6).
// =============================================================================
// Overlay in basso sulla mappa: comunica il mio stato e apre il flusso di
// condivisione. Tre stati: SPENTA ("Accendi la tua Aura"), ACCESA ("Sei
// visibile · ancora 3h 42m", countdown che ticchetta) e PROBLEMA (permesso tolto
// a sessione attiva → invito a sistemare). Il countdown è derivato dal solo
// sharing_until (epoch ms UTC): nessun calcolo su ora locale. Il tap delega al
// parent (stesso gesto del puntino "tu").

import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMapStore, sessioneAttiva } from '@/store/mapStore';
import { residuoCompatto } from '@/lib/datetime';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';

export function MapPresenceControl({ bottom, onPress }: { bottom: number; onPress: () => void }) {
  const sessione = useMapStore((s) => s.sessione);
  const problema = useMapStore((s) => s.problema);
  const permesso = useMapStore((s) => s.permesso);

  // Tick minuto per aggiornare il countdown (e far "spegnere" la pill alla scadenza).
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const accesa = sessioneAttiva(sessione, Date.now());
  // Problema: watcher fallito (problema='permesso') O permesso revocato da
  // sistema a sessione attiva ('denied'). 'undetermined' NON allarma (avvio).
  const problemaAttivo = accesa && (problema === 'permesso' || permesso === 'denied');

  let icona: keyof typeof Ionicons.glyphMap = 'radio-button-off';
  let testo = 'Accendi la tua Aura';
  let stile: ViewStyle = styles.pillOff;
  let coloreIcona: string = colors.muted;

  if (problemaAttivo) {
    icona = 'warning-outline';
    testo = 'Posizione non disponibile';
    stile = styles.pillWarn;
    coloreIcona = colors.warning;
  } else if (accesa && sessione) {
    icona = 'ellipse';
    testo = `Sei visibile · ancora ${residuoCompatto(sessione.sharingUntil)}`;
    stile = styles.pillOn;
    coloreIcona = colors.accent;
  }

  return (
    <View style={[styles.wrap, { bottom }]} pointerEvents="box-none">
      <Pressable
        style={({ pressed }) => [styles.pill, stile, pressed && styles.pressed]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={testo}
        hitSlop={8}
      >
        <Ionicons name={icona} size={accesa && !problemaAttivo ? 11 : 16} color={coloreIcona} />
        <Text style={styles.testo} numberOfLines={1}>
          {testo}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.full,
    borderWidth: 1,
    maxWidth: '88%',
  },
  pillOff: { backgroundColor: 'rgba(11,12,16,0.92)', borderColor: colors.border },
  pillOn: { backgroundColor: 'rgba(11,12,16,0.92)', borderColor: 'rgba(59,130,246,0.55)' },
  pillWarn: { backgroundColor: 'rgba(11,12,16,0.92)', borderColor: 'rgba(251,191,36,0.55)' },
  pressed: { opacity: 0.75 },
  testo: { color: colors.ink, fontSize: fontSize.sm, fontFamily: fontFamily.semibold },
});
