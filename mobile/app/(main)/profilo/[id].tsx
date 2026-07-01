// =============================================================================
// Profilo altrui — aperto da Amici/ricerca/chat. Mostra la card di un utente e
// l'azione corretta in base alla RELAZIONE (nessuna / richiesta / amici / bloccato).
// =============================================================================
// Da qui nasce la chat: se siete amici, "Messaggia" apre/crea la DM
// (get_or_create_dm) e naviga alla conversazione. Le azioni sono RPC (useAmici).

import { useEffect } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '@/components/ui/Avatar';
import { AuraAvatarRing } from '@/components/aura/AuraAvatarRing';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import {
  useApriDm,
  useAzioniAmicizia,
  useProfiloCard,
  useRelazione,
} from '@/hooks/useAmici';
import { chatErrorMessage } from '@/lib/errors';
import { dynamicRoutes } from '@/constants/routes';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';

const AVATAR = 96;

export default function ProfiloUtente() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const uid = session?.user.id;

  // Se apro il MIO id da questa rotta, rimando al profilo proprio.
  useEffect(() => {
    if (uid && id === uid) router.replace('/profilo');
  }, [uid, id, router]);

  const card = useProfiloCard(id);
  const rel = useRelazione(id);
  const azioni = useAzioniAmicizia();
  const apriDm = useApriDm();

  const onError = (e: unknown) => Alert.alert('Ops', chatErrorMessage(e));

  const messaggia = () => {
    if (!id) return;
    apriDm.mutate(id, {
      onSuccess: (convId) => router.push(dynamicRoutes.chat(convId)),
      onError,
    });
  };

  const auraPercent = Math.round(card.data?.auraScore ?? 0);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>Profilo</Text>
        <View style={{ width: 26 }} />
      </View>

      {card.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.muted} />
        </View>
      ) : !card.data ? (
        <View style={styles.center}>
          <Text style={styles.vuoto}>Utente non disponibile.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.hero}>
            <AuraAvatarRing percent={auraPercent} size={AVATAR}>
              <Avatar uri={card.data.avatarUrl} name={card.data.username} size={AVATAR} />
            </AuraAvatarRing>
            <Text style={styles.name}>{card.data.displayName || card.data.username}</Text>
            <Text style={styles.username}>@{card.data.username}</Text>
            {card.data.statusText ? <Text style={styles.bio}>{card.data.statusText}</Text> : null}
          </View>

          {/* Azione principale in base alla relazione */}
          <View style={styles.actions}>{renderAzione()}</View>
        </ScrollView>
      )}
    </SafeAreaView>
  );

  // --- Azione contestuale ---
  function renderAzione() {
    if (rel.isLoading || !id) return <ActivityIndicator color={colors.muted} />;

    switch (rel.data) {
      case 'accepted':
        return (
          <>
            <Button label="Messaggia" onPress={messaggia} loading={apriDm.isPending} />
            <SecondaryBtn
              icon="person-remove-outline"
              label="Rimuovi amico"
              loading={azioni.rimuovi.isPending}
              onPress={() =>
                Alert.alert('Rimuovi amico', 'Vuoi rimuovere questa amicizia?', [
                  { text: 'Annulla', style: 'cancel' },
                  {
                    text: 'Rimuovi',
                    style: 'destructive',
                    onPress: () => azioni.rimuovi.mutate(id, { onError }),
                  },
                ])
              }
            />
          </>
        );
      case 'pending_in':
        return (
          <>
            <Button
              label="Accetta richiesta"
              onPress={() => azioni.accetta.mutate(id, { onError })}
              loading={azioni.accetta.isPending}
            />
            <SecondaryBtn
              icon="close"
              label="Rifiuta"
              loading={azioni.rimuovi.isPending}
              onPress={() => azioni.rimuovi.mutate(id, { onError })}
            />
          </>
        );
      case 'pending_out':
        return (
          <SecondaryBtn
            icon="time-outline"
            label="Annulla richiesta"
            loading={azioni.rimuovi.isPending}
            onPress={() => azioni.rimuovi.mutate(id, { onError })}
          />
        );
      case 'blocked_by_me':
        return (
          <SecondaryBtn
            icon="lock-open-outline"
            label="Sblocca"
            loading={azioni.sblocca.isPending}
            onPress={() => azioni.sblocca.mutate(id, { onError })}
          />
        );
      case 'blocked_by_them':
        return <Text style={styles.vuoto}>Non puoi interagire con questo utente.</Text>;
      case 'none':
      default:
        return (
          <>
            <Button
              label="Aggiungi amico"
              onPress={() => azioni.richiedi.mutate(id, { onError })}
              loading={azioni.richiedi.isPending}
            />
            <SecondaryBtn
              icon="ban-outline"
              label="Blocca"
              loading={azioni.blocca.isPending}
              onPress={() =>
                Alert.alert('Blocca utente', 'Non potrete più scrivervi né trovarvi.', [
                  { text: 'Annulla', style: 'cancel' },
                  {
                    text: 'Blocca',
                    style: 'destructive',
                    onPress: () => azioni.blocca.mutate(id, { onError }),
                  },
                ])
              }
            />
          </>
        );
    }
  }
}

function SecondaryBtn({
  icon,
  label,
  onPress,
  loading,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  loading?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={colors.ink} />
      ) : (
        <>
          <Ionicons name={icon} size={18} color={colors.ink} />
          <Text style={styles.secondaryLabel}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.base },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  headerTitle: { color: colors.ink, fontSize: fontSize.lg, fontFamily: fontFamily.semibold },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: spacing.lg, gap: spacing.xl },

  hero: { alignItems: 'center', gap: spacing.xs, paddingTop: spacing.sm },
  name: {
    color: colors.ink,
    fontSize: fontSize.xl,
    fontFamily: fontFamily.displayBold,
    marginTop: spacing.sm,
  },
  username: { color: colors.muted, fontSize: fontSize.base, fontFamily: fontFamily.sans },
  bio: {
    color: colors.ink,
    fontSize: fontSize.sm,
    fontFamily: fontFamily.sans,
    textAlign: 'center',
    marginTop: spacing.xs,
    lineHeight: 20,
  },

  actions: { gap: spacing.md },
  secondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 52,
    borderRadius: radius.full,
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryLabel: { color: colors.ink, fontSize: fontSize.base, fontFamily: fontFamily.semibold },
  pressed: { opacity: 0.85 },
  vuoto: {
    color: colors.muted,
    fontSize: fontSize.sm,
    fontFamily: fontFamily.sans,
    textAlign: 'center',
  },
});
