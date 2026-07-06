// =============================================================================
// S4 — Salvati (DM4). I miei segnalibri: lista compatta dei drop che ho salvato,
// con il TEMPO RIMANENTE in evidenza ("scade tra 3h") — promemoria esplicito
// dell'effimerità (D-1: il segnalibro vive quanto il drop, max 24h). Tap → S3;
// menu ⋯ → Rimuovi dai salvati. I salvataggi di drop scaduti sono già stati
// cancellati dal sistema, quindi qui i drop sono quasi sempre vivi; se uno scade
// tra il fetch e il tap, S3 mostra "non disponibile" e la riga sparisce al refetch.
// =============================================================================

import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '@/components/ui/Avatar';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { StatoErrore } from '@/components/ui/StatoErrore';
import { useRemoveSave, useSavedDrops } from '@/hooks/useDrops';
import { signedUrlDropFoto } from '@/lib/drops';
import { avvisa, mostraMenu } from '@/lib/dialoghi';
import { dropErrorMessage } from '@/lib/errors';
import { tempoRimanente } from '@/lib/datetime';
import { dynamicRoutes } from '@/constants/routes';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';
import type { DropType, SavedDropRow } from '@/types/supabase';

export default function Salvati() {
  const q = useSavedDrops();
  const { mutate: removeSave } = useRemoveSave();
  const rows = q.data ?? [];

  const apri = useCallback((dropId: string) => router.push(dynamicRoutes.drop(dropId)), []);
  // Rimozione ottimistica: l'hook fa rollback su errore (la riga riappare), qui
  // aggiungiamo solo il feedback. Nessuna dipendenza dalla query (deps stabili).
  const rimuovi = useCallback(
    (dropId: string) => {
      mostraMenu({
        titolo: 'Salvati',
        voci: [
          {
            label: 'Rimuovi dai salvati',
            icon: 'bookmark',
            danger: true,
            onPress: () => removeSave(dropId, { onError: (e) => avvisa('Ops', dropErrorMessage(e)) }),
          },
        ],
      });
    },
    [removeSave],
  );

  const renderItem = useCallback(
    ({ item }: { item: SavedDropRow }) => (
      <SalvatoRow item={item} onOpen={apri} onMenu={rimuovi} />
    ),
    [apri, rimuovi],
  );

  let content: React.ReactNode;
  if (q.isLoading) {
    content = <LoadingSpinner label="Carico i salvati…" style={styles.flex} />;
  } else if (q.isError) {
    content = <StatoErrore messaggio={dropErrorMessage(q.error)} onRetry={() => void q.refetch()} />;
  } else {
    content = (
      <FlatList
        data={rows}
        keyExtractor={(it) => it.drop_id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshing={q.isRefetching}
        onRefresh={() => void q.refetch()}
        ListHeaderComponent={
          rows.length > 0 ? (
            <Text style={styles.hint}>I salvataggi vivono quanto il drop: max 24h.</Text>
          ) : null
        }
        ListEmptyComponent={<Vuoto />}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>Salvati</Text>
        <View style={styles.headerBtn} />
      </View>
      {content}
    </SafeAreaView>
  );
}

// --- Riga del segnalibro ------------------------------------------------------

function SalvatoRow({
  item,
  onOpen,
  onMenu,
}: {
  item: SavedDropRow;
  onOpen: (dropId: string) => void;
  onMenu: (dropId: string) => void;
}) {
  const drop = item.drop;

  // Drop non più visibile (scaduto/ex-amico tra fetch e render): riga neutra.
  if (!drop) {
    return (
      <View style={styles.row}>
        <View style={[styles.thumb, styles.thumbMuted]}>
          <Ionicons name="cloud-offline-outline" size={20} color={colors.faint} />
        </View>
        <View style={styles.rowBody}>
          <Text style={styles.nome}>Drop non disponibile</Text>
          <Text style={styles.meta}>Potrebbe essere scaduto o non più visibile.</Text>
        </View>
        <Pressable hitSlop={10} onPress={() => onMenu(item.drop_id)} style={styles.menuBtn}>
          <Ionicons name="ellipsis-horizontal" size={20} color={colors.muted} />
        </Pressable>
      </View>
    );
  }

  const nome = drop.author.display_name?.trim() || drop.author.username;
  const estratto =
    drop.type === 'audio'
      ? 'Vocale 🎙️'
      : drop.type === 'media'
        ? drop.body?.trim() || 'Foto'
        : drop.body?.trim() || 'Testo';

  return (
    <Pressable style={styles.row} onPress={() => onOpen(drop.id)}>
      <Thumb type={drop.type} path={drop.media_url} />
      <View style={styles.rowBody}>
        <View style={styles.rowHead}>
          <Avatar uri={drop.author.avatar_url} name={nome} size={20} />
          <Text style={styles.nome} numberOfLines={1}>
            {nome}
          </Text>
        </View>
        <Text style={styles.estratto} numberOfLines={1}>
          {estratto}
        </Text>
        <Text style={styles.tempo}>{tempoRimanente(drop.expires_at)}</Text>
      </View>
      <Pressable hitSlop={10} onPress={() => onMenu(drop.id)} style={styles.menuBtn}>
        <Ionicons name="ellipsis-horizontal" size={20} color={colors.muted} />
      </Pressable>
    </Pressable>
  );
}

/** Miniatura: foto (signed URL lazy) o glifo per audio/testo. */
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
      <Image source={{ uri: url, cacheKey: path ?? undefined }} style={styles.thumb} contentFit="cover" cachePolicy="memory-disk" />
    ) : (
      <View style={[styles.thumb, styles.thumbMuted]}>
        <Ionicons name={failed ? 'image-outline' : 'image'} size={20} color={colors.faint} />
      </View>
    );
  }
  return (
    <View style={[styles.thumb, styles.thumbMuted]}>
      <Ionicons name={type === 'audio' ? 'mic-outline' : 'document-text-outline'} size={20} color={colors.muted} />
    </View>
  );
}

function Vuoto() {
  return (
    <View style={styles.vuoto}>
      <Ionicons name="bookmark-outline" size={40} color={colors.faint} />
      <Text style={styles.vuotoTitle}>Niente in dispensa</Text>
      <Text style={styles.vuotoSub}>
        I drop salvati vivono qui per 24h. Salvane uno dal ⋯ di un drop.
      </Text>
    </View>
  );
}

const THUMB = 52;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.base },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: colors.ink, fontSize: fontSize.lg, fontFamily: fontFamily.semibold },

  list: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing['3xl'] },
  hint: {
    color: colors.muted,
    fontSize: fontSize.xs,
    fontFamily: fontFamily.medium,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.sm,
  },
  thumb: { width: THUMB, height: THUMB, borderRadius: radius.md, backgroundColor: colors.elevated },
  thumbMuted: { alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1, gap: 3 },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  nome: { color: colors.ink, fontSize: fontSize.sm, fontFamily: fontFamily.semibold, flexShrink: 1 },
  estratto: { color: colors.muted, fontSize: fontSize.sm, fontFamily: fontFamily.sans },
  meta: { color: colors.faint, fontSize: fontSize.xs, fontFamily: fontFamily.sans },
  tempo: { color: colors.accentSoft, fontSize: fontSize.xs, fontFamily: fontFamily.semibold },
  menuBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },

  vuoto: { alignItems: 'center', paddingVertical: spacing['4xl'], paddingHorizontal: spacing.xl, gap: spacing.sm },
  vuotoTitle: { color: colors.ink, fontSize: fontSize.lg, fontFamily: fontFamily.semibold, marginTop: spacing.sm },
  vuotoSub: {
    color: colors.muted,
    fontSize: fontSize.sm,
    fontFamily: fontFamily.sans,
    textAlign: 'center',
    lineHeight: 20,
  },
});
