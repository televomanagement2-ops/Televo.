// =============================================================================
// Inoltra (CM4, RC-06) — scegli la conversazione di destinazione.
// =============================================================================
// I messaggi da inoltrare arrivano dal chatStore (`forwardDraft`, mai in URL);
// vuoto al mount = rotta aperta a mano → back. Testo e FOTO (CM5: il file
// viene copiato server-side nella destinazione); i vocali restano vietati
// (effimeri — regola enforce-ata anche dal trigger DB). Al tap sulla
// destinazione: inoltro sequenziale in ordine cronologico, poi
// `router.replace` sulla chat di destinazione (le bolle portano "Inoltrato").

import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '@/components/ui/Avatar';
import { StatoErrore } from '@/components/ui/StatoErrore';
import { useConversations, useForwardMessages } from '@/hooks/useChat';
import { useChatStore } from '@/store/chatStore';
import { avvisa } from '@/lib/dialoghi';
import { chatErrorMessage } from '@/lib/errors';
import { dynamicRoutes } from '@/constants/routes';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';
import type { ConversationPreview } from '@/types';

export default function Inoltra() {
  const router = useRouter();
  const forwardDraft = useChatStore((s) => s.forwardDraft);
  const setForwardDraft = useChatStore((s) => s.setForwardDraft);
  const conversazioni = useConversations('active');
  const forward = useForwardMessages();
  // Destinazione in corso (spinner sulla riga giusta).
  const [destinazione, setDestinazione] = useState<string | null>(null);

  // Rotta aperta senza selezione (deep link a mano, stato perso): si torna via.
  useEffect(() => {
    if (!forwardDraft || forwardDraft.length === 0) router.back();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al mount
  }, []);

  const count = forwardDraft?.length ?? 0;

  const inoltraVerso = (conv: ConversationPreview) => {
    if (!forwardDraft || forward.isPending) return;
    setDestinazione(conv.id);
    forward.mutate(
      { destConvId: conv.id, messages: forwardDraft },
      {
        onSuccess: (destId) => {
          setForwardDraft(null);
          router.replace(dynamicRoutes.chat(destId));
        },
        onError: (e) => {
          setDestinazione(null);
          avvisa('Ops', chatErrorMessage(e));
        },
      },
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => {
            setForwardDraft(null);
            router.back();
          }}
          hitSlop={10}
        >
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>
        <Text style={styles.title}>
          Inoltra {count === 1 ? '1 messaggio' : `${count} messaggi`}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>Scegli dove inoltrare</Text>
        <View style={styles.group}>
          {conversazioni.isLoading ? (
            <View style={styles.stateBox}>
              <ActivityIndicator color={colors.muted} />
            </View>
          ) : conversazioni.isError ? (
            <StatoErrore
              messaggio="Non riesco a caricare le conversazioni."
              onRetry={() => void conversazioni.refetch()}
            />
          ) : (conversazioni.data?.length ?? 0) === 0 ? (
            <View style={styles.stateBox}>
              <Text style={styles.vuoto}>Nessuna conversazione disponibile.</Text>
            </View>
          ) : (
            conversazioni.data!.map((c) => (
              <Pressable
                key={c.id}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                onPress={() => inoltraVerso(c)}
                disabled={forward.isPending}
              >
                <Avatar uri={c.avatarUrl} name={c.title ?? 'Chat'} size={44} />
                <View style={styles.rowText}>
                  <Text style={styles.name} numberOfLines={1}>
                    {c.title ?? 'Chat'}
                  </Text>
                  <Text style={styles.subtitle} numberOfLines={1}>
                    {c.type === 'dm' ? 'Chat diretta' : 'Gruppo'}
                  </Text>
                </View>
                {forward.isPending && destinazione === c.id ? (
                  <ActivityIndicator color={colors.accent} />
                ) : (
                  <Ionicons name="arrow-redo-outline" size={20} color={colors.faint} />
                )}
              </Pressable>
            ))
          )}
        </View>
        <View style={{ height: spacing['3xl'] }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.base },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  title: { flex: 1, color: colors.ink, fontSize: fontSize.lg, fontFamily: fontFamily.semibold },
  headerSpacer: { width: 26 },
  content: { paddingHorizontal: spacing.lg, gap: spacing.md, paddingTop: spacing.sm },
  sectionTitle: {
    color: colors.muted,
    fontSize: fontSize.sm,
    fontFamily: fontFamily.semibold,
    marginLeft: spacing.xs,
  },
  group: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  rowPressed: { backgroundColor: colors.elevated },
  rowText: { flex: 1, gap: 2 },
  name: { color: colors.ink, fontSize: fontSize.base, fontFamily: fontFamily.semibold },
  subtitle: { color: colors.muted, fontSize: fontSize.sm, fontFamily: fontFamily.sans },
  stateBox: { padding: spacing.xl, alignItems: 'center' },
  vuoto: {
    color: colors.muted,
    fontSize: fontSize.sm,
    fontFamily: fontFamily.sans,
    textAlign: 'center',
    lineHeight: 20,
  },
});
