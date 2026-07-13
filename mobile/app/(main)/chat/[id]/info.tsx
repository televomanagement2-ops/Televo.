// =============================================================================
// Info conversazione (S13) — profilo peer (DM) o gestione gruppo (group/house).
// =============================================================================
// DM: profilo del peer + streak + blocca/sblocca (segnala arriva in M8).
// Group/house: lista membri con ruolo; se sono admin posso aggiungere amici
// (riuso una selezione inline), rimuovere un membro, uscire.
// CM4 (R-09): l'admin può RINOMINARE il gruppo / cambiarne l'immagine
// (pannello inline sull'hero → update_conversation_meta) e PROMUOVERE un
// membro ad admin (scudo sulla riga). L'auto-promozione quando esce l'ultimo
// admin è server-side (leave_conversation v2).

import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useQueryClient } from '@tanstack/react-query';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { StreakBadge } from '@/components/chat/StreakBadge';
import { VistaStato } from '@/components/ui/VistaStato';
import { useAuth } from '@/hooks/useAuth';
import { useAmici, useAzioniAmicizia, useRelazione } from '@/hooks/useAmici';
import {
  useAddMember,
  useConversationHeader,
  useLeaveConversation,
  usePromoteAdmin,
  useRemoveMember,
  useUpdateConversationMeta,
} from '@/hooks/useChat';
import { uploadGroupAvatar } from '@/lib/chat';
import { avvisa, conferma } from '@/lib/dialoghi';
import { chatErrorMessage } from '@/lib/errors';
import { statoSchermo } from '@/lib/query-ui';
import { useOnline } from '@/lib/rete';
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
  const online = useOnline();
  const stato = statoSchermo(header, online);
  const data = header.data;
  const isGroup = (data?.type ?? 'dm') !== 'dm';

  const meMember = data?.members.find((m) => m.userId === uid);
  const isAdmin = meMember?.role === 'admin';

  const addMember = useAddMember(convId);
  const removeMember = useRemoveMember(convId);
  const leave = useLeaveConversation(convId);
  const updateMeta = useUpdateConversationMeta(convId);
  const promote = usePromoteAdmin(convId);

  // CM4: pannello inline "Modifica gruppo" (nome + immagine), solo admin.
  const [editMeta, setEditMeta] = useState(false);
  const [metaNome, setMetaNome] = useState('');
  const [metaAvatar, setMetaAvatar] = useState<string | null>(null);
  const [uploadingFoto, setUploadingFoto] = useState(false);

  const openEditMeta = () => {
    setMetaNome(data?.title ?? '');
    setMetaAvatar(data?.avatarUrl ?? null);
    setEditMeta(true);
  };

  const pickGroupPhoto = async () => {
    if (!uid || uploadingFoto) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      base64: true,
    });
    if (res.canceled) return;
    const asset = res.assets?.[0];
    if (!asset?.base64) return;
    setUploadingFoto(true);
    try {
      // Upload nella MIA cartella del bucket avatars (policy esistenti); l'URL
      // diventa l'avatar del gruppo solo al Salva (RPC admin-only).
      const url = await uploadGroupAvatar(uid, convId, asset.base64, asset.mimeType ?? 'image/jpeg');
      setMetaAvatar(url);
    } catch {
      avvisa('Ops', 'Caricamento immagine non riuscito.');
    } finally {
      setUploadingFoto(false);
    }
  };

  const handleSaveMeta = () => {
    updateMeta.mutate(
      { name: metaNome.trim(), avatarUrl: metaAvatar },
      {
        onSuccess: () => setEditMeta(false),
        onError: (e) => avvisa('Ops', chatErrorMessage(e)),
      },
    );
  };

  const handlePromote = (m: ConversationMemberCard) => {
    const nome = m.profile?.displayName || m.profile?.username || 'questo membro';
    conferma({
      titolo: 'Rendi admin',
      messaggio: `${nome} potrà gestire membri e impostazioni del gruppo.`,
      confermaLabel: 'Rendi admin',
      onConferma: () =>
        promote.mutate(m.userId, {
          onError: (e) => avvisa('Ops', chatErrorMessage(e)),
        }),
    });
  };

  // DM: relazione col peer per l'azione Blocca/Sblocca.
  const peerId = !isGroup ? data?.peer?.id : undefined;
  const relPeer = useRelazione(peerId);
  const azioni = useAzioniAmicizia();
  const queryClient = useQueryClient();

  // Dopo blocca/sblocca il composer della chat va ricalcolato al rientro.
  const aggiornaComposer = () =>
    queryClient.invalidateQueries({ queryKey: ['chat', 'composer-block'] });

  const handleBlocca = () => {
    if (!peerId) return;
    conferma({
      titolo: 'Blocca utente',
      messaggio: 'Non potrete più scrivervi né trovarvi.',
      confermaLabel: 'Blocca',
      distruttiva: true,
      onConferma: () =>
        azioni.blocca.mutate(peerId, {
          onSuccess: aggiornaComposer,
          onError: (e) => avvisa('Ops', chatErrorMessage(e)),
        }),
    });
  };

  const handleSblocca = () => {
    if (!peerId) return;
    azioni.sblocca.mutate(peerId, {
      onSuccess: aggiornaComposer,
      onError: (e) => avvisa('Ops', chatErrorMessage(e)),
    });
  };

  const [showAdd, setShowAdd] = useState(false);

  const handleRemove = (m: ConversationMemberCard) => {
    const nome = m.profile?.displayName || m.profile?.username || 'questo membro';
    conferma({
      titolo: 'Rimuovi membro',
      messaggio: `Rimuovere ${nome} dal gruppo?`,
      confermaLabel: 'Rimuovi',
      distruttiva: true,
      onConferma: () =>
        removeMember.mutate(m.userId, {
          onError: (e) => avvisa('Ops', chatErrorMessage(e)),
        }),
    });
  };

  const handleLeave = () => {
    conferma({
      titolo: 'Esci dal gruppo',
      messaggio: 'Vuoi davvero uscire da questa conversazione?',
      confermaLabel: 'Esci',
      distruttiva: true,
      onConferma: () =>
        leave.mutate(undefined, {
          onSuccess: () => router.back(),
          onError: (e) => avvisa('Ops', chatErrorMessage(e)),
        }),
    });
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

      {stato !== 'dati' ? (
        <VistaStato
          stato={stato}
          messaggio="Non riesco a caricare le informazioni."
          etichettaCaricamento="Carico le informazioni…"
          onRetry={() => void header.refetch()}
          style={styles.flex}
        />
      ) : !data ? (
        <View style={styles.center}>
          <Text style={styles.vuoto}>Conversazione non disponibile.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Intestazione: avatar + titolo + streak */}
          <View style={styles.hero}>
            <Avatar uri={data.avatarUrl} name={data.title} size={88} />
            <View style={styles.heroTitleRow}>
              <Text style={styles.heroTitle}>{data.title}</Text>
              {isGroup && isAdmin && !editMeta ? (
                <Pressable onPress={openEditMeta} hitSlop={8}>
                  <Ionicons name="pencil-outline" size={18} color={colors.accent} />
                </Pressable>
              ) : null}
            </View>
            <View style={styles.heroMeta}>
              {isGroup ? (
                <Text style={styles.heroSub}>
                  {data.memberCount} {data.memberCount === 1 ? 'membro' : 'membri'}
                </Text>
              ) : null}
              {data.streak ? <StreakBadge count={data.streak} /> : null}
            </View>
          </View>

          {/* CM4: pannello admin "Modifica gruppo" (nome + immagine). */}
          {isGroup && isAdmin && editMeta ? (
            <View style={styles.metaPanel}>
              <View style={styles.addPanelHead}>
                <Text style={styles.sectionTitle}>Modifica gruppo</Text>
                <Pressable onPress={() => setEditMeta(false)} hitSlop={8}>
                  <Ionicons name="close" size={20} color={colors.muted} />
                </Pressable>
              </View>
              <View style={styles.metaBody}>
                <Pressable onPress={pickGroupPhoto} style={styles.metaAvatar} disabled={uploadingFoto}>
                  <Avatar uri={metaAvatar} name={metaNome || 'Gruppo'} size={56} />
                  {uploadingFoto ? (
                    <ActivityIndicator size="small" color={colors.accent} style={styles.metaAvatarBusy} />
                  ) : (
                    <View style={styles.metaAvatarBadge}>
                      <Ionicons name="camera" size={12} color="#ffffff" />
                    </View>
                  )}
                </Pressable>
                <TextInput
                  value={metaNome}
                  onChangeText={setMetaNome}
                  placeholder="Nome del gruppo"
                  placeholderTextColor={colors.faint}
                  selectionColor={colors.accent}
                  maxLength={80}
                  style={styles.metaInput}
                />
              </View>
              <Button
                label="Salva"
                onPress={handleSaveMeta}
                loading={updateMeta.isPending}
                disabled={metaNome.trim().length === 0 || uploadingFoto}
              />
            </View>
          ) : null}

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
                    canPromote={isAdmin && m.userId !== uid && m.role !== 'admin'}
                    removing={removeMember.isPending && removeMember.variables === m.userId}
                    promoting={promote.isPending && promote.variables === m.userId}
                    onRemove={() => handleRemove(m)}
                    onPromote={() => handlePromote(m)}
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
                        onError: (e) => avvisa('Ops', chatErrorMessage(e)),
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
            // DM: profilo del peer + blocca/sblocca (segnala arriva in M8).
            data.peer && (
              <>
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

                {/* Blocca/Sblocca. Se è il PEER ad avermi bloccato, nessuna riga:
                    il blocco altrui non va mai rivelato. */}
                {relPeer.data === 'blocked_by_me' ? (
                  <Pressable
                    style={({ pressed }) => [styles.group, pressed && styles.rowPressed]}
                    onPress={handleSblocca}
                    disabled={azioni.sblocca.isPending}
                  >
                    <View style={styles.row}>
                      {azioni.sblocca.isPending ? (
                        <ActivityIndicator size="small" color={colors.ink} />
                      ) : (
                        <Ionicons name="lock-open-outline" size={20} color={colors.ink} />
                      )}
                      <Text style={styles.name}>Sblocca utente</Text>
                    </View>
                  </Pressable>
                ) : relPeer.data && relPeer.data !== 'blocked_by_them' ? (
                  <Pressable
                    style={({ pressed }) => [styles.group, pressed && styles.rowPressed]}
                    onPress={handleBlocca}
                    disabled={azioni.blocca.isPending}
                  >
                    <View style={styles.row}>
                      {azioni.blocca.isPending ? (
                        <ActivityIndicator size="small" color={colors.danger} />
                      ) : (
                        <Ionicons name="ban-outline" size={20} color={colors.danger} />
                      )}
                      <Text style={[styles.name, styles.danger]}>Blocca utente</Text>
                    </View>
                  </Pressable>
                ) : null}
              </>
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
  canPromote,
  removing,
  promoting,
  onRemove,
  onPromote,
  onOpen,
}: {
  membro: ConversationMemberCard;
  isMe: boolean;
  canRemove: boolean;
  /** CM4 (R-09): l'admin può promuovere i membri non-admin. */
  canPromote: boolean;
  removing: boolean;
  promoting: boolean;
  onRemove: () => void;
  onPromote: () => void;
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
      {canPromote ? (
        promoting ? (
          <ActivityIndicator size="small" color={colors.muted} />
        ) : (
          <Pressable onPress={onPromote} hitSlop={8}>
            <Ionicons name="shield-outline" size={20} color={colors.accent} />
          </Pressable>
        )
      ) : null}
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
  heroTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  heroMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  heroSub: { color: colors.muted, fontSize: fontSize.sm, fontFamily: fontFamily.sans },

  // CM4: pannello admin "Modifica gruppo".
  metaPanel: {
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  metaBody: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  metaAvatar: { position: 'relative' },
  metaAvatarBusy: { position: 'absolute', right: -2, bottom: -2 },
  metaAvatarBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaInput: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.md,
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    color: colors.ink,
    fontSize: fontSize.base,
    fontFamily: fontFamily.sans,
  },

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
  danger: { color: colors.danger },

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
