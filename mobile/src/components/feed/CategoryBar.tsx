// =============================================================================
// CategoryBar — barra orizzontale delle categorie del feed (chip selezionabili).
// "Discover" è il default (mix di tutto). La selezione è gestita dalla Home.
// =============================================================================

import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { FEED_CATEGORIES, type FeedCategoryKey } from '@/constants/feed';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';

interface Props {
  selected: FeedCategoryKey;
  onSelect: (key: FeedCategoryKey) => void;
}

export function CategoryBar({ selected, onSelect }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {FEED_CATEGORIES.map((cat) => {
        const active = cat.key === selected;
        return (
          <Pressable
            key={cat.key}
            onPress={() => onSelect(cat.key)}
            style={[styles.chip, active && styles.chipActive]}
          >
            <Text style={[styles.label, active && styles.labelActive]}>{cat.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  label: { color: colors.muted, fontSize: fontSize.sm, fontFamily: fontFamily.medium },
  labelActive: { color: '#ffffff', fontFamily: fontFamily.semibold },
});
