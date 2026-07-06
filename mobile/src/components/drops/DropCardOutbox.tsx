// =============================================================================
// DropCardOutbox — card OTTIMISTICA di un drop in pubblicazione (RC-01). Vive in
// testa al feed finché il server non conferma (→ rimossa, arriva la card reale)
// o rifiuta (→ stato failed con Riprova/Elimina). L'anteprima usa i dati LOCALI
// (uri della foto/vocale ancora sul device): nessuna signed URL, nessun round-trip.
// È l'unica superficie dei fallimenti di pubblicazione dal DM2 (ponte DM1 rimosso).
// =============================================================================

import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '@/components/ui/Avatar';
import { useAuth } from '@/hooks/useAuth';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';
import type { DropOutboxItem } from '@/store/dropStore';

interface Props {
  item: DropOutboxItem;
  onRetry: (dropId: string) => void;
  onRemove: (dropId: string) => void;
}

/** secondi → "m:ss". */
function mmss(total: number): string {
  const s = Math.max(0, Math.round(total));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

export function DropCardOutbox({ item, onRetry, onRemove }: Props) {
  const { profile } = useAuth();
  const nome = profile?.display_name?.trim() || profile?.username || 'Tu';
  const failed = item.status === 'failed';

  return (
    <View style={[styles.card, failed && styles.cardFailed]}>
      <View style={styles.header}>
        <Avatar uri={profile?.avatar_url} name={nome} size={40} />
        <View style={styles.headerText}>
          <Text style={styles.nome} numberOfLines={1}>
            {nome}
          </Text>
          <Text style={styles.tempo}>{failed ? 'Non pubblicato' : 'Pubblicazione…'}</Text>
        </View>
        {!failed ? <ActivityIndicator color={colors.muted} /> : null}
      </View>

      {/* Anteprima locale per formato */}
      {item.type === 'media' && item.mediaLocalUri ? (
        <Image source={{ uri: item.mediaLocalUri }} style={styles.foto} contentFit="cover" />
      ) : null}
      {item.type === 'audio' ? (
        <View style={styles.audioBox}>
          <Ionicons name="mic" size={20} color={colors.muted} />
          <Text style={styles.audioText}>Vocale · {mmss(item.audioSeconds ?? 0)}</Text>
        </View>
      ) : null}
      {item.body ? (
        <Text style={styles.body} numberOfLines={item.type === 'text' ? 6 : 2}>
          {item.body}
        </Text>
      ) : null}

      {/* Stato failed: messaggio + azioni */}
      {failed ? (
        <View style={styles.failedBox}>
          <Text style={styles.failedMsg}>{item.errorMessage ?? 'Qualcosa è andato storto.'}</Text>
          <View style={styles.actions}>
            <Pressable style={styles.action} onPress={() => onRetry(item.dropId)}>
              <Ionicons name="refresh" size={16} color={colors.ink} />
              <Text style={styles.actionText}>Riprova</Text>
            </Pressable>
            <Pressable style={styles.action} onPress={() => onRemove(item.dropId)}>
              <Ionicons name="trash-outline" size={16} color={colors.danger} />
              <Text style={[styles.actionText, { color: colors.danger }]}>Elimina</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    padding: spacing.md,
    gap: spacing.md,
    opacity: 0.92,
  },
  cardFailed: { borderColor: colors.danger, opacity: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerText: { flex: 1, gap: 1 },
  nome: { color: colors.ink, fontSize: fontSize.base, fontFamily: fontFamily.semibold },
  tempo: { color: colors.faint, fontSize: fontSize.xs, fontFamily: fontFamily.medium },
  foto: {
    width: '100%',
    aspectRatio: 4 / 5,
    borderRadius: radius.lg,
    backgroundColor: colors.elevated,
  },
  audioBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.elevated,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  audioText: { color: colors.muted, fontSize: fontSize.sm, fontFamily: fontFamily.medium },
  body: { color: colors.ink, fontSize: fontSize.base, fontFamily: fontFamily.sans, lineHeight: 22 },
  failedBox: { gap: spacing.sm },
  failedMsg: { color: colors.danger, fontSize: fontSize.sm, fontFamily: fontFamily.sans },
  actions: { flexDirection: 'row', gap: spacing.sm },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.elevated,
  },
  actionText: { color: colors.ink, fontSize: fontSize.sm, fontFamily: fontFamily.semibold },
});
