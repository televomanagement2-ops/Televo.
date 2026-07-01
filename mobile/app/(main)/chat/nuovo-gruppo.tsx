// =============================================================================
// Nuovo gruppo (S4) — crea una conversazione di gruppo tra amici.
// =============================================================================
// Nome opzionale + selezione multipla dalla lista amici → create_group_conversation
// (creatore = admin; membri non-amici verrebbero comunque filtrati dal backend).
// Alla creazione si sostituisce la rotta con la conversazione appena creata.
// House (scuola) è rimandata: il backend regge già entrambi, qui creiamo `group`.

import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { Button } from '@/components/ui/Button';
import { useAmici } from '@/hooks/useAmici';
import { useCreateGroup } from '@/hooks/useChat';
import { chatErrorMessage } from '@/lib/errors';
import { dynamicRoutes } from '@/constants/routes';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';
import type { ProfileCard } from '@/types';

export default function NuovoGruppo() {
  const router = useRouter();
  const amici = useAmici();
  const crea = useCreateGroup();

  const [nome, setNome] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleCrea = () => {
    if (crea.isPending) return;
    crea.mutate(
      { type: 'group', name: nome.trim() || null, members: [...selected] },
      {
        onSuccess: (convId) => router.replace(dynamicRoutes.chat(convId)),
        onError: (e) => Alert.alert('Ops', chatErrorMessage(e)),
      },
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>
        <Text style={styles.title}>Nuovo gruppo</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Nome (opzionale) */}
        <View style={styles.nameBox}>
          <Ionicons name="people-outline" size={20} color={colors.faint} />
          <TextInput
            value={nome}
            onChangeText={setNome}
            placeholder="Nome del gruppo (opzionale)"
            placeholderTextColor={colors.faint}
            selectionColor={colors.accent}
            maxLength={50}
            style={styles.nameInput}
          />
        </View>

        {/* Selezione amici */}
        <Text style={styles.sectionTitle}>
          {selected.size > 0 ? `${selected.size} selezionati` : 'Scegli chi invitare'}
        </Text>
        <View style={styles.group}>
          {amici.isLoading ? (
            <View style={styles.stateBox}>
              <ActivityIndicator color={colors.muted} />
            </View>
          ) : (amici.data?.length ?? 0) === 0 ? (
            <View style={styles.stateBox}>
              <Text style={styles.vuoto}>
                Non hai ancora amici da invitare. Aggiungine qualcuno e riprova.
              </Text>
            </View>
          ) : (
            amici.data!.map((c) => (
              <AmicoRow
                key={c.id}
                card={c}
                selezionato={selected.has(c.id)}
                onPress={() => toggle(c.id)}
              />
            ))
          )}
        </View>
        <View style={{ height: spacing['3xl'] }} />
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label="Crea gruppo"
          onPress={handleCrea}
          loading={crea.isPending}
          disabled={amici.isLoading}
        />
      </View>
    </SafeAreaView>
  );
}

function AmicoRow({
  card,
  selezionato,
  onPress,
}: {
  card: ProfileCard;
  selezionato: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={onPress}
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
      <Ionicons
        name={selezionato ? 'checkmark-circle' : 'ellipse-outline'}
        size={24}
        color={selezionato ? colors.accent : colors.faint}
      />
    </Pressable>
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

  nameBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 52,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  nameInput: {
    flex: 1,
    color: colors.ink,
    fontSize: fontSize.base,
    fontFamily: fontFamily.sans,
    padding: 0,
  },

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
  name: { color: colors.ink, fontSize: fontSize.base, fontFamily: fontFamily.semibold },
  username: { color: colors.muted, fontSize: fontSize.sm, fontFamily: fontFamily.sans },

  stateBox: { padding: spacing.xl, alignItems: 'center' },
  vuoto: {
    color: colors.muted,
    fontSize: fontSize.sm,
    fontFamily: fontFamily.sans,
    textAlign: 'center',
    lineHeight: 20,
  },

  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
