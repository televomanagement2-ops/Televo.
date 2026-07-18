// =============================================================================
// RigaClassifica — una riga della lista (dal 4° in giù) della Classifica Aura
// (M16 / AC3, classifica.md §4).
// =============================================================================
// [ N° | avatar+anello (SEMPRE still: budget animazioni) | nome + @username |
//   pulsante chat ]. La PROPRIA riga è evidenziata e la chat è sostituita
// dall'icona CONDIVIDI della share card (AC4, §4 — punto d'ingresso 1). Tap
// sulla riga (fuori dal pulsante) → profilo.

import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AuraAvatarRing } from '@/components/aura/AuraAvatarRing';
import { Avatar } from '@/components/ui/Avatar';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';
import type { ClassificaAuraRigaRaw } from '@/types/supabase';

interface Props {
  riga: ClassificaAuraRigaRaw;
  onApriProfilo: (riga: ClassificaAuraRigaRaw) => void;
  /** Apre/crea la DM con l'amico della riga (assente sulla propria riga). */
  onApriChat: (userId: string) => void;
  /** True mentre la DM di QUESTA riga si sta aprendo. */
  chatInApertura: boolean;
  /** Avvia la share card (AC4); solo sulla PROPRIA riga, null = share non
   *  disponibile (es. senza dati) → nessun pulsante. */
  onCondividi?: (() => void) | null;
  /** True mentre la cattura/condivisione è in volo. */
  condivisioneInCorso?: boolean;
}

const AVATAR = 40;

export function RigaClassifica({
  riga,
  onApriProfilo,
  onApriChat,
  chatInApertura,
  onCondividi,
  condivisioneInCorso,
}: Props) {
  const nome = riga.display_name || riga.username;

  return (
    <Pressable
      onPress={() => onApriProfilo(riga)}
      style={({ pressed }) => [styles.riga, riga.is_me && styles.rigaMia, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${riga.rank}° in classifica: ${nome}`}
    >
      {/* Colonna posizione a larghezza fissa, cifre tabulari: la lista resta in colonna. */}
      <Text style={styles.rank}>{riga.rank}°</Text>

      <AuraAvatarRing percent={riga.aura_score} size={AVATAR} still>
        <Avatar uri={riga.avatar_url} name={nome} size={AVATAR} />
      </AuraAvatarRing>

      <View style={styles.testi}>
        <Text style={styles.nome} numberOfLines={1}>
          {nome}
          {riga.is_me ? <Text style={styles.tu}> · tu</Text> : null}
        </Text>
        <Text style={styles.username} numberOfLines={1}>
          @{riga.username}
        </Text>
      </View>

      {/* Chat SOLO sugli amici: ogni riga non-mia è un amico accettato, quindi
          get_or_create_dm è legale per costruzione (esige are_friends). Sulla
          PROPRIA riga al suo posto c'è la condivisione (§10.15). */}
      {riga.is_me ? (
        onCondividi ? (
          <Pressable
            onPress={onCondividi}
            disabled={!!condivisioneInCorso}
            hitSlop={8}
            style={({ pressed }) => [styles.chat, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Condividi la tua posizione"
          >
            {condivisioneInCorso ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Ionicons name="share-outline" size={20} color={colors.accent} />
            )}
          </Pressable>
        ) : null
      ) : (
        <Pressable
          onPress={() => onApriChat(riga.id)}
          disabled={chatInApertura}
          hitSlop={8}
          style={({ pressed }) => [styles.chat, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={`Apri la chat con ${nome}`}
        >
          {chatInApertura ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : (
            <Ionicons name="chatbubble-outline" size={20} color={colors.accent} />
          )}
        </Pressable>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  riga: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  rigaMia: { backgroundColor: colors.elevated, borderColor: colors.border },
  pressed: { opacity: 0.75 },
  rank: {
    width: 34,
    color: colors.muted,
    fontSize: fontSize.sm,
    fontFamily: fontFamily.semibold,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  testi: { flex: 1, minWidth: 0 },
  nome: { color: colors.ink, fontSize: fontSize.base, fontFamily: fontFamily.semibold },
  tu: { color: colors.accentSoft, fontSize: fontSize.sm, fontFamily: fontFamily.medium },
  username: { color: colors.muted, fontSize: fontSize.xs, fontFamily: fontFamily.sans },
  chat: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
