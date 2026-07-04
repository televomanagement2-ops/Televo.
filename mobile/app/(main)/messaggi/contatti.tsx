// =============================================================================
// I tuoi contatti su Televo — S11 (CM7, D1: match rubrica per hash email).
// =============================================================================
// Macchina a stati: consenso non dato (hero + opt-in GDPR) → permesso OS negato
// (link alle impostazioni) → sync in corso → risultati (Aggiungi / Inviata /
// Messaggia) / nessun match. La revoca vive IN FONDO a questa schermata (il
// consenso si revoca dove il dato vive) ed è atomica lato server
// (revoke_contacts_sync). La rubrica non lascia mai il device in chiaro: la
// lettura parte SOLO da un gesto esplicito (niente fetch automatici in cache).

import { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useAmici, useApriDm, useAzioniAmicizia, usePendingRequests } from '@/hooks/useAmici';
import {
  useAttivaContatti,
  useConsensoContatti,
  useMatchContatti,
  useRevocaContatti,
  useSincronizzaContatti,
  type ContattoArricchito,
  type StatoContatto,
} from '@/hooks/useContatti';
import { richiediPermessoRubrica } from '@/lib/contatti';
import { avvisa, conferma } from '@/lib/dialoghi';
import { chatErrorMessage } from '@/lib/errors';
import { dynamicRoutes } from '@/constants/routes';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';

export default function Contatti() {
  const router = useRouter();
  const consenso = useConsensoContatti();
  const attiva = useAttivaContatti();
  const sync = useSincronizzaContatti();
  const match = useMatchContatti();
  const revoca = useRevocaContatti();
  const amici = useAmici();
  const pending = usePendingRequests();
  const azioni = useAzioniAmicizia();
  const apriDm = useApriDm();

  const [permessoNegato, setPermessoNegato] = useState(false);
  const onErr = (e: unknown) => avvisa('Ops', chatErrorMessage(e));

  const avviaSync = useCallback(async () => {
    const ok = await richiediPermessoRubrica();
    setPermessoNegato(!ok);
    if (!ok) return;
    sync.mutate(undefined, { onError: onErr });
  }, [sync]);

  // Col consenso già attivo, la prima apertura sincronizza da sola (una volta
  // per sessione: i risultati restano in cache finché non si preme Aggiorna).
  const autoSync = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (consenso.data === true && !autoSync.current && !match.data && !sync.isPending) {
        autoSync.current = true;
        void avviaSync();
      }
    }, [consenso.data, match.data, sync.isPending, avviaSync]),
  );

  // Stato amicizia per riga, derivato dalle liste già in cache (zero query extra).
  const risultati = useMemo<ContattoArricchito[]>(() => {
    const amiciIds = new Set((amici.data ?? []).map((c) => c.id));
    const inviateIds = new Set((pending.data?.outgoing ?? []).map((c) => c.id));
    return (match.data ?? []).map((m) => ({
      ...m,
      stato: amiciIds.has(m.userId)
        ? 'amico'
        : inviateIds.has(m.userId)
          ? 'richiesta_inviata'
          : 'nessuno',
    }));
  }, [match.data, amici.data, pending.data]);

  const handleAttiva = () =>
    attiva.mutate(undefined, {
      onSuccess: () => void avviaSync(),
      onError: onErr,
    });

  const handleRevoca = () =>
    conferma({
      titolo: 'Disattiva la rubrica',
      messaggio:
        'Rimuoviamo la tua impronta dai server e revochiamo il consenso: nessuno potrà più trovarti dalla rubrica.',
      confermaLabel: 'Disattiva',
      distruttiva: true,
      onConferma: () => revoca.mutate(undefined, { onError: onErr }),
    });

  const messaggia = (userId: string) =>
    apriDm.mutate(userId, {
      onSuccess: (convId) => router.push(dynamicRoutes.chat(convId)),
      onError: onErr,
    });

  const aggiungi = (userId: string) => azioni.richiedi.mutate(userId, { onError: onErr });

  // --- Corpo in base allo stato ------------------------------------------------
  let corpo: React.ReactElement;
  if (consenso.isLoading) {
    corpo = <LoadingSpinner label="Controllo il consenso…" style={styles.flex} />;
  } else if (consenso.isError) {
    corpo = (
      <View style={styles.center}>
        <Text style={styles.vuoto}>Non riesco a controllare il consenso.</Text>
        <Button label="Riprova" variant="secondary" onPress={() => void consenso.refetch()} />
      </View>
    );
  } else if (consenso.data !== true) {
    // 1. Opt-in GDPR: spiegazione chiara PRIMA di toccare la rubrica.
    corpo = (
      <View style={styles.hero}>
        <View style={styles.heroIcona}>
          <Ionicons name="people-circle-outline" size={56} color={colors.accent} />
        </View>
        <Text style={styles.heroTitolo}>Trova i tuoi contatti</Text>
        <Text style={styles.heroTesto}>
          Confrontiamo la tua rubrica con Televo usando solo impronte anonime (SHA-256) delle
          email: i contatti non lasciano mai il telefono in chiaro e non salviamo la rubrica.
          Puoi disattivare quando vuoi, rimuovendo anche la tua impronta.
        </Text>
        <Button label="Attiva" onPress={handleAttiva} loading={attiva.isPending} />
      </View>
    );
  } else if (permessoNegato) {
    // 2. Permesso OS negato: si sblocca solo dalle impostazioni di sistema.
    corpo = (
      <View style={styles.center}>
        <Ionicons name="lock-closed-outline" size={44} color={colors.faint} />
        <Text style={styles.vuotoTitolo}>Serve l’accesso alla rubrica</Text>
        <Text style={styles.vuoto}>
          Hai negato il permesso: per trovare i tuoi contatti consenti l’accesso nelle
          impostazioni del telefono.
        </Text>
        <Button label="Apri impostazioni" onPress={() => void Linking.openSettings()} />
        <Button label="Riprova" variant="secondary" onPress={() => void avviaSync()} />
      </View>
    );
  } else if (sync.isPending) {
    corpo = <LoadingSpinner label="Confronto la rubrica…" style={styles.flex} />;
  } else if (risultati.length === 0) {
    corpo = (
      <View style={styles.center}>
        <Ionicons name="person-add-outline" size={44} color={colors.faint} />
        <Text style={styles.vuotoTitolo}>Nessun contatto trovato</Text>
        <Text style={styles.vuoto}>
          Nessuna email della tua rubrica è su Televo per ora. Torna dopo che i tuoi amici si
          saranno iscritti.
        </Text>
        <Button label="Aggiorna" variant="secondary" onPress={() => void avviaSync()} />
      </View>
    );
  } else {
    corpo = (
      <FlatList
        data={risultati}
        keyExtractor={(c) => c.userId}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <Text style={styles.listCount}>
              {risultati.length === 1
                ? '1 contatto su Televo'
                : `${risultati.length} contatti su Televo`}
            </Text>
            <Pressable hitSlop={10} onPress={() => void avviaSync()}>
              <Ionicons name="refresh-outline" size={20} color={colors.muted} />
            </Pressable>
          </View>
        }
        renderItem={({ item }) => (
          <RigaContatto
            contatto={item}
            busyAdd={azioni.richiedi.isPending && azioni.richiedi.variables === item.userId}
            busyDm={apriDm.isPending && apriDm.variables === item.userId}
            onAggiungi={() => aggiungi(item.userId)}
            onMessaggia={() => messaggia(item.userId)}
            onApriProfilo={() => router.push(dynamicRoutes.profiloUtente(item.userId))}
          />
        )}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>
        <Text style={styles.title}>I tuoi contatti</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.flex}>{corpo}</View>

      {/* Revoca: visibile solo col consenso attivo, in fondo (GDPR by design). */}
      {consenso.data === true ? (
        <Pressable style={styles.revocaRow} onPress={handleRevoca} disabled={revoca.isPending}>
          <Ionicons name="trash-outline" size={16} color={colors.danger} />
          <Text style={styles.revocaText}>
            {revoca.isPending ? 'Disattivo…' : 'Disattiva e rimuovi i miei dati'}
          </Text>
        </Pressable>
      ) : null}
    </SafeAreaView>
  );
}

// --- Riga risultato ------------------------------------------------------------

function RigaContatto({
  contatto,
  busyAdd,
  busyDm,
  onAggiungi,
  onMessaggia,
  onApriProfilo,
}: {
  contatto: ContattoArricchito;
  busyAdd: boolean;
  busyDm: boolean;
  onAggiungi: () => void;
  onMessaggia: () => void;
  onApriProfilo: () => void;
}) {
  const azione: Record<StatoContatto, React.ReactElement> = {
    amico: (
      <Pressable
        style={({ pressed }) => [styles.pillSecondaria, pressed && styles.pressed]}
        onPress={onMessaggia}
        disabled={busyDm}
      >
        <Text style={styles.pillSecondariaText}>{busyDm ? 'Apro…' : 'Messaggia'}</Text>
      </Pressable>
    ),
    richiesta_inviata: (
      <View style={styles.pillMuted}>
        <Text style={styles.pillMutedText}>Inviata</Text>
      </View>
    ),
    nessuno: (
      <Pressable
        style={({ pressed }) => [styles.pillPrimaria, pressed && styles.pressed]}
        onPress={onAggiungi}
        disabled={busyAdd}
      >
        <Text style={styles.pillPrimariaText}>{busyAdd ? 'Invio…' : 'Aggiungi'}</Text>
      </Pressable>
    ),
  };

  return (
    <Pressable style={({ pressed }) => [styles.riga, pressed && styles.pressed]} onPress={onApriProfilo}>
      <Avatar uri={contatto.avatarUrl} name={contatto.username} size={44} />
      <Text style={styles.rigaNome} numberOfLines={1}>
        {contatto.username}
      </Text>
      {azione[contatto.stato]}
    </Pressable>
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
  title: { color: colors.ink, fontSize: fontSize.lg, fontFamily: fontFamily.semibold },
  headerSpacer: { flex: 1 },

  // Hero opt-in
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    padding: spacing.xl,
  },
  heroIcona: {
    width: 96,
    height: 96,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  heroTitolo: { color: colors.ink, fontSize: fontSize.xl, fontFamily: fontFamily.semibold },
  heroTesto: {
    color: colors.muted,
    fontSize: fontSize.sm,
    fontFamily: fontFamily.sans,
    textAlign: 'center',
    lineHeight: 20,
  },

  // Stati centrati
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  vuotoTitolo: { color: colors.ink, fontSize: fontSize.lg, fontFamily: fontFamily.semibold },
  vuoto: {
    color: colors.muted,
    fontSize: fontSize.sm,
    fontFamily: fontFamily.sans,
    textAlign: 'center',
    lineHeight: 20,
  },

  // Lista risultati
  listContent: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing['3xl'] },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: spacing.sm,
  },
  listCount: { color: colors.muted, fontSize: fontSize.sm, fontFamily: fontFamily.medium },
  riga: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  rigaNome: { flex: 1, color: colors.ink, fontSize: fontSize.base, fontFamily: fontFamily.medium },
  pressed: { opacity: 0.7 },

  // Pill azioni
  pillPrimaria: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
  },
  pillPrimariaText: { color: '#ffffff', fontSize: fontSize.xs, fontFamily: fontFamily.semibold },
  pillSecondaria: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pillSecondariaText: { color: colors.ink, fontSize: fontSize.xs, fontFamily: fontFamily.semibold },
  pillMuted: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: colors.elevated,
  },
  pillMutedText: { color: colors.muted, fontSize: fontSize.xs, fontFamily: fontFamily.semibold },

  // Revoca
  revocaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.lg,
  },
  revocaText: { color: colors.danger, fontSize: fontSize.sm, fontFamily: fontFamily.medium },
});
