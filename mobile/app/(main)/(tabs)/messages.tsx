// =============================================================================
// Messaggi — hub delle conversazioni (S1). Lista chat ordinata per attività, con
// menu contestuale (S16-bis: silenzia/archivia/fissa/segna letto/elimina) e menu
// overflow (S6: Nuovo gruppo / Importante / Impostazioni). I drops strip e
// "Contatti su Televo" arrivano nei blocchi successivi.
// =============================================================================

import { useCallback } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ConversazioneRow } from '@/components/chat/ConversazioneRow';
import {
  useConversationOrg,
  useConversations,
  useLeaveConversation,
  useMarkRead,
} from '@/hooks/useChat';
import { dynamicRoutes, ROUTES } from '@/constants/routes';
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

  // Realtime dell'hub arriva più avanti: per ora rinfreschiamo al focus.
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  // Menu overflow dell'hub (S6): Nuovo gruppo / Importante / Impostazioni (S10).
  const openHubMenu = () => {
    Alert.alert('Messaggi', undefined, [
      { text: 'Nuovo gruppo', onPress: () => router.push(ROUTES.nuovoGruppo) },
      { text: 'Importante', onPress: () => router.push(ROUTES.messaggiImportante) },
      { text: 'Impostazioni', onPress: () => router.push(ROUTES.messaggiImpostazioni) },
      { text: 'Annulla', style: 'cancel' },
    ]);
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

      {conversazioni.isLoading ? (
        <LoadingSpinner label="Carico le chat…" style={styles.flex} />
      ) : conversazioni.isError ? (
        <View style={styles.center}>
          <Text style={styles.vuoto}>Non riesco a caricare le chat.</Text>
          <Button label="Riprova" variant="secondary" onPress={() => refetch()} />
        </View>
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
  const onErr = (e: unknown) => Alert.alert('Ops', chatErrorMessage(e));

  const openMuteMenu = () => {
    Alert.alert('Silenzia', 'Per quanto tempo?', [
      { text: '8 ore', onPress: () => org.mute.mutate(muteUntilFromChoice('8h'), { onError: onErr }) },
      { text: '1 settimana', onPress: () => org.mute.mutate(muteUntilFromChoice('1w'), { onError: onErr }) },
      { text: 'Sempre', onPress: () => org.mute.mutate(muteUntilFromChoice('always'), { onError: onErr }) },
      { text: 'Annulla', style: 'cancel' },
    ]);
  };

  const confirmDelete = () => {
    const isDm = conv.type === 'dm';
    Alert.alert(
      isDm ? 'Elimina chat' : 'Esci dal gruppo',
      isDm
        ? 'La chat sparisce dalla tua lista; riappare se arriva un nuovo messaggio.'
        : 'Uscirai dal gruppo. Potrai rientrare solo se ti riaggiungono.',
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: isDm ? 'Elimina' : 'Esci',
          style: 'destructive',
          onPress: () =>
            isDm
              ? org.flag.mutate({ flag: 'hidden', on: true }, { onError: onErr })
              : leave.mutate(undefined, { onError: onErr }),
        },
      ],
    );
  };

  const openMenu = () => {
    const buttons: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = [];
    buttons.push(
      conv.muted
        ? { text: 'Riattiva notifiche', onPress: () => org.mute.mutate(null, { onError: onErr }) }
        : { text: 'Silenzia', onPress: openMuteMenu },
    );
    buttons.push(
      conv.pinnedAt
        ? { text: 'Sblocca dall’alto', onPress: () => org.flag.mutate({ flag: 'pinned', on: false }, { onError: onErr }) }
        : { text: 'Fissa in cima', onPress: () => org.flag.mutate({ flag: 'pinned', on: true }, { onError: onErr }) },
    );
    buttons.push({
      text: 'Archivia',
      onPress: () => org.flag.mutate({ flag: 'archived', on: true }, { onError: onErr }),
    });
    if (conv.unreadCount > 0) {
      buttons.push({ text: 'Segna come letto', onPress: () => markRead.mutate() });
    }
    buttons.push({
      text: conv.type === 'dm' ? 'Elimina chat' : 'Esci dal gruppo',
      style: 'destructive',
      onPress: confirmDelete,
    });
    buttons.push({ text: 'Annulla', style: 'cancel' });
    Alert.alert(conv.title ?? 'Chat', undefined, buttons);
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
