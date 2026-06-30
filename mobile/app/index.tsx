// =============================================================================
// Index — entry point. Mentre risolviamo la sessione mostra il marchio centrato
// (lo stesso che la welcome anima), poi instrada in base allo stato.
// =============================================================================
//   nessuna sessione            → /welcome
//   sessione + profilo incompl. → /registrazione (completamento profilo)
//   sessione + onboardato       → /home

import { Redirect } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { BrandLockup } from '@/components/brand/BrandLockup';
import { useAuth } from '@/hooks/useAuth';
import { colors } from '@/constants/theme';

export default function Index() {
  const { initializing, isAuthenticated, isOnboarded } = useAuth();

  // Stato di caricamento: marchio centrato (continuità visiva con la welcome).
  if (initializing) {
    return (
      <View style={styles.launch}>
        <BrandLockup size={50} />
      </View>
    );
  }

  if (!isAuthenticated) return <Redirect href="/welcome" />;
  if (!isOnboarded) return <Redirect href="/registrazione" />;
  return <Redirect href="/home" />;
}

const styles = StyleSheet.create({
  launch: {
    flex: 1,
    backgroundColor: colors.base,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
