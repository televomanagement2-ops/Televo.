// =============================================================================
// MapCanvas — ingresso della Mappa della Città nella Home (M7 / MM5).
// =============================================================================
// Sottile wrapper attorno a MapSurface (la mappa MapLibre vera). Due compiti:
//
//  1. GUARD Expo Go — MapLibre è un modulo nativo e NON gira in Expo Go (serve
//     la Dev Build EAS). In Expo Go mostriamo un pannello esplicativo invece di
//     montare la mappa (che darebbe redbox).
//  2. IMPORT PIGRO — MapSurface (e con essa il modulo nativo) è caricata via
//     React.lazy SOLO quando serve. Così, aprendo Televo in Expo Go, il modulo
//     nativo non viene mai valutato e il resto dell'app resta perfettamente
//     funzionante.

import { Suspense, lazy } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { MAP_PALETTE } from '@/constants/mapStyle';
import { colors, fontFamily, fontSize, spacing } from '@/constants/theme';

// Expo Go: `appOwnership === 'expo'`. Sulla Dev Build / standalone è 'standalone'
// o null → la mappa nativa è disponibile.
const IS_EXPO_GO = Constants.appOwnership === 'expo';

// Import pigro: la factory viene eseguita solo al primo render di <MapSurface />,
// che in Expo Go non avviene mai (torniamo prima con il pannello informativo).
const MapSurface = lazy(() => import('./MapSurface'));

export function MapCanvas() {
  if (IS_EXPO_GO) {
    return (
      <View style={styles.info}>
        <Ionicons name="map-outline" size={40} color={colors.faint} />
        <Text style={styles.infoTitle}>La Mappa richiede la Dev Build</Text>
        <Text style={styles.infoSub}>
          MapLibre è un modulo nativo e non gira in Expo Go. Apri Televo dalla Dev Build EAS per
          vedere la Mappa della Città.
        </Text>
      </View>
    );
  }

  return (
    <Suspense fallback={<View style={styles.fallback} />}>
      <MapSurface />
    </Suspense>
  );
}

const styles = StyleSheet.create({
  // Fallback del lazy-load: solo la tinta della terra (transizione invisibile
  // verso il velo interno di MapSurface).
  fallback: { flex: 1, backgroundColor: MAP_PALETTE.land },
  info: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
    backgroundColor: colors.base,
  },
  infoTitle: {
    color: colors.ink,
    fontSize: fontSize.lg,
    fontFamily: fontFamily.semibold,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  infoSub: {
    color: colors.muted,
    fontSize: fontSize.sm,
    fontFamily: fontFamily.sans,
    textAlign: 'center',
    lineHeight: 20,
  },
});
