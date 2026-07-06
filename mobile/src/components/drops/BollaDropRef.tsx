// =============================================================================
// BollaDropRef — un drop inoltrato/richiamato dentro una bolla di chat (S7, DM5).
// =============================================================================
// Un drop condiviso in chat viaggia come RIFERIMENTO (messages.drop_ref), mai
// come copia (R-08). Qui lo RISOLVIAMO con la RLS del LETTORE via `drop_detail`:
//  · risolvibile  → mini-card (formato + autore + anteprima + "scade tra Xh"),
//    tap → dettaglio S3;
//  · non risolvibile (scaduto, autore non amico del lettore, drop eliminato,
//    utente cancellato) → "Drop non disponibile", IDENTICO in tutti i casi
//    (non riveliamo quale — inoltrare non estende MAI la visibilità).
// La risoluzione è cache-per-id (chiave `dropKeys.detail`): N bolle sullo stesso
// drop = una sola fetch, drop diversi in parallelo (niente waterfall).

import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '@/components/ui/Avatar';
import { dropKeys, fetchDropDetail, signedUrlDropFoto } from '@/lib/drops';
import { tempoRimanente } from '@/lib/datetime';
import { dynamicRoutes } from '@/constants/routes';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';
import type { DropType } from '@/types/supabase';

interface Props {
  dropId: string;
  /** Bolla propria (sfondo accento): usa toni chiari per contrasto. */
  isMine: boolean;
}

export function BollaDropRef({ dropId, isMine }: Props) {
  const router = useRouter();
  // La risoluzione condivide la cache col dettaglio S3 (stessa chiave); staleTime
  // ampio: un riferimento in chat non deve rifare la fetch a ogni render della lista.
  const q = useQuery({
    queryKey: dropKeys.detail(dropId),
    queryFn: () => fetchDropDetail(dropId),
    staleTime: 5 * 60_000,
  });

  const bordo = isMine ? styles.cardMine : styles.cardTheirs;

  if (q.isLoading) {
    return (
      <View style={[styles.card, bordo]}>
        <View style={[styles.thumb, styles.thumbMuted]}>
          <Ionicons name="ellipsis-horizontal" size={18} color={colors.faint} />
        </View>
        <View style={styles.body}>
          <Text style={[styles.title, isMine && styles.titleMine]} numberOfLines={1}>
            Carico il drop…
          </Text>
        </View>
      </View>
    );
  }

  const drop = q.data ?? null;

  // Non risolvibile: bolla neutra identica in tutti i casi (R-08, S7).
  if (!drop) {
    return (
      <View style={[styles.card, bordo]}>
        <View style={[styles.thumb, styles.thumbMuted]}>
          <Ionicons name="cloud-offline-outline" size={18} color={colors.faint} />
        </View>
        <View style={styles.body}>
          <Text style={[styles.title, isMine && styles.titleMine]} numberOfLines={1}>
            Drop non disponibile
          </Text>
          <Text style={[styles.meta, isMine && styles.metaMine]} numberOfLines={1}>
            Scaduto o non più visibile a te.
          </Text>
        </View>
      </View>
    );
  }

  const nome = drop.author.display_name?.trim() || drop.author.username;
  const estratto =
    drop.type === 'audio'
      ? `Vocale 🎙️${drop.audio_seconds ? ` ${mmss(drop.audio_seconds)}` : ''}`
      : drop.type === 'media'
        ? drop.body?.trim() || '📷 Foto'
        : drop.body?.trim() || 'Testo';

  return (
    <Pressable
      style={({ pressed }) => [styles.card, bordo, pressed && styles.pressed]}
      onPress={() => router.push(dynamicRoutes.drop(dropId))}
    >
      <Thumb type={drop.type} path={drop.media_url} />
      <View style={styles.body}>
        <View style={styles.head}>
          <Avatar uri={drop.author.avatar_url} name={nome} size={18} />
          <Text style={[styles.title, isMine && styles.titleMine]} numberOfLines={1}>
            {nome}
          </Text>
        </View>
        <Text style={[styles.estratto, isMine && styles.estrattoMine]} numberOfLines={1}>
          {estratto}
        </Text>
        <Text style={[styles.tempo, isMine && styles.tempoMine]}>
          {tempoRimanente(drop.expires_at)}
        </Text>
      </View>
      <Ionicons
        name="chevron-forward"
        size={16}
        color={isMine ? 'rgba(255,255,255,0.6)' : colors.faint}
      />
    </Pressable>
  );
}

/** secondi → "m:ss" (durata del vocale). */
function mmss(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Miniatura: foto (signed URL lazy) o glifo per audio/testo. Specchio di S4. */
function Thumb({ type, path }: { type: DropType; path: string | null }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (type !== 'media' || !path) return;
    let vivo = true;
    signedUrlDropFoto(path)
      .then((u) => vivo && setUrl(u))
      .catch(() => vivo && setFailed(true));
    return () => {
      vivo = false;
    };
  }, [type, path]);

  if (type === 'media') {
    return url ? (
      <Image
        source={{ uri: url, cacheKey: path ?? undefined }}
        style={styles.thumb}
        contentFit="cover"
        cachePolicy="memory-disk"
      />
    ) : (
      <View style={[styles.thumb, styles.thumbMuted]}>
        <Ionicons name={failed ? 'image-outline' : 'image'} size={18} color={colors.faint} />
      </View>
    );
  }
  return (
    <View style={[styles.thumb, styles.thumbMuted]}>
      <Ionicons
        name={type === 'audio' ? 'mic-outline' : 'document-text-outline'}
        size={18}
        color={colors.muted}
      />
    </View>
  );
}

const THUMB = 44;

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.xs + 2,
    minWidth: 220,
  },
  // Dentro la mia bolla (accento): superficie traslucida chiara.
  cardMine: { backgroundColor: 'rgba(255,255,255,0.12)', borderColor: 'rgba(255,255,255,0.18)' },
  // Dentro la bolla altrui (elevated): superficie di base.
  cardTheirs: { backgroundColor: colors.base, borderColor: colors.border },
  pressed: { opacity: 0.85 },
  thumb: { width: THUMB, height: THUMB, borderRadius: radius.sm, backgroundColor: colors.elevated },
  thumbMuted: { alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: 2 },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  title: { color: colors.ink, fontSize: fontSize.sm, fontFamily: fontFamily.semibold, flexShrink: 1 },
  titleMine: { color: '#ffffff' },
  estratto: { color: colors.muted, fontSize: fontSize.xs, fontFamily: fontFamily.sans },
  estrattoMine: { color: 'rgba(255,255,255,0.85)' },
  meta: { color: colors.faint, fontSize: fontSize.xs, fontFamily: fontFamily.sans },
  metaMine: { color: 'rgba(255,255,255,0.7)' },
  tempo: { color: colors.accentSoft, fontSize: 11, fontFamily: fontFamily.semibold },
  tempoMine: { color: '#dbe6ff' },
});
