// =============================================================================
// CategoryBar — barra orizzontale delle categorie del feed, in stile TESTO:
// la voce attiva è bianca/bold con un underline viola corto sotto; le inattive
// sono grigie. "Discover" è il default (mix di tutto). La selezione è gestita
// dalla Home (prop `selected`/`onSelect`).
// =============================================================================

import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { FEED_CATEGORIES, type FeedCategoryKey } from '@/constants/feed';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';

interface Props {
  selected: FeedCategoryKey;
  onSelect: (key: FeedCategoryKey) => void;
}

export function CategoryBar({ selected, onSelect }: Props) {
  return (
    // `style` con flexGrow:0 è ESSENZIALE: uno ScrollView orizzontale dentro un
    // contenitore a colonna (la Home) NON ricava l'altezza dal contenuto e, senza
    // vincolo, si "mangia" tutto lo spazio verticale disponibile — spingendo il
    // feed a partire da metà schermo. Con flexGrow:0 resta alto quanto la sua riga.
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.bar}
      contentContainerStyle={styles.row}
    >
      {FEED_CATEGORIES.map((cat) => {
        const active = cat.key === selected;
        return (
          <Pressable key={cat.key} onPress={() => onSelect(cat.key)} style={styles.item} hitSlop={8}>
            <Text style={[styles.label, active && styles.labelActive]}>{cat.label}</Text>
            {active ? <View style={styles.underline} /> : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// Scritte volutamente discrete (mockup): piccole, peso leggero, underline sottile.
const styles = StyleSheet.create({
  // flexGrow:0 → la barra non si espande in verticale (vedi commento sopra).
  bar: { flexGrow: 0, flexShrink: 0 },
  row: { gap: spacing.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  item: { alignItems: 'center', gap: 5 },
  label: { color: colors.muted, fontSize: fontSize.sm, fontFamily: fontFamily.medium, letterSpacing: 0.2 },
  labelActive: { color: colors.ink, fontFamily: fontFamily.semibold },
  underline: { width: '50%', height: 2, borderRadius: radius.full, backgroundColor: colors.accent },
});
