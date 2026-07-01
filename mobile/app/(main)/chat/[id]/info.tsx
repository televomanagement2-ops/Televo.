// =============================================================================
// Info conversazione (S13) — profilo peer (DM) o gestione gruppo (group/house).
// =============================================================================
// DM (versione minimale M3): profilo del peer + streak + n. membri; blocca/segnala
// arrivano in M8. Group/house: lista membri con ruolo; se sono admin posso
// aggiungere amici (riuso una selezione inline), rimuovere un membro, uscire.

import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { StreakBadge } from '@/components/chat/StreakBadge';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useAuth } from '@/hooks/useAuth';
import { useAmici } from '@/hooks/useAmici';
import {
  useAddMember,
  useConversationHeader,
  useLeaveConversation,
  useRemoveMember,
} from '@/hooks/useChat';
import { chatErrorMessage } from '@/lib/errors';
import { dynamicRoutes } from '@/constants/routes';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';
import type { ConversationMemberCard } from '@/lib/chat';
import type { ProfileCard } from '@/types';

export default function ChatInfo() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const convId = id ?? '';
  const router = useRouter();
  const { session } = useAuth();
  const uid = session?.user.id;

  const header = useConversationHeader(convId);
  const data = header.data;
  const isGroup = (data?.type ?? 'dm') !== 'dm';

  const meMember = data?.members.find((m) => m.userId === uid);
  const isAdmin = meMember?.role === 'admin';

  const addMember = useAddMember(convId);
  const removeMember = useRemoveMember(convId);
  const leave = useLeaveConversation(convId);

  const [showAdd, setShowAdd] = useState(false);

  const handleRemove = (m: ConversationMemberCard) => {
    const nome = m.profile?.displayName || m.profile?.username || 'questo membro';
    Alert.alert('Rimuovi membro', `Rimuovere ${nome} dal gruppo?`, [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Rimuovi',
        style: 'destructive',
        onPress: () =>
          removeMember.mutate(m.userId, {
            onError: (e) => Alert.alert('Ops', chatErrorMessage(e)),
          }),
      },
    ]);
  };

  const handleLeave = () => {
    Alert.alert('Esci dal gruppo', 'Vuoi davvero uscire da questa conversazione?', [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Esci',
        style: 'destructive',
        onPress: () =>
          leave.mutate(undefined, {
            onSuccess: () => router.back(),
            onError: (e) => Alert.alert('Ops', chatErrorMessage(e)),
          }),
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>
        <Text style={styles.title}>Info</Text>
        <View style={styles.headerSpacer} />
      </View>

      {header.isLoading ? (
        <LoadingSpinner label="Carico le informazioni…" style={styles.flex} />
      ) : !data ? (
        <View style={styles.center}>
          <Text style={styles.vuoto}>Conversazione non disponibile.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Intestazione: avatar + titolo + streak */}
          <View style={styles.hero}>
            <Avatar uri={data.avatarUrl} name={data.title} size={88} />
            <Text style={styles.heroTitle}>{data.title}</Text>
            <View style={styles.heroMeta}>
              {isGroup ? (
                <Text style={styles.heroSub}>
                  {data.memberCount} {data.memberCount === 1 ? 'membro' : 'membri'}
                </Text>
              ) : null}
              {data.streak ? <StreakBadge count={data.streak} /> : null}
            </View>
          </View>

          {isGroup ? (
            <>
              {/* Lista membri */}
              <Text style={styles.sectionTitle}>Membri</Text>
              <View style={styles.group}>
                {data.members.map((m) => (
                  <MembroRow
                    key={m.userId}
                    membro={m}
                    isMe={m.userId === uid}
                    canRemove={isAdmin && m.userId !== uid}
                    removing={removeMember.isPending && removeMember.variables === m.userId}
                    onRemove={() => handleRemove(m)}
                    onOpen={() =>
                      m.profile && router.push(dynamicRoutes.profiloUtente(m.profile.id))
                    }
                  />
                ))}
              </View>

              {/* Admin: aggiungi membri */}
              {isAdmin ? (
                showAdd ? (
                  <AggiungiMembri
                    existing={new Set(data.members.map((m) => m.userId))}
                    adding={addMember.isPending ? (addMember.variables ?? null) : null}
                    onAdd={(userId) =>
                      addMember.mutate(userId, {
                        onError: (e) => Alert.alert('Ops', chatErrorMessage(e)),
                      })
                    }
                    onClose={() => setShowAdd(false)}
                  />
                ) : (
                  <Pressable style={styles.addRow} onPress={() => setShowAdd(true)}>
                    <Ionicons name="person-add-outline" size={20} color={colors.accent} />
                    <Text style={styles.addLabel}>Aggiungi membri</Text>
                  </Pressable>
                )
              ) : null}

              {/* Esci dal gruppo */}
              <View style={styles.leaveBox}>
                <Button
                  label="Esci dal gruppo"
                  variant="secondary"
                  onPress={handleLeave}
                  loading={leave.isPending}
                />
              </View>
            </>
          ) : (
            // DM: profilo del peer (blocca/segnala arrivano in M8).
            data.peer && (
              <Pressable
                style={styles.group}
                onPress={() => router.push(dynamicRoutes.profiloUtente(data.peer!.id))}
              >
                <View style={styles.row}>
                  <Avatar uri={data.peer.avatarUrl} name={data.peer.username} size={44} />
                  <View style={styles.rowText}>
                    <Text style={styles.name} numberOfLines={1}>
                      {data.peer.displayName || data.peer.username}
                    </Text>
                    <Text style={styles.username} numberOfLines={1}>
                      @{data.peer.username}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.faint} />
                </View>
              </Pressable>
            )
          )}
          <View style={{ height: spacing['3xl'] }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function MembroRow({
  membro,
  isMe,
  canRemove,
  removing,
  onRemove,
  onOpen,
}: {
  membro: ConversationMemberCard;
  isMe: boolean;
  canRemove: boolean;
  removing: boolean;
  onRemove: () => void;
  onOpen: () => void;
}) {
  const p = membro.profile;
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={onOpen}
      disabled={!p}
    >
      <Avatar uri={p?.avatarUrl} name={p?.username ?? 'Utente'} size={44} />
      <View style={styles.rowText}>
        <Text style={styles.name} numberOfLines={1}>
          {isMe ? 'Tu' : p?.displayName || p?.username || 'Utente'}
        </Text>
        <Text style={styles.username} numberOfLines={1}>
          {membro.role === 'admin' ? 'Admin' : 'Membro'}
        </Text>
      </View>
      {canRemove ? (
        removing ? (
          <ActivityIndicator size="small" color={colors.muted} />
        ) : (
          <Pressable onPress={onRemove} hitSlop={8}>
            <Ionicons name="remove-circle-outline" size={22} color={colors.danger} />
          </Pressable>
        )
      ) : null}
    </Pressable>
  );
}

function AggiungiMembri({
  existing,
  adding,
  onAdd,
  onClose,
}: {
  existing: Set<string>;
  adding: string | null;
  onAdd: (userId: string) => void;
  onClose: () => void;
}) {
  const amici = useAmici();
  // Solo gli amici non ancora nel gruppo.
  const candidati = useMemo(
    () => (amici.data ?? []).filter((c) => !existing.has(c.id)),
    [amici.data, existing],
  );

  return (
    <View style={styles.addPanel}>
      <View style={styles.addPanelHead}>
        <Text style={styles.sectionTitle}>Aggiungi un amico</Text>
        <Pressable onPress={onClose} hitSlop={8}>
          <Ionicons name="close" size={20} color={colors.muted} />
        </Pressable>
      </View>
      <View style={styles.group}>
        {amici.isLoading ? (
          <View style={styles.stateBox}>
            <ActivityIndicator color={colors.muted} />
          </View>
        ) : candidati.length === 0 ? (
          <View style={styles.stateBox}>
            <Text style={styles.vuoto}>Nessun amico da aggiungere.</Text>
          </View>
        ) : (
          candidati.map((c: ProfileCard) => (
            <Pressable
              key={c.id}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={() => onAdd(c.id)}
              disabled={adding === c.id}
            >
              <Avatar uri={c.avatarUrl} name={c.username} size={44} />
              <View style={styles.rowText}>
                <Text style={styles.name} numberOfLines={1}>
                  {c.displayName || c.username}
                </Text>
                <Text style={styles.username} numberOfLines={1}>
                  @{c.username}
                </Text>
              </View>
              {adding === c.id ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <Ionicons name="add-circle-outline" size={22} color={colors.accent} />
              )}
            </Pressable>
          ))
        )}
      </View>
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
  title: { flex: 1, color: colors.ink, fontSize: fontSize.lg, fontFamily: fontFamily.semibold },
  headerSpacer: { width: 26 },
  content: { paddingHorizontal: spacing.lg, gap: spacing.md, paddingTop: spacing.sm },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },

  hero: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg },
  heroTitle: { color: colors.ink, fontSize: fontSize.xl, fontFamily: fontFamily.semibold },
  heroMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  heroSub: { color: colors.muted, fontSize: fontSize.sm, fontFamily: fontFamily.sans },

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
  username: { color: colors.muted, fontSize: fontSize.sm, fontFamily: fontFamily.sans },

  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  addLabel: { color: colors.accent, fontSize: fontSize.base, fontFamily: fontFamily.semibold },
  addPanel: { gap: spacing.sm },
  addPanelHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  leaveBox: { marginTop: spacing.md },

  stateBox: { padding: spacing.xl, alignItems: 'center' },
  vuoto: {
    color: colors.muted,
    fontSize: fontSize.sm,
    fontFamily: fontFamily.sans,
    textAlign: 'center',
    lineHeight: 20,
  },
});
