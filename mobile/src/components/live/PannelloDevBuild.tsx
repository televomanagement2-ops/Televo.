// =============================================================================
// PannelloDevBuild — guard Expo Go delle superfici Live (M12, pattern MapCanvas).
// =============================================================================
// LiveKit è un modulo nativo (WebRTC): in Expo Go le rotte live mostrano questo
// pannello INVECE di montare qualunque cosa tocchi il nativo (le superfici vere
// sono caricate pigramente, quindi il modulo non viene mai valutato, §12.16).

import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontFamily, fontSize, spacing } from '@/constants/theme';

export function PannelloDevBuild() {
  return (
    <View style={styles.info}>
      <Ionicons name="videocam-outline" size={40} color={colors.faint} />
      <Text style={styles.titolo}>La Live richiede la Dev Build</Text>
      <Text style={styles.sub}>
        LiveKit è un modulo nativo e non gira in Expo Go. Apri Televo dalla Dev Build EAS per usare
        la Live.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  info: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
    backgroundColor: colors.base,
  },
  titolo: {
    color: colors.ink,
    fontSize: fontSize.lg,
    fontFamily: fontFamily.semibold,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  sub: {
    color: colors.muted,
    fontSize: fontSize.sm,
    fontFamily: fontFamily.sans,
    textAlign: 'center',
    lineHeight: 20,
  },
});
