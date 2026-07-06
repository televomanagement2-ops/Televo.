// =============================================================================
// DropHero — il drop a piena larghezza in cima al dettaglio (S3). A differenza
// della card del feed (troncata, con azioni) qui il contenuto è INTERO: foto
// 4:5 (tap → viewer zoom), player vocale prominente, testo completo. Header con
// autore + tempo + menu ⋯ (le azioni vivono nel menu, S6). Nessun contatore qui:
// per l'autore i numeri stanno nel pannello StatistichePrivate sotto l'hero.
// =============================================================================

import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '@/components/ui/Avatar';
import { ViewerMedia } from '@/components/chat/ViewerMedia';
import { DropAudioPlayer } from './DropAudioPlayer';
import { signedUrlDropFoto } from '@/lib/drops';
import { tempoRelativo } from '@/lib/datetime';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';
import type { DropFeedRow } from '@/types/supabase';

interface Props {
  row: DropFeedRow;
  onMenu: () => void;
}

export function DropHero({ row, onMenu }: Props) {
  const nome = row.author.display_name?.trim() || row.author.username;
  return (
    <View style={styles.hero}>
      <View style={styles.header}>
        <Avatar uri={row.author.avatar_url} name={nome} size={44} />
        <View style={styles.headerText}>
          <Text style={styles.nome} numberOfLines={1}>
            {nome}
          </Text>
          <Text style={styles.tempo}>{tempoRelativo(row.created_at)}</Text>
        </View>
        <Pressable hitSlop={10} onPress={onMenu} style={styles.menuBtn}>
          <Ionicons name="ellipsis-horizontal" size={22} color={colors.muted} />
        </Pressable>
      </View>

      {row.type === 'media' ? (
        <FotoHero path={row.media_url} caption={row.body} />
      ) : row.type === 'audio' ? (
        <View style={styles.audioBlock}>
          <DropAudioPlayer path={row.audio_url} seconds={row.audio_seconds} />
          {row.body ? <Text style={styles.caption}>{row.body}</Text> : null}
        </View>
      ) : (
        <Text style={styles.testo}>{row.body}</Text>
      )}
    </View>
  );
}

/** Foto 4:5 a piena larghezza: signed URL lazy, tap → viewer full-screen. */
function FotoHero({ path, caption }: { path: string | null; caption: string | null }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);

  useEffect(() => {
    if (!path) {
      setFailed(true);
      return;
    }
    let vivo = true;
    signedUrlDropFoto(path)
      .then((u) => vivo && setUrl(u))
      .catch(() => vivo && setFailed(true));
    return () => {
      vivo = false;
    };
  }, [path]);

  return (
    <View>
      <Pressable onPress={() => !failed && url && setViewerOpen(true)} style={styles.fotoWrap}>
        {url ? (
          <Image
            source={{ uri: url, cacheKey: path ?? undefined }}
            style={styles.foto}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={150}
            onError={() => setFailed(true)}
          />
        ) : (
          <View style={[styles.foto, styles.fotoPlaceholder]}>
            <Ionicons name={failed ? 'image-outline' : 'image'} size={34} color={colors.faint} />
          </View>
        )}
      </Pressable>
      {caption ? <Text style={styles.caption}>{caption}</Text> : null}
      <ViewerMedia
        visible={viewerOpen}
        path={path}
        caption={caption}
        signer={signedUrlDropFoto}
        onClose={() => setViewerOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { gap: spacing.md, paddingBottom: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerText: { flex: 1, gap: 1 },
  nome: { color: colors.ink, fontSize: fontSize.base, fontFamily: fontFamily.semibold },
  tempo: { color: colors.faint, fontSize: fontSize.xs, fontFamily: fontFamily.medium },
  menuBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  testo: { color: colors.ink, fontSize: fontSize.lg, fontFamily: fontFamily.sans, lineHeight: 27 },
  audioBlock: { gap: spacing.sm },
  fotoWrap: { width: '100%', aspectRatio: 4 / 5, borderRadius: radius.lg, overflow: 'hidden' },
  foto: { width: '100%', height: '100%', backgroundColor: colors.elevated },
  fotoPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  caption: { color: colors.ink, fontSize: fontSize.base, fontFamily: fontFamily.sans, lineHeight: 22 },
});
