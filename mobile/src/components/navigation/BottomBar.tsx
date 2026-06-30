// =============================================================================
// BottomBar — barra di navigazione inferiore custom. Cinque voci:
//   home · messaggi · (+) crea · notifiche · menu (hamburger)
// Il "+" centrale è un pill accent prominente (è il punto d'accesso alla
// creazione di contenuti). Niente tab bar di default: serve il rilievo del "+".
// =============================================================================

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';

// Mappa nome-rotta → icone Ionicons (attiva/inattiva) ed etichetta IT.
const ICONS: Record<
  string,
  { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap; label: string }
> = {
  home: { active: 'home', inactive: 'home-outline', label: 'Home' },
  messages: { active: 'chatbubble', inactive: 'chatbubble-outline', label: 'Messaggi' },
  notifiche: { active: 'notifications', inactive: 'notifications-outline', label: 'Avvisi' },
  menu: { active: 'menu', inactive: 'menu', label: 'Menu' },
};

export function BottomBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  const go = (routeKey: string, name: string, focused: boolean) => {
    Haptics.selectionAsync().catch(() => {});
    const event = navigation.emit({ type: 'tabPress', target: routeKey, canPreventDefault: true });
    if (!focused && !event.defaultPrevented) navigation.navigate(name);
  };

  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom || spacing.sm }]}>
      {state.routes.map((route, index) => {
        const focused = state.index === index;

        // Il "crea" è il bottone centrale prominente, non una voce normale.
        if (route.name === 'crea') {
          return (
            <View key={route.key} style={styles.slot}>
              <Pressable
                style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
                onPress={() => go(route.key, route.name, focused)}
                hitSlop={6}
              >
                <Ionicons name="add" size={30} color="#ffffff" />
              </Pressable>
            </View>
          );
        }

        const meta = ICONS[route.name];
        if (!meta) return <View key={route.key} style={styles.slot} />;

        return (
          <Pressable
            key={route.key}
            style={styles.slot}
            onPress={() => go(route.key, route.name, focused)}
            hitSlop={6}
          >
            <Ionicons
              name={focused ? meta.active : meta.inactive}
              size={24}
              color={focused ? colors.accent : colors.faint}
            />
            <Text style={[styles.label, focused && styles.labelActive]}>{meta.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  slot: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  label: { color: colors.faint, fontSize: fontSize.xs, fontFamily: fontFamily.medium },
  labelActive: { color: colors.accent },
  fab: {
    width: 52,
    height: 52,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    // Sollevamento visivo del "+" rispetto alla barra.
    marginTop: -spacing.lg,
    borderWidth: 3,
    borderColor: colors.surface,
  },
  fabPressed: { opacity: 0.9, transform: [{ scale: 0.96 }] },
});
