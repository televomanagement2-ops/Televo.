// =============================================================================
// PodioAura — il podio 2/1/3 della Classifica Aura (M16 / AC3, classifica.md §3).
// =============================================================================
// Tre colonne: 2° a sinistra, 1° al centro RIALZATO, 3° a destra — un podio
// letterale, con la scritta N° sullo scalino. Sopra ogni scalino l'avatar nel
// cerchio dell'Aura (AuraAvatarRing, lo stesso del profilo); SOLO il 1°
// «respira» (budget animazioni: un solo anello animato per pagina), 2° e 3°
// sono still. Slot mancanti (meno di 3 partecipanti) → cerchio tratteggiato
// vuoto: il layout non collassa mai (§10.2). Sul PROPRIO slot compare l'icona
// condividi (AC4, §6 — la propria riga non esiste in lista quando si è nel
// podio: il punto d'ingresso dello share vive qui).

import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AuraAvatarRing } from '@/components/aura/AuraAvatarRing';
import { Avatar } from '@/components/ui/Avatar';
import { auraRingColor } from '@/constants/aura';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';
import type { ClassificaAuraRigaRaw } from '@/types/supabase';

interface Props {
  /** Le prime (fino a) 3 righe della classifica, in ordine di rank. */
  primi: ClassificaAuraRigaRaw[];
  onApriProfilo: (riga: ClassificaAuraRigaRaw) => void;
  /** Avvia la share card (AC4); mostrata SOLO sul proprio slot, null = niente. */
  onCondividi?: (() => void) | null;
  /** True mentre la cattura/condivisione è in volo. */
  condivisioneInCorso?: boolean;
}

// Geometria per gradino: il 1° domina, 2° e 3° digradano (podio classico).
const SLOT = {
  1: { avatar: 64, scalino: 64 },
  2: { avatar: 50, scalino: 44 },
  3: { avatar: 50, scalino: 32 },
} as const;

export function PodioAura({ primi, onApriProfilo, onCondividi, condivisioneInCorso }: Props) {
  const perRank = (rank: 1 | 2 | 3) => primi.find((r) => r.rank === rank) ?? null;
  const slot = (rank: 1 | 2 | 3) => (
    <SlotPodio
      rank={rank}
      riga={perRank(rank)}
      onApriProfilo={onApriProfilo}
      onCondividi={onCondividi}
      condivisioneInCorso={condivisioneInCorso}
    />
  );

  return (
    <View style={styles.podio} accessibilityRole="header" accessibilityLabel="Podio Aura">
      {slot(2)}
      {slot(1)}
      {slot(3)}
    </View>
  );
}

function SlotPodio({
  rank,
  riga,
  onApriProfilo,
  onCondividi,
  condivisioneInCorso,
}: {
  rank: 1 | 2 | 3;
  riga: ClassificaAuraRigaRaw | null;
  onApriProfilo: (riga: ClassificaAuraRigaRaw) => void;
  onCondividi?: (() => void) | null;
  condivisioneInCorso?: boolean;
}) {
  const geo = SLOT[rank];
  const nome = riga ? riga.display_name || riga.username : null;
  const percento = riga ? Math.round(riga.aura_score) : null;

  return (
    <View style={styles.colonna}>
      {riga ? (
        <Pressable
          onPress={() => onApriProfilo(riga)}
          style={({ pressed }) => [styles.persona, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={`${rank}° in classifica: ${nome}, Aura ${percento}%`}
        >
          <AuraAvatarRing percent={riga.aura_score} size={geo.avatar} still={rank !== 1}>
            <Avatar uri={riga.avatar_url} name={nome} size={geo.avatar} />
          </AuraAvatarRing>
          {/* Nome su UNA riga con ellissi: i nomi lunghi non spostano gli scalini.
              Il PROPRIO slot è evidenziato (§10.13). */}
          <Text style={[styles.nome, riga.is_me && styles.nomeMio]} numberOfLines={1}>
            {nome}
          </Text>
          <Text style={[styles.percento, { color: auraRingColor(riga.aura_score) }]}>
            {percento}%
          </Text>
          {/* Punto d'ingresso share sul PROPRIO slot (AC4, §6). */}
          {riga.is_me && onCondividi ? (
            <Pressable
              onPress={onCondividi}
              disabled={!!condivisioneInCorso}
              hitSlop={8}
              style={({ pressed }) => [styles.condividi, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Condividi la tua posizione"
            >
              {condivisioneInCorso ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <Ionicons name="share-outline" size={16} color={colors.accent} />
              )}
            </Pressable>
          ) : null}
        </Pressable>
      ) : (
        // Slot vuoto: lo scalino resta, il cerchio è un placeholder tratteggiato.
        <View style={styles.persona}>
          <View style={[styles.vuoto, { width: geo.avatar, height: geo.avatar }]} />
          <Text style={styles.nomeVuoto} numberOfLines={1}>
            —
          </Text>
        </View>
      )}
      <View style={[styles.scalino, { height: geo.scalino }, rank === 1 && styles.scalinoPrimo]}>
        <Text style={[styles.scalinoLabel, rank === 1 && styles.scalinoLabelPrimo]}>{rank}°</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  podio: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  colonna: { flex: 1, alignItems: 'stretch' },
  persona: { alignItems: 'center', gap: 2, marginBottom: spacing.sm },
  pressed: { opacity: 0.75 },
  nome: {
    color: colors.ink,
    fontSize: fontSize.sm,
    fontFamily: fontFamily.semibold,
    maxWidth: '96%',
  },
  nomeMio: { color: colors.accentSoft },
  nomeVuoto: { color: colors.faint, fontSize: fontSize.sm, fontFamily: fontFamily.medium },
  percento: { fontSize: fontSize.xs, fontFamily: fontFamily.semibold },
  condividi: {
    marginTop: 2,
    width: 30,
    height: 30,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vuoto: {
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.border,
    marginBottom: 2,
  },
  scalino: {
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scalinoPrimo: { backgroundColor: colors.surface, borderColor: colors.accentDeep },
  scalinoLabel: {
    color: colors.muted,
    fontSize: fontSize.lg,
    fontFamily: fontFamily.displayBold,
  },
  scalinoLabelPrimo: { color: colors.accentSoft },
});
