// =============================================================================
// (tabs) layout — tab bar dark minimale (placeholder di M2). Solo "Home" è reale
// in questo round; le altre mostrano "Prossimamente".
// =============================================================================

import { Tabs } from 'expo-router';
import { colors } from '@/constants/theme';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.faint,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
      }}
    >
      <Tabs.Screen name="home" options={{ title: 'Home' }} />
      <Tabs.Screen name="live" options={{ title: 'Live' }} />
      <Tabs.Screen name="mappa" options={{ title: 'Mappa' }} />
      <Tabs.Screen name="notifiche" options={{ title: 'Notifiche' }} />
      <Tabs.Screen name="profilo" options={{ title: 'Profilo' }} />
    </Tabs>
  );
}
