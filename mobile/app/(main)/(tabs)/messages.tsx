// =============================================================================
// Messaggi — hub delle conversazioni (S1). Lista chat ordinata per attività, con
// menu contestuale (S16-bis: silenzia/archivia/fissa/segna letto/elimina) e menu
// overflow (S6: Nuovo gruppo / Importante / Impostazioni). I drops strip e
// "Contatti su Televo" arrivano nei blocchi successivi.
// =============================================================================

import { useCallback } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { StatoErrore } from '@/components/ui/StatoErrore';
import { ConversazioneRow } from '@/components/chat/ConversazioneRow';
import {
  useConversationOrg,
  useConversations,
  useLeaveConversation,
  useMarkRead,
} from '@/hooks/useChat';
import { usePushBanner } from '@/hooks/useNotifiche';
import { dynamicRoutes, ROUTES } from '@/constants/routes';
import { avvisa, conferma, mostraMenu, type VoceMenu } from '@/lib/dialoghi';
import { chatErrorMessage } from '@/lib/errors';
import { useOnline } from '@/lib/rete';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';
import type { ConversationPreview } from '@/types';

// Durate di silenzia offerte (SRS R-06). null = riattiva.
function muteUntilFromChoice(choice: '8h' | '1w' | 'always'): string {
  const now = Date.now();
  const ms =
    choice === '8h' ? 8 * 3600e3 : choice === '1w' ? 7 * 24 * 3600e3 : 100 * 365 * 24 * 3600e3;
  return new Date(now + ms).toISOString();
}

export default function Messages() {
  const router = useRouter();
  const conversazioni = useConversations();
  const { refetch } = conversazioni;
  const online = useOnline();
  // Permesso push contestuale (CM6, RC-13): il banner compare al primo ingresso
  // nell'hub finché il permesso di sistema non è mai stato chiesto.
  const pushBanner = usePushBanner();

  // Realtime dell'hub arriva più avanti: per ora rinfreschiamo al focus.
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  // Menu overflow dell'hub (S6): Nuovo gruppo / Importante / Impostazioni (S10).
  const openHubMenu = () => {
    mostraMenu({
      titolo: 'Messaggi',
      voci: [
        { label: 'Nuovo gruppo', icon: 'people-outline', onPress: () => router.push(ROUTES.nuovoGruppo) },
        { label: 'Trova i tuoi contatti', icon: 'person-add-outline', onPress: () => router.push(ROUTES.messaggiContatti) },
        { label: 'Importante', icon: 'bookmark-outline', onPress: () => router.push(ROUTES.messaggiImportante) },
        { label: 'Impostazioni', icon: 'settings-outline', onPress: () => router.push(ROUTES.messaggiImpostazioni) },
      ],
    });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Messaggi</Text>
        <View style={styles.headerActions}>
          <Pressable hitSlop={10} onPress={() => router.push(ROUTES.cerca)}>
            <Ionicons name="search" size={22} color={colors.ink} />
          </Pressable>
          <Pressable hitSlop={10} onPress={openHubMenu}>
            <Ionicons name="ellipsis-vertical" size={22} color={colors.ink} />
          </Pressable>
        </View>
      </View>

      {/* Banner offline (CM2, RC-02). */}
      {!online ? (
        <View style={styles.offlineBar}>
          <Ionicons name="cloud-offline-outline" size={14} color={colors.muted} />
          <Text style={styles.offlineText}>Sei offline</Text>
        </View>
      ) : null}

      {/* Banner permesso notifiche (CM6, RC-13): spiegazione + richiesta contestuale. */}
      {pushBanner.visibile ? (
        <View style={styles.pushBanner}>
          <Ionicons name="notifications-outline" size={20} color={colors.accent} />
          <View style={styles.pushBannerTesto}>
            <Text style={styles.pushBannerTitolo}>Attiva le notifiche</Text>
            <Text style={styles.pushBannerSotto}>Ti avvisiamo quando arriva un messaggio.</Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.pushBannerCta, pressed && { opacity: 0.85 }]}
            onPress={() => void pushBanner.attiva()}
          >
            <Text style={styles.pushBannerCtaText}>Attiva</Text>
          </Pressable>
          <Pressable hitSlop={10} onPress={pushBanner.chiudi}>
            <Ionicons name="close" size={18} color={colors.muted} />
          </Pressable>
        </View>
      ) : null}

      {conversazioni.isLoading ? (
        <LoadingSpinner label="Carico le chat…" style={styles.flex} />
      ) : conversazioni.isError ? (
        <StatoErrore messaggio="Non riesco a caricare le chat." onRetry={() => void refetch()} />
      ) : (conversazioni.data?.length ?? 0) === 0 ? (
        <View style={styles.center}>
          <Ionicons name="chatbubbles-outline" size={44} color={colors.faint} />
          <Text style={styles.vuotoTitolo}>Nessuna chat ancora</Text>
          <Text style={styles.vuoto}>Inizia da un amico: apri Amici e scrivi il primo messaggio.</Text>
          <Button label="Trova amici" onPress={() => router.push(ROUTES.amici)} />
        </View>
      ) : (
        <FlatList
          data={conversazioni.data}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => (
            <ConversazioneRowContainer
              conv={item}
              onPress={() => router.push(dynamicRoutes.chat(item.id))}
            />
          )}
          ListHeaderComponent={
            <Pressable style={styles.nuovoGruppo} onPress={() => router.push(ROUTES.nuovoGruppo)}>
              <View style={styles.nuovoGruppoIcon}>
                <Ionicons name="people" size={20} color={colors.accent} />
              </View>
              <Text style={styles.nuovoGruppoLabel}>Nuovo gruppo</Text>
            </Pressable>
          }
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

/**
 * Riga con menu contestuale (S16-bis) su long-press: Silenzia/Riattiva, Fissa/Sblocca,
 * Archivia, Segna come letto, Elimina (DM=nascondi / gruppo=esci). Le mutazioni
 * passano dagli hook di organizzazione.
 */
function ConversazioneRowContainer({
  conv,
  onPress,
}: {
  conv: ConversationPreview;
  onPress: () => void;
}) {
  const org = useConversationOrg(conv.id);
  const markRead = useMarkRead(conv.id);
  const leave = useLeaveConversation(conv.id);
  const onErr = (e: unknown) => avvisa('Ops', chatErrorMessage(e));

  // Sotto-menu durate (SRS R-06): aperto dalla voce "Silenzia" — lo slot unico
  // del DialogHost rimpiazza il menu precedente senza flicker.
  const openMuteMenu = () => {
    mostraMenu({
      titolo: 'Silenzia',
      sottotitolo: 'Per quanto tempo?',
      voci: [
        { label: '8 ore', onPress: () => org.mute.mutate(muteUntilFromChoice('8h'), { onError: onErr }) },
        { label: '1 settimana', onPress: () => org.mute.mutate(muteUntilFromChoice('1w'), { onError: onErr }) },
        { label: 'Sempre', onPress: () => org.mute.mutate(muteUntilFromChoice('always'), { onError: onErr }) },
      ],
    });
  };

  const confirmDelete = () => {
    const isDm = conv.type === 'dm';
    conferma({
      titolo: isDm ? 'Elimina chat' : 'Esci dal gruppo',
      messaggio: isDm
        ? 'La chat sparisce dalla tua lista; riappare se arriva un nuovo messaggio.'
        : 'Uscirai dal gruppo. Potrai rientrare solo se ti riaggiungono.',
      confermaLabel: isDm ? 'Elimina' : 'Esci',
      distruttiva: true,
      onConferma: () =>
        isDm
          ? org.flag.mutate({ flag: 'hidden', on: true }, { onError: onErr })
          : leave.mutate(undefined, { onError: onErr }),
    });
  };

  const openMenu = () => {
    const voci: VoceMenu[] = [];
    voci.push(
      conv.muted
        ? { label: 'Riattiva notifiche', icon: 'notifications-outline', onPress: () => org.mute.mutate(null, { onError: onErr }) }
        : { label: 'Silenzia', icon: 'notifications-off-outline', onPress: openMuteMenu },
    );
    voci.push(
      conv.pinnedAt
        ? { label: 'Sblocca dall’alto', icon: 'pin-outline', onPress: () => org.flag.mutate({ flag: 'pinned', on: false }, { onError: onErr }) }
        : { label: 'Fissa in cima', icon: 'pin-outline', onPress: () => org.flag.mutate({ flag: 'pinned', on: true }, { onError: onErr }) },
    );
    voci.push({
      label: 'Archivia',
      icon: 'archive-outline',
      onPress: () => org.flag.mutate({ flag: 'archived', on: true }, { onError: onErr }),
    });
    if (conv.unreadCount > 0) {
      voci.push({ label: 'Segna come letto', icon: 'checkmark-done-outline', onPress: () => markRead.mutate() });
    }
    voci.push({
      label: conv.type === 'dm' ? 'Elimina chat' : 'Esci dal gruppo',
      icon: conv.type === 'dm' ? 'trash-outline' : 'exit-outline',
      danger: true,
      onPress: confirmDelete,
    });
    mostraMenu({ titolo: conv.title ?? 'Chat', voci });
  };

  return <ConversazioneRow conv={conv} onPress={onPress} onLongPress={openMenu} />;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.base },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  title: { color: colors.ink, fontSize: 22, fontFamily: fontFamily.displayBold },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  offlineBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surface,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  offlineText: { color: colors.muted, fontSize: fontSize.xs, fontFamily: fontFamily.sans },
  // Banner permesso push (CM6): card in linea col kit (surface + bordo tenue).
  pushBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
  },
  pushBannerTesto: { flex: 1, gap: 1 },
  pushBannerTitolo: { color: colors.ink, fontSize: fontSize.sm, fontFamily: fontFamily.semibold },
  pushBannerSotto: { color: colors.muted, fontSize: fontSize.xs, fontFamily: fontFamily.sans },
  pushBannerCta: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
  },
  pushBannerCtaText: { color: '#ffffff', fontSize: fontSize.xs, fontFamily: fontFamily.semibold },
  listContent: { padding: spacing.lg, gap: spacing.sm, paddingBottom: 100 },
  nuovoGruppo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.xs,
  },
  nuovoGruppoIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  nuovoGruppoLabel: { color: colors.ink, fontSize: fontSize.base, fontFamily: fontFamily.semibold },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  vuotoTitolo: { color: colors.ink, fontSize: fontSize.lg, fontFamily: fontFamily.semibold },
  vuoto: {
    color: colors.muted,
    fontSize: fontSize.sm,
    fontFamily: fontFamily.sans,
    textAlign: 'center',
    lineHeight: 20,
  },
});
