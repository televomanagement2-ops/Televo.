// =============================================================================
// (tabs) layout — bottom bar custom a 5 voci: home · messaggi · (+) crea ·
// notifiche · menu. La barra è disegnata da BottomBar (il "+" è prominente).
// Profilo e Ricerca NON sono tab: si aprono come schermate stack dentro (main),
// rispettivamente dal cerchio avatar e dall'icona ricerca nell'header.
// =============================================================================

import { Tabs } from 'expo-router';
import { BottomBar } from '@/components/navigation/BottomBar';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <BottomBar {...props} />}
    >
      <Tabs.Screen name="home" />
      <Tabs.Screen name="messages" />
      <Tabs.Screen name="crea" />
      <Tabs.Screen name="notifiche" />
      <Tabs.Screen name="menu" />
    </Tabs>
  );
}
