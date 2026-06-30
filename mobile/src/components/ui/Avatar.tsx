// =============================================================================
// Avatar — cerchio con la foto profilo o, in mancanza, l'iniziale dello username.
// Usato nell'header della Home (cerchio → profilo) e nelle card del feed.
// =============================================================================

import { Image } from 'expo-image';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { colors, fontFamily, radius } from '@/constants/theme';

interface Props {
  /** URL della foto profilo (profiles.avatar_url); se assente mostra l'iniziale. */
  uri?: string | null;
  /** Username/nome da cui ricavare l'iniziale di fallback. */
  name?: string | null;
  /** Diametro in pt. */
  size?: number;
  style?: ViewStyle;
}

export function Avatar({ uri, name, size = 40, style }: Props) {
  const dim = { width: size, height: size, borderRadius: radius.full };
  const initial = (name?.trim()?.[0] ?? '?').toUpperCase();

  return (
    <View style={[styles.base, dim, style]}>
      {uri ? (
        <Image source={{ uri }} style={dim} contentFit="cover" />
      ) : (
        <Text style={[styles.initial, { fontSize: size * 0.42 }]}>{initial}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  initial: { color: colors.ink, fontFamily: fontFamily.semibold },
});
