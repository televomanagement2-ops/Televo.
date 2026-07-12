// =============================================================================
// ComposerToggles — la riga compatta di toggle del composer live (M12 / LM6).
// =============================================================================
// I cinque interruttori di live.md §3, come chip a icona su una riga scorrevole
// (camera-first: niente form, si regola tutto sopra la preview). Default del
// server: commenti ON, mappa OFF (opt-in esplicito), visibilità tutti gli
// amici, notifica a TUTTI (L-4, abbassabile). I toggle fotografano l'avvio e
// non sono rieditabili in v1 (eccezione: i co-host si invitano anche dopo).

import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { LiveNotifyMode, LiveVisibility } from '@/types/supabase';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';

export interface ImpostazioniLive {
  coLive: boolean;
  commenti: boolean;
  mappa: boolean;
  visibility: LiveVisibility;
  notifica: LiveNotifyMode;
}

/** Default di prodotto (specchio dei default server, live.md §3). */
export const IMPOSTAZIONI_LIVE_DEFAULT: ImpostazioniLive = {
  coLive: false,
  commenti: true,
  mappa: false,
  visibility: 'all_friends',
  notifica: 'all',
};

const NOTIFICA_LABEL: Record<LiveNotifyMode, string> = {
  all: 'Tutti',
  top_friends: 'Top',
  none: 'No',
};

interface Props {
  valore: ImpostazioniLive;
  onChange: (valore: ImpostazioniLive) => void;
  /** Il tap su Co-Live quando si ACCENDE apre la selezione amici (il parent). */
  onCoLiveOn?: () => void;
  /** Quanti amici sono già selezionati per la Co-Live (badge sul chip). */
  coHostSelezionati?: number;
}

export function ComposerToggles({ valore, onChange, onCoLiveOn, coHostSelezionati = 0 }: Props) {
  const cicloNotifica: Record<LiveNotifyMode, LiveNotifyMode> = {
    all: 'top_friends',
    top_friends: 'none',
    none: 'all',
  };

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.riga}
    >
      <Chip
        icon="people-outline"
        label={
          valore.coLive
            ? `Co-Live${coHostSelezionati > 0 ? ` · ${coHostSelezionati}` : ''}`
            : 'Co-Live · Off'
        }
        attivo={valore.coLive}
        onPress={() => {
          const acceso = !valore.coLive;
          onChange({ ...valore, coLive: acceso });
          if (acceso) onCoLiveOn?.();
        }}
      />
      <Chip
        icon={valore.commenti ? 'chatbubble-outline' : 'chatbubbles-outline'}
        label={valore.commenti ? 'Commenti · Sì' : 'Commenti · No'}
        attivo={valore.commenti}
        onPress={() => onChange({ ...valore, commenti: !valore.commenti })}
      />
      <Chip
        icon="map-outline"
        label={valore.mappa ? 'Mappa · Sì' : 'Mappa · No'}
        attivo={valore.mappa}
        onPress={() => onChange({ ...valore, mappa: !valore.mappa })}
      />
      <Chip
        icon={valore.visibility === 'top_friends' ? 'star-outline' : 'people-circle-outline'}
        label={valore.visibility === 'top_friends' ? 'Chi · Top Friends' : 'Chi · Amici'}
        attivo={valore.visibility === 'top_friends'}
        onPress={() =>
          onChange({
            ...valore,
            visibility: valore.visibility === 'all_friends' ? 'top_friends' : 'all_friends',
          })
        }
      />
      <Chip
        icon={valore.notifica === 'none' ? 'notifications-off-outline' : 'notifications-outline'}
        label={`Avvisa · ${NOTIFICA_LABEL[valore.notifica]}`}
        attivo={valore.notifica !== 'none'}
        onPress={() => onChange({ ...valore, notifica: cicloNotifica[valore.notifica] })}
      />
    </ScrollView>
  );
}

function Chip({
  icon,
  label,
  attivo,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  attivo: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, attivo && styles.chipOn]}>
      <Ionicons name={icon} size={15} color={attivo ? '#ffffff' : colors.muted} />
      <Text style={[styles.chipTesto, attivo && styles.chipTestoOn]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  riga: { gap: spacing.sm, paddingHorizontal: spacing.lg },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.full,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chipOn: { backgroundColor: 'rgba(59,130,246,0.55)', borderColor: colors.accent },
  chipTesto: { color: colors.muted, fontSize: fontSize.xs, fontFamily: fontFamily.semibold },
  chipTestoOn: { color: '#ffffff' },
});
