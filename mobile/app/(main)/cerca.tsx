// =============================================================================
// Cerca (S12a) — ricerca globale: persone + messaggi (CM4, RC-08).
// =============================================================================
// Si apre dall'header di Home e dell'hub Messaggi. Due sezioni: "Persone"
// (searchProfiles — username/nome, blocchi rispettati) e "Messaggi" (RPC
// search_messages: full-text 'italian' server-side, visibilità identica alla
// lista messaggi). Tap su un messaggio → apre la chat con ?highlight= (salto
// al messaggio con flash). Stanze/drops arriveranno con i rispettivi domini.

import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Avatar } from '@/components/ui/Avatar';
import { VistaStato } from '@/components/ui/VistaStato';
import { useAuth } from '@/hooks/useAuth';
import { useSearchMessages } from '@/hooks/useChat';
import { searchProfiles } from '@/lib/social';
import { useOnline } from '@/lib/rete';
import { dayLabel } from '@/lib/datetime';
import { dynamicRoutes } from '@/constants/routes';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';
import type { MessageSearchResult } from '@/lib/chat';

export default function Cerca() {
  const router = useRouter();
  const { session } = useAuth();
  const uid = session?.user.id;
  const online = useOnline();

  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(term), 350);
    return () => clearTimeout(t);
  }, [term]);

  const attiva = debounced.trim().length >= 2;

  const persone = useQuery({
    queryKey: ['search', 'profiles', uid ?? 'anon', debounced.trim()] as const,
    enabled: !!uid && attiva,
    queryFn: () => searchProfiles(debounced, uid as string),
    staleTime: 30_000,
  });
  // Ricerca messaggi GLOBALE (p_conv null).
  const messaggi = useSearchMessages(attiva ? debounced : '', null);

  const senzaDati = (persone.data?.length ?? 0) === 0 && (messaggi.data?.length ?? 0) === 0;
  const loading = attiva && (persone.isFetching || messaggi.isFetching);
  // Errore (CM8, SRS §14): se ENTRAMBE le ricerche falliscono non c'è nulla da
  // mostrare → StatoErrore con retry; un fallimento parziale mostra l'altra metà.
  const errore = attiva && !loading && persone.isError && messaggi.isError;
  // Offline (P1): le query sono in pausa, non in errore → senza questo ramo si
  // mostrerebbe "nessun risultato" fuorviante. La ricerca è per natura online.
  const offline = attiva && !loading && !errore && !online && senzaDati;
  const vuoto = attiva && !loading && !errore && !offline && senzaDati;

  const apriMessaggio = (r: MessageSearchResult) => {
    router.push({
      pathname: dynamicRoutes.chat(r.conversationId),
      params: { highlight: r.messageId },
    });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={colors.faint} />
          <TextInput
            value={term}
            onChangeText={setTerm}
            placeholder="Cerca persone, messaggi…"
            placeholderTextColor={colors.faint}
            selectionColor={colors.accent}
            style={styles.input}
            autoFocus
            returnKeyType="search"
          />
          {term.length > 0 ? (
            <Pressable onPress={() => setTerm('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.faint} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {!attiva ? (
          <View style={styles.stateBox}>
            <Ionicons name="search-outline" size={32} color={colors.faint} />
            <Text style={styles.stateText}>
              Cerca amici per nome o ritrova un messaggio nelle tue chat.
            </Text>
          </View>
        ) : loading ? (
          <View style={styles.stateBox}>
            <ActivityIndicator color={colors.muted} />
          </View>
        ) : offline ? (
          <VistaStato
            stato="offline"
            onRetry={() => {
              void persone.refetch();
              void messaggi.refetch();
            }}
          />
        ) : errore ? (
          <VistaStato
            stato="errore"
            messaggio="Non riesco a cercare in questo momento."
            onRetry={() => {
              void persone.refetch();
              void messaggi.refetch();
            }}
          />
        ) : vuoto ? (
          <View style={styles.stateBox}>
            <Text style={styles.stateText}>Nessun risultato per “{debounced.trim()}”.</Text>
          </View>
        ) : (
          <>
            {(persone.data?.length ?? 0) > 0 ? (
              <>
                <Text style={styles.sectionTitle}>Persone</Text>
                <View style={styles.group}>
                  {persone.data!.map((p) => (
                    <Pressable
                      key={p.id}
                      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                      onPress={() => router.push(dynamicRoutes.profiloUtente(p.id))}
                    >
                      <Avatar uri={p.avatarUrl} name={p.username} size={44} />
                      <View style={styles.rowText}>
                        <Text style={styles.name} numberOfLines={1}>
                          {p.displayName || p.username}
                        </Text>
                        <Text style={styles.sub} numberOfLines={1}>
                          @{p.username}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={colors.faint} />
                    </Pressable>
                  ))}
                </View>
              </>
            ) : null}

            {(messaggi.data?.length ?? 0) > 0 ? (
              <>
                <Text style={styles.sectionTitle}>Messaggi</Text>
                <View style={styles.group}>
                  {messaggi.data!.map((r) => (
                    <Pressable
                      key={r.messageId}
                      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                      onPress={() => apriMessaggio(r)}
                    >
                      <View style={styles.msgIcon}>
                        <Ionicons name="chatbubble-outline" size={18} color={colors.accentSoft} />
                      </View>
                      <View style={styles.rowText}>
                        <View style={styles.msgHead}>
                          <Text style={styles.name} numberOfLines={1}>
                            {r.convTitle}
                          </Text>
                          <Text style={styles.msgDate}>{dayLabel(r.createdAt)}</Text>
                        </View>
                        <Text style={styles.sub} numberOfLines={2}>
                          {r.senderUsername ? `${r.senderUsername}: ` : ''}
                          {r.body ?? ''}
                        </Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : null}
          </>
        )}
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
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 44,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: {
    flex: 1,
    color: colors.ink,
    fontSize: fontSize.base,
    fontFamily: fontFamily.sans,
    padding: 0,
  },
  content: { paddingHorizontal: spacing.lg, gap: spacing.md, paddingTop: spacing.sm },

  sectionTitle: {
    color: colors.muted,
    fontSize: fontSize.sm,
    fontFamily: fontFamily.semibold,
    marginLeft: spacing.xs,
    marginTop: spacing.sm,
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
  name: { color: colors.ink, fontSize: fontSize.base, fontFamily: fontFamily.semibold, flexShrink: 1 },
  sub: { color: colors.muted, fontSize: fontSize.sm, fontFamily: fontFamily.sans },
  msgIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.elevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  msgHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  msgDate: { color: colors.faint, fontSize: fontSize.xs, fontFamily: fontFamily.sans },

  stateBox: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing['3xl'] },
  stateText: {
    color: colors.muted,
    fontSize: fontSize.sm,
    fontFamily: fontFamily.sans,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: spacing.xl,
  },
});
