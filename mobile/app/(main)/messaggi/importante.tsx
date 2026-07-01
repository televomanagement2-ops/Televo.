// =============================================================================
// Importante — sotto-hub (S6 → Importante): Salvati (S7) / Archiviati (S8) /
// Silenziati (S9). Tre sezioni con un selettore segmentato. Salvati mostra i
// messaggi bookmark; Archiviati/Silenziati riusano la riga conversazione.
// =============================================================================

import { useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/ui/Card';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ConversazioneRow } from '@/components/chat/ConversazioneRow';
import {
  useConversationOrg,
  useConversations,
  useSaveMessage,
  useSavedMessages,
} from '@/hooks/useChat';
import { previewText } from '@/lib/chat';
import { hubTimestamp } from '@/lib/datetime';
import { chatErrorMessage } from '@/lib/errors';
import { dynamicRoutes } from '@/constants/routes';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';
import type { ConversationPreview, SavedMessage } from '@/types';

type Tab = 'salvati' | 'archiviati' | 'silenziati';
const TABS: { key: Tab; label: string }[] = [
  { key: 'salvati', label: 'Salvati' },
  { key: 'archiviati', label: 'Archiviati' },
  { key: 'silenziati', label: 'Silenziati' },
];

export default function Importante() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('salvati');

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>
        <Text style={styles.title}>Importante</Text>
      </View>

      <View style={styles.segment}>
        {TABS.map((t) => (
          <Pressable
            key={t.key}
            style={[styles.segmentBtn, tab === t.key && styles.segmentBtnActive]}
            onPress={() => setTab(t.key)}
          >
            <Text style={[styles.segmentLabel, tab === t.key && styles.segmentLabelActive]}>
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab === 'salvati' ? (
        <SalvatiList />
      ) : (
        <ConversazioniList
          view={tab === 'archiviati' ? 'archived' : 'muted'}
          onOpen={(id) => router.push(dynamicRoutes.chat(id))}
        />
      )}
    </SafeAreaView>
  );
}

// --- Salvati (S7) ------------------------------------------------------------

function SalvatiList() {
  const router = useRouter();
  const saved = useSavedMessages();
  const { unsave } = useSaveMessage();

  if (saved.isLoading) return <LoadingSpinner label="Carico i salvati…" style={styles.flex} />;
  if (saved.isError) return <Vuoto icon="alert-circle-outline" text="Non riesco a caricare i salvati." />;
  if ((saved.data?.length ?? 0) === 0) {
    return <Vuoto icon="bookmark-outline" text="Nessun messaggio salvato. Tienine da parte uno con un tocco lungo." />;
  }

  return (
    <FlatList
      data={saved.data}
      keyExtractor={(s: SavedMessage) => s.message.id}
      contentContainerStyle={styles.listContent}
      renderItem={({ item }) => (
        <Card
          onPress={() => router.push(dynamicRoutes.chat(item.conversationId))}
          onLongPress={() =>
            Alert.alert('Salvato', undefined, [
              {
                text: 'Rimuovi dai salvati',
                style: 'destructive',
                onPress: () =>
                  unsave.mutate(item.message.id, {
                    onError: (e) => Alert.alert('Ops', chatErrorMessage(e)),
                  }),
              },
              { text: 'Annulla', style: 'cancel' },
            ])
          }
          style={styles.savedCard}
        >
          <View style={styles.savedTop}>
            <Text style={styles.savedConv} numberOfLines={1}>
              {item.conversationTitle}
            </Text>
            <Text style={styles.savedTime}>{hubTimestamp(item.savedAt)}</Text>
          </View>
          <Text style={styles.savedBody} numberOfLines={2}>
            {previewText(item.message)}
          </Text>
        </Card>
      )}
    />
  );
}

// --- Archiviati (S8) / Silenziati (S9) ---------------------------------------

function ConversazioniList({
  view,
  onOpen,
}: {
  view: 'archived' | 'muted';
  onOpen: (id: string) => void;
}) {
  const list = useConversations(view);

  if (list.isLoading) return <LoadingSpinner label="Carico…" style={styles.flex} />;
  if (list.isError) return <Vuoto icon="alert-circle-outline" text="Non riesco a caricare." />;
  if ((list.data?.length ?? 0) === 0) {
    return (
      <Vuoto
        icon={view === 'archived' ? 'archive-outline' : 'notifications-off-outline'}
        text={view === 'archived' ? 'Nessuna chat archiviata.' : 'Nessuna chat silenziata.'}
      />
    );
  }

  return (
    <FlatList
      data={list.data}
      keyExtractor={(c) => c.id}
      contentContainerStyle={styles.listContent}
      renderItem={({ item }) => (
        <ArchivedRow conv={item} view={view} onOpen={() => onOpen(item.id)} />
      )}
    />
  );
}

/** Riga con azione contestuale specifica: ripristina (archiviate) / riattiva (silenziate). */
function ArchivedRow({
  conv,
  view,
  onOpen,
}: {
  conv: ConversationPreview;
  view: 'archived' | 'muted';
  onOpen: () => void;
}) {
  const org = useConversationOrg(conv.id);
  const onErr = (e: unknown) => Alert.alert('Ops', chatErrorMessage(e));
  const openMenu = () => {
    const action =
      view === 'archived'
        ? { text: 'Ripristina', onPress: () => org.flag.mutate({ flag: 'archived', on: false }, { onError: onErr }) }
        : { text: 'Riattiva notifiche', onPress: () => org.mute.mutate(null, { onError: onErr }) };
    Alert.alert(conv.title ?? 'Chat', undefined, [action, { text: 'Annulla', style: 'cancel' }]);
  };
  return <ConversazioneRow conv={conv} onPress={onOpen} onLongPress={openMenu} />;
}

// --- Stato vuoto -------------------------------------------------------------

function Vuoto({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.center}>
      <Ionicons name={icon} size={40} color={colors.faint} />
      <Text style={styles.vuoto}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.base },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  title: { color: colors.ink, fontSize: 20, fontFamily: fontFamily.displayBold },
  segment: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    backgroundColor: colors.elevated,
    borderRadius: radius.full,
    padding: 4,
    gap: 4,
  },
  segmentBtn: { flex: 1, paddingVertical: 8, borderRadius: radius.full, alignItems: 'center' },
  segmentBtnActive: { backgroundColor: colors.accent },
  segmentLabel: { color: colors.muted, fontSize: fontSize.sm, fontFamily: fontFamily.semibold },
  segmentLabelActive: { color: '#ffffff' },
  listContent: { padding: spacing.lg, gap: spacing.sm, paddingBottom: 100 },
  savedCard: { padding: spacing.md, gap: 6 },
  savedTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  savedConv: { flex: 1, color: colors.accentSoft, fontSize: fontSize.sm, fontFamily: fontFamily.semibold },
  savedTime: { color: colors.faint, fontSize: fontSize.xs, fontFamily: fontFamily.sans },
  savedBody: { color: colors.ink, fontSize: fontSize.base, fontFamily: fontFamily.sans, lineHeight: 21 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  vuoto: {
    color: colors.muted,
    fontSize: fontSize.sm,
    fontFamily: fontFamily.sans,
    textAlign: 'center',
    lineHeight: 20,
  },
});
