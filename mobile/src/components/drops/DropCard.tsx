// =============================================================================
// DropCard — la card di un drop nel feed (S1). Tre varianti per formato:
//   · foto  → immagine 4:5 (tap → viewer full-screen; doppio tap → like) + caption
//   · audio → player prominente (durata da audio_seconds, lazy signed URL) + caption
//   · testo → corpo tipografico denso, troncato con "mostra tutto"
// Footer (§S1, R-04): se il drop è MIO mostro i contatori privati inline; se è di
// un amico mostro le AZIONI senza NESSUN numero — ♥ like, 💬 commenti (→ S3),
// 🔖 salva, 🎙️ reazione vocale (stub fino a DM3). Long-press ♥ → barra reaction-
// tratto (gesto forte → prop → Aura). Doppio tap sulla foto = like (Instagram-
// style: sul testo/audio il like è sul ♥, così il tap singolo apre S3 senza attesa).
// Tutte le mutazioni sono ottimistiche (gli handler arrivano dal feed).
// =============================================================================

import { memo, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Avatar } from '@/components/ui/Avatar';
import { ViewerMedia } from '@/components/chat/ViewerMedia';
import { DropAudioPlayer } from './DropAudioPlayer';
import { DropReactionBar } from './DropReactionBar';
import { signedUrlDropFoto } from '@/lib/drops';
import { tempoRelativo } from '@/lib/datetime';
import { DROP_REACTION_EMOJI } from '@/constants/drops';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';
import type { DropFeedRow, DropReactionTrait } from '@/types/supabase';

export interface DropCardHandlers {
  onOpen: (dropId: string) => void;
  onLike: (dropId: string, next: boolean) => void;
  onSave: (dropId: string, next: boolean) => void;
  onReaction: (dropId: string, trait: DropReactionTrait, next: boolean) => void;
  onMenu: (row: DropFeedRow) => void;
  /** Reazione vocale rapida (§16.1): press-and-hold sul mic → registra ≤10s. */
  onVoiceStart: (dropId: string) => void;
  onVoiceStop: () => void;
}

interface Props extends DropCardHandlers {
  row: DropFeedRow;
  /** Il drop è mio? (contatori privati inline al posto delle azioni). */
  mine: boolean;
}

// Soglia (caratteri) oltre cui un testo mostra il "mostra tutto" (evita di
// misurare le righe: euristica economica per una card che vive in una lista).
const TESTO_LUNGO = 320;
const DOUBLE_TAP_MS = 260;

function DropCardComponent({
  row,
  mine,
  onOpen,
  onLike,
  onSave,
  onReaction,
  onMenu,
  onVoiceStart,
  onVoiceStop,
}: Props) {
  const [showReactions, setShowReactions] = useState(false);
  const nome = row.author.display_name?.trim() || row.author.username;

  return (
    <View style={styles.card}>
      {/* Header: autore + tempo + ⋯ */}
      <View style={styles.header}>
        <Avatar uri={row.author.avatar_url} name={nome} size={40} />
        <View style={styles.headerText}>
          <Text style={styles.nome} numberOfLines={1}>
            {nome}
          </Text>
          <Text style={styles.tempo}>{tempoRelativo(row.created_at)}</Text>
        </View>
        <Pressable
          hitSlop={10}
          onPress={() => onMenu(row)}
          style={styles.menuBtn}
          accessibilityRole="button"
          accessibilityLabel="Altre opzioni"
        >
          <Ionicons name="ellipsis-horizontal" size={20} color={colors.muted} />
        </Pressable>
      </View>

      {/* Corpo per formato */}
      <Corpo
        row={row}
        onOpen={() => onOpen(row.id)}
        // Doppio tap = like, ma non sui PROPRI drop (non ha senso auto-likarsi).
        onDoubleTapLike={mine ? undefined : () => onLike(row.id, true)}
      />

      {/* Barra reaction-tratto (long-press ♥) */}
      {showReactions && !mine ? (
        <DropReactionBar
          mine={row.mie_reactions}
          onPick={(trait, next) => {
            setShowReactions(false);
            onReaction(row.id, trait, next);
          }}
        />
      ) : null}

      {/* Footer: contatori privati (mio) o azioni (amico) */}
      {mine ? (
        <StatRow row={row} onOpen={() => onOpen(row.id)} />
      ) : (
        <AzioniRow
          row={row}
          onOpen={() => onOpen(row.id)}
          onLike={(next) => onLike(row.id, next)}
          onSave={(next) => onSave(row.id, next)}
          onLongLike={() => setShowReactions((v) => !v)}
          onVoiceStart={() => onVoiceStart(row.id)}
          onVoiceStop={onVoiceStop}
        />
      )}
    </View>
  );
}

// --- Corpo per formato --------------------------------------------------------

function Corpo({
  row,
  onOpen,
  onDoubleTapLike,
}: {
  row: DropFeedRow;
  onOpen: () => void;
  /** Doppio tap sulla foto = like; assente (drop mio) → il doppio tap apre il viewer. */
  onDoubleTapLike?: () => void;
}) {
  if (row.type === 'media') {
    return <FotoBody path={row.media_url} caption={row.body} onDoubleTapLike={onDoubleTapLike} />;
  }
  if (row.type === 'audio') {
    // Il player gestisce i PROPRI tap (play/pausa): niente Pressable esterna che
    // li intercetti. La caption apre S3; senza caption si entra dal 💬.
    return (
      <View>
        <DropAudioPlayer path={row.audio_url} seconds={row.audio_seconds} />
        {row.body ? (
          <Text style={styles.caption} onPress={onOpen}>
            {row.body}
          </Text>
        ) : null}
      </View>
    );
  }
  return <TestoBody body={row.body} onOpen={onOpen} />;
}

/** Testo denso, troncato a 8 righe con "mostra tutto" (euristica sulla lunghezza). */
function TestoBody({ body, onOpen }: { body: string | null; onOpen: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const lungo = (body?.length ?? 0) > TESTO_LUNGO;
  return (
    <View>
      <Pressable onPress={onOpen}>
        <Text style={styles.testo} numberOfLines={expanded ? undefined : 8}>
          {body}
        </Text>
      </Pressable>
      {/* Fuori dalla Pressable: "Mostra tutto" espande soltanto, non apre S3. */}
      {lungo && !expanded ? (
        <Text style={styles.mostraTutto} onPress={() => setExpanded(true)}>
          Mostra tutto
        </Text>
      ) : null}
    </View>
  );
}

/** Foto 4:5: signed URL lazy, tap → viewer, doppio tap → like. */
function FotoBody({
  path,
  caption,
  onDoubleTapLike,
}: {
  path: string | null;
  caption: string | null;
  onDoubleTapLike?: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const lastTap = useRef(0);
  const singleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Cleanup del timer del singolo tap (evita chiamate dopo l'unmount).
  useEffect(
    () => () => {
      if (singleTimer.current) clearTimeout(singleTimer.current);
    },
    [],
  );

  const onTap = () => {
    const now = Date.now();
    if (now - lastTap.current < DOUBLE_TAP_MS) {
      if (singleTimer.current) {
        clearTimeout(singleTimer.current);
        singleTimer.current = null;
      }
      lastTap.current = 0;
      // Doppio tap: like se consentito (drop di un amico); altrimenti apri il viewer.
      if (onDoubleTapLike) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onDoubleTapLike();
      } else if (!failed) {
        setViewerOpen(true);
      }
    } else {
      lastTap.current = now;
      singleTimer.current = setTimeout(() => {
        singleTimer.current = null;
        if (!failed) setViewerOpen(true);
      }, DOUBLE_TAP_MS);
    }
  };

  return (
    <View>
      <Pressable onPress={onTap} style={styles.fotoWrap}>
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
            <Ionicons name={failed ? 'image-outline' : 'image'} size={30} color={colors.faint} />
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

// --- Footer: contatori privati (drop mio) -------------------------------------

function StatRow({ row, onOpen }: { row: DropFeedRow; onOpen: () => void }) {
  const reazioni = row.reaction_counts ?? {};
  const reazioniAttive = (Object.keys(reazioni) as DropReactionTrait[]).filter(
    (t) => (reazioni[t] ?? 0) > 0,
  );
  return (
    <View style={styles.footer}>
      <Stat icon="heart" value={row.like_count} />
      <Pressable style={styles.statBtn} hitSlop={6} onPress={onOpen}>
        <Ionicons name="chatbubble-outline" size={18} color={colors.muted} />
        <Text style={styles.statNum}>{row.comment_count ?? 0}</Text>
      </Pressable>
      <Stat icon="bookmark" value={row.save_count} />
      {reazioniAttive.map((t) => (
        <View key={t} style={styles.statBtn}>
          <Text style={styles.statEmoji}>{DROP_REACTION_EMOJI[t]}</Text>
          <Text style={styles.statNum}>{reazioni[t]}</Text>
        </View>
      ))}
    </View>
  );
}

function Stat({ icon, value }: { icon: keyof typeof Ionicons.glyphMap; value: number | null }) {
  return (
    <View style={styles.statBtn}>
      <Ionicons name={icon} size={18} color={colors.muted} />
      <Text style={styles.statNum}>{value ?? 0}</Text>
    </View>
  );
}

// --- Footer: azioni (drop di un amico, NESSUN numero) -------------------------

function AzioniRow({
  row,
  onOpen,
  onLike,
  onSave,
  onLongLike,
  onVoiceStart,
  onVoiceStop,
}: {
  row: DropFeedRow;
  onOpen: () => void;
  onLike: (next: boolean) => void;
  onSave: (next: boolean) => void;
  onLongLike: () => void;
  onVoiceStart: () => void;
  onVoiceStop: () => void;
}) {
  const haReazioni = row.mie_reactions.length > 0;
  return (
    <View style={styles.footer}>
      <Pressable
        style={styles.azione}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={row.mio_like ? 'Togli mi piace' : 'Mi piace'}
        accessibilityHint="Tieni premuto per dare Aura"
        accessibilityState={{ selected: row.mio_like }}
        onPress={() => {
          Haptics.selectionAsync().catch(() => {});
          onLike(!row.mio_like);
        }}
        onLongPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          onLongLike();
        }}
      >
        <Ionicons
          name={row.mio_like ? 'heart' : 'heart-outline'}
          size={22}
          color={row.mio_like ? colors.danger : colors.muted}
        />
      </Pressable>

      <Pressable
        style={styles.azione}
        hitSlop={12}
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel="Commenti"
      >
        <Ionicons
          name={row.ha_commenti ? 'chatbubble' : 'chatbubble-outline'}
          size={20}
          color={colors.muted}
        />
      </Pressable>

      <Pressable
        style={styles.azione}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={row.mio_salvataggio ? 'Rimuovi dai salvati' : 'Salva'}
        accessibilityState={{ selected: row.mio_salvataggio }}
        onPress={() => {
          Haptics.selectionAsync().catch(() => {});
          onSave(!row.mio_salvataggio);
        }}
      >
        <Ionicons
          name={row.mio_salvataggio ? 'bookmark' : 'bookmark-outline'}
          size={20}
          color={row.mio_salvataggio ? colors.accentSoft : colors.muted}
        />
      </Pressable>

      {/* Reazione vocale rapida (§16.1, DM3): press-and-hold → registra un
          commento audio ≤10s senza aprire il dettaglio. Il tap breve non
          registra (parte solo col long-press); il rilascio ferma e invia. */}
      <Pressable
        style={styles.azione}
        hitSlop={12}
        delayLongPress={250}
        accessibilityRole="button"
        accessibilityLabel="Reazione vocale"
        accessibilityHint="Tieni premuto per registrare un vocale breve"
        onLongPress={onVoiceStart}
        onPressOut={onVoiceStop}
      >
        <Ionicons name="mic-outline" size={20} color={colors.muted} />
      </Pressable>

      {/* Indicatore discreto dei tratti che ho già dato (nessun numero). */}
      {haReazioni ? (
        <Text style={styles.mieReazioni}>
          {row.mie_reactions.map((t) => DROP_REACTION_EMOJI[t]).join(' ')}
        </Text>
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
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerText: { flex: 1, gap: 1 },
  nome: { color: colors.ink, fontSize: fontSize.base, fontFamily: fontFamily.semibold },
  tempo: { color: colors.faint, fontSize: fontSize.xs, fontFamily: fontFamily.medium },
  menuBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },

  // Corpo
  testo: { color: colors.ink, fontSize: fontSize.lg, fontFamily: fontFamily.sans, lineHeight: 26 },
  mostraTutto: {
    color: colors.accentSoft,
    fontSize: fontSize.sm,
    fontFamily: fontFamily.semibold,
    marginTop: spacing.xs,
  },
  fotoWrap: { width: '100%', aspectRatio: 4 / 5, borderRadius: radius.lg, overflow: 'hidden' },
  foto: { width: '100%', height: '100%', backgroundColor: colors.elevated },
  fotoPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  caption: {
    color: colors.ink,
    fontSize: fontSize.sm,
    fontFamily: fontFamily.sans,
    lineHeight: 20,
    marginTop: spacing.sm,
  },

  // Footer
  footer: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  azione: { paddingVertical: 2 },
  statBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statNum: { color: colors.muted, fontSize: fontSize.sm, fontFamily: fontFamily.semibold },
  statEmoji: { fontSize: 15 },
  mieReazioni: { marginLeft: 'auto', fontSize: 14 },
});

// La card ri-renderizza solo quando cambia la sua riga (patch ottimistici mirati)
// o gli handler (stabili nel feed): chiave della fluidità su liste lunghe.
export const DropCard = memo(DropCardComponent);
