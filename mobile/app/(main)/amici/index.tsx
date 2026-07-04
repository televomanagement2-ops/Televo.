// =============================================================================
// Amici — hub delle amicizie: richieste ricevute/inviate, lista amici, ricerca.
// =============================================================================
// Prerequisito della chat: la DM esiste SOLO tra amici accettati (get_or_create_dm
// richiede are_friends). Qui si trovano persone e si gestiscono le richieste. Le
// mutazioni passano dalle RPC (useAzioniAmicizia). Tap su una persona → profilo
// altrui, dove c'è l'azione corretta in base alla relazione.

import { useState } from 'react';
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
import { Avatar } from '@/components/ui/Avatar';
import {
  useAmici,
  usePendingRequests,
  useSearchUsers,
  useAzioniAmicizia,
} from '@/hooks/useAmici';
import { avvisa } from '@/lib/dialoghi';
import { chatErrorMessage } from '@/lib/errors';
import { dynamicRoutes } from '@/constants/routes';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';
import type { ProfileCard } from '@/types';

export default function Amici() {
  const router = useRouter();
  const [term, setTerm] = useState('');
  const searching = term.trim().length >= 2;

  const amici = useAmici();
  const pending = usePendingRequests();
  const ricerca = useSearchUsers(term);
  const azioni = useAzioniAmicizia();

  const apriProfilo = (id: string) => router.push(dynamicRoutes.profiloUtente(id));

  const run = (
    mutation: { mutate: (id: string, opts?: { onError?: (e: unknown) => void }) => void },
    id: string,
  ) => mutation.mutate(id, { onError: (e) => avvisa('Ops', chatErrorMessage(e)) });

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header con ricerca inline */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={colors.faint} />
          <TextInput
            value={term}
            onChangeText={setTerm}
            placeholder="Cerca un amico per username…"
            placeholderTextColor={colors.faint}
            selectionColor={colors.accent}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.searchInput}
          />
          {term.length > 0 ? (
            <Pressable onPress={() => setTerm('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.faint} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {searching ? (
          // --- Risultati ricerca ---
          <Section title="Risultati">
            {ricerca.isLoading ? (
              <Caricamento />
            ) : (ricerca.data?.length ?? 0) === 0 ? (
              <Vuoto testo="Nessun utente trovato." />
            ) : (
              ricerca.data!.map((c) => (
                <PersonaRow key={c.id} card={c} onPress={() => apriProfilo(c.id)}>
                  <Ionicons name="chevron-forward" size={18} color={colors.faint} />
                </PersonaRow>
              ))
            )}
          </Section>
        ) : (
          <>
            {/* --- Richieste ricevute --- */}
            {(pending.data?.incoming.length ?? 0) > 0 ? (
              <Section title="Richieste ricevute">
                {pending.data!.incoming.map((c) => (
                  <PersonaRow key={c.id} card={c} onPress={() => apriProfilo(c.id)}>
                    <View style={styles.rowActions}>
                      <PillBtn
                        label="Accetta"
                        primary
                        loading={azioni.accetta.isPending && azioni.accetta.variables === c.id}
                        onPress={() => run(azioni.accetta, c.id)}
                      />
                      <IconBtn
                        icon="close"
                        loading={azioni.rimuovi.isPending && azioni.rimuovi.variables === c.id}
                        onPress={() => run(azioni.rimuovi, c.id)}
                      />
                    </View>
                  </PersonaRow>
                ))}
              </Section>
            ) : null}

            {/* --- Richieste inviate --- */}
            {(pending.data?.outgoing.length ?? 0) > 0 ? (
              <Section title="Richieste inviate">
                {pending.data!.outgoing.map((c) => (
                  <PersonaRow key={c.id} card={c} onPress={() => apriProfilo(c.id)}>
                    <PillBtn
                      label="Annulla"
                      loading={azioni.rimuovi.isPending && azioni.rimuovi.variables === c.id}
                      onPress={() => run(azioni.rimuovi, c.id)}
                    />
                  </PersonaRow>
                ))}
              </Section>
            ) : null}

            {/* --- Amici --- */}
            <Section title="I tuoi amici">
              {amici.isLoading ? (
                <Caricamento />
              ) : (amici.data?.length ?? 0) === 0 ? (
                <Vuoto testo="Non hai ancora amici. Cerca qualcuno qui sopra per iniziare." />
              ) : (
                amici.data!.map((c) => (
                  <PersonaRow key={c.id} card={c} onPress={() => apriProfilo(c.id)}>
                    <Ionicons name="chevron-forward" size={18} color={colors.faint} />
                  </PersonaRow>
                ))
              )}
            </Section>
          </>
        )}
        <View style={{ height: spacing['3xl'] }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// --- Sottocomponenti ---------------------------------------------------------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.group}>{children}</View>
    </View>
  );
}

function PersonaRow({
  card,
  onPress,
  children,
}: {
  card: ProfileCard;
  onPress?: () => void;
  children?: React.ReactNode;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={onPress}
      disabled={!onPress}
    >
      <Avatar uri={card.avatarUrl} name={card.username} size={44} />
      <View style={styles.rowText}>
        <Text style={styles.name} numberOfLines={1}>
          {card.displayName || card.username}
        </Text>
        <Text style={styles.username} numberOfLines={1}>
          @{card.username}
        </Text>
      </View>
      {children}
    </Pressable>
  );
}

function PillBtn({
  label,
  onPress,
  primary,
  loading,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  loading?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      style={({ pressed }) => [
        styles.pill,
        primary ? styles.pillPrimary : styles.pillGhost,
        pressed && styles.pressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={primary ? '#fff' : colors.ink} />
      ) : (
        <Text style={[styles.pillLabel, primary && styles.pillLabelPrimary]}>{label}</Text>
      )}
    </Pressable>
  );
}

function IconBtn({
  icon,
  onPress,
  loading,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  loading?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      hitSlop={6}
      style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={colors.muted} />
      ) : (
        <Ionicons name={icon} size={18} color={colors.muted} />
      )}
    </Pressable>
  );
}

function Caricamento() {
  return (
    <View style={styles.stateBox}>
      <ActivityIndicator color={colors.muted} />
    </View>
  );
}

function Vuoto({ testo }: { testo: string }) {
  return (
    <View style={styles.stateBox}>
      <Text style={styles.vuoto}>{testo}</Text>
    </View>
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
  searchInput: {
    flex: 1,
    color: colors.ink,
    fontSize: fontSize.base,
    fontFamily: fontFamily.sans,
    padding: 0,
  },
  content: { paddingHorizontal: spacing.lg, gap: spacing.xl, paddingTop: spacing.sm },

  section: { gap: spacing.sm },
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  rowPressed: { backgroundColor: colors.elevated },
  rowText: { flex: 1, gap: 2 },
  name: { color: colors.ink, fontSize: fontSize.base, fontFamily: fontFamily.semibold },
  username: { color: colors.muted, fontSize: fontSize.sm, fontFamily: fontFamily.sans },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },

  pill: {
    minWidth: 76,
    height: 34,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillPrimary: { backgroundColor: colors.accent },
  pillGhost: { backgroundColor: colors.elevated, borderWidth: 1, borderColor: colors.border },
  pillLabel: { color: colors.ink, fontSize: fontSize.sm, fontFamily: fontFamily.semibold },
  pillLabelPrimary: { color: '#ffffff' },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: { opacity: 0.85 },

  stateBox: { padding: spacing.xl, alignItems: 'center' },
  vuoto: {
    color: colors.muted,
    fontSize: fontSize.sm,
    fontFamily: fontFamily.sans,
    textAlign: 'center',
    lineHeight: 20,
  },
});
