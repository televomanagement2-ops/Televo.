// =============================================================================
// BottomBar — barra di navigazione inferiore custom, FLOATING (staccata dai bordi)
// con look glass scuro. Cinque voci, solo icone:
//   home · messaggi · (+) crea · notifiche · menu (hamburger)
// Il "+" centrale è un quadrato arrotondato in glass grigio chiaro (accesso alla
// creazione). La voce attiva è segnalata da un puntino BLU sotto l'icona.
// =============================================================================

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useUnreadTotale } from '@/hooks/useChat';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';

// Mappa nome-rotta → icone Ionicons (attiva/inattiva).
const ICONS: Record<
  string,
  { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap }
> = {
  home: { active: 'home', inactive: 'home-outline' },
  messages: { active: 'chatbubble', inactive: 'chatbubble-outline' },
  notifiche: { active: 'notifications', inactive: 'notifications-outline' },
  menu: { active: 'menu', inactive: 'menu' },
};

export function BottomBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  // Badge tab Messaggi (CM2, §8.5): definizione condivisa con il badge icona
  // app (CM6) — stessa query dell'hub (cache condivisa, aggiornata live dal
  // canale realtime globale in ChatRuntime).
  const unread = useUnreadTotale() ?? 0;

  const go = (routeKey: string, name: string, focused: boolean) => {
    Haptics.selectionAsync().catch(() => {});
    const event = navigation.emit({ type: 'tabPress', target: routeKey, canPreventDefault: true });
    if (!focused && !event.defaultPrevented) navigation.navigate(name);
  };

  return (
    // Wrapper trasparente che ancora la barra in basso lasciando lo spazio per il
    // safe-area inset; la barra vera è la pillola floating staccata dai bordi.
    <View style={[styles.dock, { paddingBottom: (insets.bottom || spacing.sm) + spacing.sm }]} pointerEvents="box-none">
      <View style={styles.bar}>
        {state.routes.map((route, index) => {
          const focused = state.index === index;

          // Il "crea" è il bottone centrale: quadrato glass grigio chiaro.
          if (route.name === 'crea') {
            return (
              <View key={route.key} style={styles.slot}>
                <Pressable
                  style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
                  onPress={() => go(route.key, route.name, focused)}
                  hitSlop={6}
                >
                  <Ionicons name="add" size={28} color="#ffffff" />
                </Pressable>
              </View>
            );
          }

          const meta = ICONS[route.name];
          if (!meta) return <View key={route.key} style={styles.slot} />;

          const mostraBadge = route.name === 'messages' && unread > 0;

          return (
            <Pressable
              key={route.key}
              style={styles.slot}
              onPress={() => go(route.key, route.name, focused)}
              hitSlop={6}
            >
              <View>
                <Ionicons
                  name={focused ? meta.active : meta.inactive}
                  size={25}
                  color={focused ? colors.ink : colors.faint}
                />
                {mostraBadge ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
                  </View>
                ) : null}
              </View>
              <View style={[styles.dot, focused && styles.dotActive]} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  // La pillola floating: glass scuro, bordo tenue, angoli molto arrotondati.
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: 'rgba(18,20,26,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: radius['2xl'],
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    // Sollevamento morbido sotto la barra (iOS); su Android resta piatta-ish.
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  slot: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 4 },
  // Badge unread sulla tab Messaggi (contatore, max "99+").
  badge: {
    position: 'absolute',
    top: -5,
    right: -10,
    minWidth: 17,
    height: 17,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: { color: '#ffffff', fontSize: 10, fontFamily: fontFamily.semibold },
  // Puntino sotto l'icona: invisibile di default, BLU quando la voce è attiva.
  dot: { width: 4, height: 4, borderRadius: radius.full, backgroundColor: 'transparent' },
  dotActive: { backgroundColor: colors.accent },
  // "+" glass grigio chiaro (vetro): superficie chiara translucida + bordo tenue.
  fab: {
    width: 46,
    height: 46,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.09)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  fabPressed: { opacity: 0.85, transform: [{ scale: 0.96 }] },
});
