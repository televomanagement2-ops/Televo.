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
import { VistaStato } from '@/components/ui/VistaStato';
import { useConversations, useForwardDropRef, useForwardMessages } from '@/hooks/useChat';
import { useChatStore } from '@/store/chatStore';
import { avvisa } from '@/lib/dialoghi';
import { chatErrorMessage } from '@/lib/errors';
import { statoSchermo } from '@/lib/query-ui';
import { useOnline } from '@/lib/rete';
import { dynamicRoutes } from '@/constants/routes';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';
import type { ConversationPreview } from '@/types';

export default function Inoltra() {
  const router = useRouter();
  const forwardDraft = useChatStore((s) => s.forwardDraft);
  const setForwardDraft = useChatStore((s) => s.setForwardDraft);
  // DM5: inoltro di un DROP come riferimento (drop_ref), alternativo ai messaggi.
  const forwardDropRef = useChatStore((s) => s.forwardDropRef);
  const setForwardDropRef = useChatStore((s) => s.setForwardDropRef);
  const conversazioni = useConversations('active');
  const online = useOnline();
  const stato = statoSchermo(conversazioni, online);
  const forward = useForwardMessages();
  const forwardDrop = useForwardDropRef();
  const isPending = forward.isPending || forwardDrop.isPending;
  // Destinazione in corso (spinner sulla riga giusta).
  const [destinazione, setDestinazione] = useState<string | null>(null);

  // Rotta aperta senza selezione (deep link a mano, stato perso): si torna via.
  useEffect(() => {
    const vuoto = (!forwardDraft || forwardDraft.length === 0) && !forwardDropRef;
    if (vuoto) router.back();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al mount
  }, []);

  const isDrop = !!forwardDropRef;
  const count = forwardDraft?.length ?? 0;
  const titolo = isDrop
    ? 'Inoltra un drop'
    : `Inoltra ${count === 1 ? '1 messaggio' : `${count} messaggi`}`;

  const annulla = () => {
    setForwardDraft(null);
    setForwardDropRef(null);
  };

  const inoltraVerso = (conv: ConversationPreview) => {
    if (isPending) return;
    setDestinazione(conv.id);
    const onSuccess = (destId: string) => {
      annulla();
      router.replace(dynamicRoutes.chat(destId));
    };
    const onError = (e: unknown) => {
      setDestinazione(null);
      avvisa('Ops', chatErrorMessage(e));
    };

    if (forwardDropRef) {
      forwardDrop.mutate({ destConvId: conv.id, dropId: forwardDropRef }, { onSuccess, onError });
      return;
    }
    if (!forwardDraft) return;
    forward.mutate({ destConvId: conv.id, messages: forwardDraft }, { onSuccess, onError });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => {
            annulla();
            router.back();
          }}
          hitSlop={10}
        >
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>
        <Text style={styles.title}>{titolo}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>Scegli dove inoltrare</Text>
        <View style={styles.group}>
          {stato !== 'dati' ? (
            <VistaStato
              stato={stato}
              messaggio="Non riesco a caricare le conversazioni."
              onRetry={() => void conversazioni.refetch()}
              caricamento={
                <View style={styles.stateBox}>
                  <ActivityIndicator color={colors.muted} />
                </View>
              }
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
                disabled={isPending}
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
                {isPending && destinazione === c.id ? (
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
