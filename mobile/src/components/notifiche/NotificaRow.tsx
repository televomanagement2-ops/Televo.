// =============================================================================
// NotificaRow — riga della tab Notifiche (M13/P10, AH-1).
// =============================================================================
// Icona per tipo, titolo/body, tempo relativo (lib/datetime, niente Intl),
// dot unread a destra. Il tap delega al parent (che risolve la rotta con
// rottaPerNotifica). Il body del tipo 'prop' arriva dal trigger come tratto
// grezzo ('kindness', …): si traduce con le etichette IT dell'Aura.

import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { tempoRelativo } from '@/lib/datetime';
import { AURA_TRAIT_LABEL } from '@/constants/aura';
import type { AuraTrait } from '@/constants/aura';
import type { NotificaRiga } from '@/hooks/useNotificheTab';
import type { NotificationType } from '@/types/supabase';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';

const ICONE: Record<NotificationType, keyof typeof Ionicons.glyphMap> = {
  friend_request: 'person-add-outline',
  friend_accepted: 'people-outline',
  message: 'chatbubble-outline', // non listata (§7), presente per completezza
  prop: 'sparkles-outline',
  achievement: 'trophy-outline',
  aura_upgrade: 'trending-up-outline',
  aura_downgrade: 'trending-down-outline',
  drop_comment: 'chatbubble-ellipses-outline',
  drop_prompt: 'bulb-outline',
  live_started: 'videocam-outline',
  live_cohost_invite: 'people-circle-outline',
  new_login: 'shield-checkmark-outline',
};

/** Body leggibile: il tratto grezzo dei prop diventa l'etichetta IT. */
function corpoNotifica(riga: NotificaRiga): string | null {
  if (riga.type === 'prop' && riga.body && riga.body in AURA_TRAIT_LABEL) {
    return AURA_TRAIT_LABEL[riga.body as AuraTrait];
  }
  return riga.body;
}

interface Props {
  riga: NotificaRiga;
  onPress: (riga: NotificaRiga) => void;
}

export const NotificaRow = memo(function NotificaRow({ riga, onPress }: Props) {
  const body = corpoNotifica(riga);
  const nonLetta = riga.read_at == null;

  return (
    <Pressable
      style={({ pressed }) => [styles.riga, pressed && styles.premuta]}
      onPress={() => onPress(riga)}
      accessibilityRole="button"
      accessibilityLabel={riga.title}
    >
      <View style={styles.cerchioIcona}>
        <Ionicons
          name={ICONE[riga.type] ?? 'notifications-outline'}
          size={20}
          color={nonLetta ? colors.accent : colors.muted}
        />
      </View>
      <View style={styles.testi}>
        <Text style={[styles.titolo, nonLetta && styles.titoloNonLetta]} numberOfLines={2}>
          {riga.title}
        </Text>
        {body ? (
          <Text style={styles.body} numberOfLines={2}>
            {body}
          </Text>
        ) : null}
        <Text style={styles.tempo}>{tempoRelativo(riga.created_at)}</Text>
      </View>
      {nonLetta ? <View style={styles.dot} /> : null}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  riga: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  premuta: { opacity: 0.7 },
  cerchioIcona: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  testi: { flex: 1, gap: 1 },
  titolo: { color: colors.ink, fontSize: fontSize.sm, fontFamily: fontFamily.medium },
  titoloNonLetta: { fontFamily: fontFamily.semibold },
  body: { color: colors.muted, fontSize: fontSize.xs, fontFamily: fontFamily.sans },
  tempo: { color: colors.faint, fontSize: fontSize.xs, fontFamily: fontFamily.sans },
  dot: { width: 8, height: 8, borderRadius: radius.full, backgroundColor: colors.accent },
});
