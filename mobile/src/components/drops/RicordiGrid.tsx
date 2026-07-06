// =============================================================================
// RicordiGrid — l'archivio privato dell'autore (S5, DM4). La memoria stile BeReal
// Memories: i miei drop SCADUTI, visibili solo a me, per rivivere il momento e le
// statistiche FINALI congelate (R-01). Due parti:
//   · RicordiGrid → griglia a 2 colonne (thumbnail foto / glifo audio / estratto
//     testo), con la data del giorno; tap → apre il Ricordo.
//   · RicordoView → il contenuto INTERO + `stats_finali` ("Il tuo drop ha fatto
//     compagnia a: ♥ 12 · 💬 5 · 🔖 2 · 😂 4") + ⋯ → Elimina definitivamente.
// Niente contatori live (cancellati alla scadenza): solo lo snapshot. I file si
// firmano on-demand; se già ripuliti da un cleanup mostriamo un placeholder.
// =============================================================================

import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { DropAudioPlayer } from './DropAudioPlayer';
import { ViewerMedia } from '@/components/chat/ViewerMedia';
import { confermaEliminaDrop } from './MenuDrop';
import { signedUrlDropFoto } from '@/lib/drops';
import { mostraMenu } from '@/lib/dialoghi';
import { dayLabel } from '@/lib/datetime';
import { DROP_REACTION_EMOJI } from '@/constants/drops';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';
import type { DropReactionTrait, DropStatsFinali, MemoryRow } from '@/types/supabase';

// --- Griglia ------------------------------------------------------------------

interface RicordiGridProps {
  memories: MemoryRow[];
  onOpen: (m: MemoryRow) => void;
  onEndReached?: () => void;
  loadingMore?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  ListEmptyComponent?: React.ReactElement;
}

export function RicordiGrid({
  memories,
  onOpen,
  onEndReached,
  loadingMore,
  refreshing,
  onRefresh,
  ListEmptyComponent,
}: RicordiGridProps) {
  return (
    <FlatList
      data={memories}
      keyExtractor={(m) => m.id}
      numColumns={2}
      columnWrapperStyle={styles.gridRow}
      contentContainerStyle={styles.grid}
      showsVerticalScrollIndicator={false}
      renderItem={({ item }) => <Cell memory={item} onOpen={onOpen} />}
      onEndReachedThreshold={0.6}
      onEndReached={onEndReached}
      refreshing={!!refreshing}
      onRefresh={onRefresh}
      ListEmptyComponent={ListEmptyComponent}
      ListFooterComponent={
        loadingMore ? (
          <View style={styles.footerSpinner}>
            <ActivityIndicator color={colors.muted} />
          </View>
        ) : null
      }
    />
  );
}

/** Cella della griglia: thumbnail 4:5 + overlay data/tipo. */
function Cell({ memory, onOpen }: { memory: MemoryRow; onOpen: (m: MemoryRow) => void }) {
  return (
    <Pressable style={styles.cell} onPress={() => onOpen(memory)}>
      <MemoryThumb type={memory.type} path={memory.media_url} body={memory.body} />
      <View style={styles.cellOverlay}>
        <Ionicons name={glifo(memory.type)} size={13} color="#ffffff" />
        <Text style={styles.cellDate}>{dayLabel(memory.created_at)}</Text>
      </View>
    </Pressable>
  );
}

function glifo(type: MemoryRow['type']): keyof typeof Ionicons.glyphMap {
  return type === 'audio' ? 'mic' : type === 'media' ? 'image' : 'document-text';
}

/** Miniatura della cella: foto (signed URL lazy) o blocco con estratto testo. */
function MemoryThumb({ type, path, body }: { type: MemoryRow['type']; path: string | null; body: string | null }) {
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
      <Image source={{ uri: url, cacheKey: path ?? undefined }} style={styles.thumb} contentFit="cover" cachePolicy="memory-disk" />
    ) : (
      <View style={[styles.thumb, styles.thumbMuted]}>
        <Ionicons name={failed ? 'image-outline' : 'image'} size={28} color={colors.faint} />
      </View>
    );
  }
  if (type === 'audio') {
    return (
      <View style={[styles.thumb, styles.thumbMuted]}>
        <Ionicons name="mic" size={28} color={colors.muted} />
      </View>
    );
  }
  return (
    <View style={[styles.thumb, styles.thumbTesto]}>
      <Text style={styles.thumbEstratto} numberOfLines={5}>
        {body}
      </Text>
    </View>
  );
}

// --- Vista Ricordo (contenuto intero + statistiche finali) --------------------

interface RicordoViewProps {
  memory: MemoryRow;
  onDelete: () => void;
  onClose: () => void;
}

export function RicordoView({ memory, onDelete, onClose }: RicordoViewProps) {
  const menu = () => {
    mostraMenu({
      titolo: 'Ricordo',
      voci: [
        {
          label: 'Elimina definitivamente',
          icon: 'trash-outline',
          danger: true,
          onPress: () => confermaEliminaDrop(true, onDelete),
        },
      ],
    });
  };

  return (
    <SafeAreaView style={styles.viewSafe} edges={['top']}>
      <View style={styles.viewHeader}>
        <Pressable onPress={onClose} hitSlop={10} style={styles.viewBtn}>
          <Ionicons name="close" size={26} color={colors.ink} />
        </Pressable>
        <Text style={styles.viewTitle}>{dayLabel(memory.created_at)}</Text>
        <Pressable onPress={menu} hitSlop={10} style={styles.viewBtn}>
          <Ionicons name="ellipsis-horizontal" size={22} color={colors.muted} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.viewContent} showsVerticalScrollIndicator={false}>
        <RicordoContenuto memory={memory} />
        <StatsFinali stats={memory.stats_finali} />
      </ScrollView>
    </SafeAreaView>
  );
}

/** Il contenuto del Ricordo per formato (intero). */
function RicordoContenuto({ memory }: { memory: MemoryRow }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);

  useEffect(() => {
    if (memory.type !== 'media' || !memory.media_url) return;
    let vivo = true;
    signedUrlDropFoto(memory.media_url)
      .then((u) => vivo && setUrl(u))
      .catch(() => vivo && setFailed(true));
    return () => {
      vivo = false;
    };
  }, [memory.type, memory.media_url]);

  if (memory.type === 'media') {
    return (
      <View>
        <Pressable onPress={() => url && !failed && setViewerOpen(true)} style={styles.fotoWrap}>
          {url ? (
            <Image source={{ uri: url, cacheKey: memory.media_url ?? undefined }} style={styles.foto} contentFit="cover" cachePolicy="memory-disk" onError={() => setFailed(true)} />
          ) : (
            <View style={[styles.foto, styles.thumbMuted]}>
              <Ionicons name={failed ? 'image-outline' : 'image'} size={34} color={colors.faint} />
            </View>
          )}
        </Pressable>
        {failed ? <Text style={styles.fileGone}>File non più disponibile.</Text> : null}
        {memory.body ? <Text style={styles.caption}>{memory.body}</Text> : null}
        <ViewerMedia visible={viewerOpen} path={memory.media_url} caption={memory.body} signer={signedUrlDropFoto} onClose={() => setViewerOpen(false)} />
      </View>
    );
  }
  if (memory.type === 'audio') {
    return (
      <View style={styles.audioBlock}>
        <DropAudioPlayer path={memory.audio_url} seconds={memory.audio_seconds} />
        {memory.body ? <Text style={styles.caption}>{memory.body}</Text> : null}
      </View>
    );
  }
  return <Text style={styles.testo}>{memory.body}</Text>;
}

/** Le statistiche finali congelate (§2.8). Nessun numero live: solo lo snapshot. */
function StatsFinali({ stats }: { stats: DropStatsFinali | null }) {
  if (!stats) {
    return <Text style={styles.statsVuote}>Statistiche non disponibili per questo Ricordo.</Text>;
  }
  const reazioni = stats.reactions ?? {};
  const reazioniAttive = (Object.keys(reazioni) as DropReactionTrait[]).filter((t) => (reazioni[t] ?? 0) > 0);
  return (
    <View style={styles.statsCard}>
      <Text style={styles.statsTitle}>Il tuo drop ha fatto compagnia a</Text>
      <View style={styles.statsRow}>
        <Voce icon="heart" n={stats.likes} tint={colors.danger} />
        <Voce icon="chatbubble" n={stats.comments} />
        <Voce icon="bookmark" n={stats.saves} tint={colors.accentSoft} />
        {reazioniAttive.map((t) => (
          <View key={t} style={styles.voce}>
            <Text style={styles.emoji}>{DROP_REACTION_EMOJI[t]}</Text>
            <Text style={styles.num}>{reazioni[t]}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function Voce({ icon, n, tint }: { icon: keyof typeof Ionicons.glyphMap; n: number; tint?: string }) {
  return (
    <View style={styles.voce}>
      <Ionicons name={icon} size={16} color={tint ?? colors.muted} />
      <Text style={styles.num}>{n}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // Griglia
  grid: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing['3xl'] },
  gridRow: { gap: spacing.md },
  cell: { flex: 1, aspectRatio: 4 / 5, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.elevated },
  thumb: { width: '100%', height: '100%', backgroundColor: colors.elevated },
  thumbMuted: { alignItems: 'center', justifyContent: 'center' },
  thumbTesto: { padding: spacing.md, justifyContent: 'center', backgroundColor: colors.surface },
  thumbEstratto: { color: colors.ink, fontSize: fontSize.sm, fontFamily: fontFamily.sans, lineHeight: 20 },
  cellOverlay: {
    position: 'absolute',
    left: spacing.sm,
    bottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: radius.full,
  },
  cellDate: { color: '#ffffff', fontSize: fontSize.xs, fontFamily: fontFamily.semibold },
  footerSpinner: { paddingVertical: spacing.xl, alignItems: 'center' },

  // Vista Ricordo
  viewSafe: { flex: 1, backgroundColor: colors.base },
  viewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  viewBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  viewTitle: { color: colors.ink, fontSize: fontSize.base, fontFamily: fontFamily.semibold },
  viewContent: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing['3xl'] },
  fotoWrap: { width: '100%', aspectRatio: 4 / 5, borderRadius: radius.lg, overflow: 'hidden' },
  foto: { width: '100%', height: '100%', backgroundColor: colors.elevated },
  fileGone: { color: colors.muted, fontStyle: 'italic', fontSize: fontSize.sm, fontFamily: fontFamily.sans, marginTop: spacing.sm },
  audioBlock: { gap: spacing.sm },
  caption: { color: colors.ink, fontSize: fontSize.base, fontFamily: fontFamily.sans, lineHeight: 22, marginTop: spacing.sm },
  testo: { color: colors.ink, fontSize: fontSize.lg, fontFamily: fontFamily.sans, lineHeight: 27 },

  // Statistiche finali
  statsCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  statsTitle: { color: colors.muted, fontSize: fontSize.sm, fontFamily: fontFamily.medium },
  statsRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.lg },
  statsVuote: { color: colors.faint, fontSize: fontSize.sm, fontFamily: fontFamily.sans, textAlign: 'center' },
  voce: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  emoji: { fontSize: 15 },
  num: { color: colors.ink, fontSize: fontSize.sm, fontFamily: fontFamily.semibold },
});
