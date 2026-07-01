// =============================================================================
// MediaPlaceholder — l'area media grande della card del feed. Per ora è un
// BLOCCO GRIGIO (niente immagini/video reali): la sostanza arriva quando
// colleghiamo i dati. Un chip in alto a sinistra (icona + etichetta + accento)
// distingue il TIPO di contenuto (drop/live/map/aura/sport).
// =============================================================================

import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FEED_KIND_META, type FeedKind } from '@/constants/feedItems';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';

export function MediaPlaceholder({ kind }: { kind: FeedKind }) {
  const meta = FEED_KIND_META[kind];

  return (
    <View style={styles.media}>
      <View style={[styles.chip, { borderColor: meta.accent }]}>
        <Ionicons name={meta.icon} size={13} color={meta.accent} />
        <Text style={[styles.chipLabel, { color: meta.accent }]}>{meta.label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  media: {
    width: '100%',
    aspectRatio: 4 / 5,
    backgroundColor: colors.elevated,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  chip: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
    borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  chipLabel: { fontSize: fontSize.xs, fontFamily: fontFamily.semibold },
});
