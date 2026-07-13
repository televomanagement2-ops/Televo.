// =============================================================================
// Impostazioni chat — S10 (CM3): i toggle privacy che governano presenza e spunte.
// =============================================================================
// Due preferenze su `profiles` (grant update per-colonna): "Ultimo accesso"
// (show_last_seen) e "Spunte di lettura" (show_read_receipts). Reciprocità R-03
// stile WhatsApp, applicata server-side per la presenza (get_peer_presence) e
// client-side per le spunte (§6.4): chi nasconde non vede quello degli altri.
// Toggle ottimistici: flip immediato, rollback con avviso se il server rifiuta.

import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { Avatar } from '@/components/ui/Avatar';
import { VistaStato } from '@/components/ui/VistaStato';
import { useMyProfile, useUpdateProfile } from '@/hooks/useProfilo';
import { useAzioniAmicizia, useBloccati } from '@/hooks/useAmici';
import { presenzaPrefix } from '@/hooks/usePresenza';
import { avvisa, conferma } from '@/lib/dialoghi';
import { chatErrorMessage } from '@/lib/errors';
import { statoSchermo } from '@/lib/query-ui';
import { useOnline } from '@/lib/rete';
import { dynamicRoutes } from '@/constants/routes';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';
import type { ProfileCard } from '@/types';

type ToggleField = 'show_last_seen' | 'show_read_receipts';

export default function ImpostazioniChat() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const profilo = useMyProfile();
  const online = useOnline();
  const stato = statoSchermo(profilo, online);
  const update = useUpdateProfile();
  const bloccati = useBloccati();
  const azioni = useAzioniAmicizia();

  const sblocca = (utente: ProfileCard) =>
    conferma({
      titolo: 'Sblocca utente',
      messaggio: `${utente.displayName || utente.username} potrà di nuovo scriverti e trovarti.`,
      confermaLabel: 'Sblocca',
      onConferma: () =>
        azioni.sblocca.mutate(utente.id, { onError: (e) => avvisa('Ops', chatErrorMessage(e)) }),
    });

  // Override ottimistico locale: presente solo mentre la mutazione è in volo
  // (successo → il profilo rivalidato prende il valore; errore → rollback).
  const [override, setOverride] = useState<Partial<Record<ToggleField, boolean>>>({});

  const valore = (campo: ToggleField): boolean =>
    override[campo] ?? profilo.data?.[campo] ?? true;

  const toggle = (campo: ToggleField, on: boolean) => {
    setOverride((o) => ({ ...o, [campo]: on }));
    const pulisci = () =>
      setOverride((o) => {
        const next = { ...o };
        delete next[campo];
        return next;
      });
    update.mutate(
      { [campo]: on },
      {
        onSuccess: () => {
          pulisci();
          // Le viste che dipendono dai toggle: presenza (header DM) e spunte.
          void queryClient.invalidateQueries({ queryKey: presenzaPrefix });
          void queryClient.invalidateQueries({ queryKey: ['chat', 'header'] });
        },
        onError: (e) => {
          pulisci(); // rollback: torna al valore del server
          avvisa('Ops', chatErrorMessage(e));
        },
      },
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>
        <Text style={styles.title}>Impostazioni chat</Text>
      </View>

      {stato !== 'dati' ? (
        <VistaStato
          stato={stato}
          messaggio="Non riesco a caricare le impostazioni."
          etichettaCaricamento="Carico le impostazioni…"
          onRetry={() => void profilo.refetch()}
          style={styles.flex}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <Text style={styles.sezione}>Privacy</Text>

          <View style={styles.gruppo}>
            <RigaToggle
              titolo="Ultimo accesso"
              sottotitolo="Mostra agli altri quando sei stato online. Se lo disattivi, non vedrai il loro ultimo accesso."
              value={valore('show_last_seen')}
              onValueChange={(v) => toggle('show_last_seen', v)}
            />
            <View style={styles.divisore} />
            <RigaToggle
              titolo="Spunte di lettura"
              sottotitolo="Conferma quando leggi i messaggi (✓✓). Se le disattivi, non vedrai le conferme degli altri."
              value={valore('show_read_receipts')}
              onValueChange={(v) => toggle('show_read_receipts', v)}
            />
          </View>

          <Text style={styles.nota}>
            Vale nei due sensi: nascondere una cosa significa non vederla più negli
            altri. La tua attività resta visibile solo ad amici e persone con cui
            hai una chat.
          </Text>

          {/* Utenti bloccati (S10, CM8): sblocco con conferma dark. */}
          <Text style={styles.sezione}>Utenti bloccati</Text>
          {bloccati.isLoading ? (
            <ActivityIndicator color={colors.muted} style={{ marginTop: spacing.md }} />
          ) : (bloccati.data?.length ?? 0) === 0 ? (
            <Text style={styles.nota}>Nessun utente bloccato.</Text>
          ) : (
            <View style={styles.gruppo}>
              {bloccati.data!.map((u, i) => (
                <View key={u.id}>
                  {i > 0 ? <View style={styles.divisore} /> : null}
                  <Pressable
                    style={styles.riga}
                    onPress={() => router.push(dynamicRoutes.profiloUtente(u.id))}
                  >
                    <Avatar uri={u.avatarUrl} name={u.username} size={40} />
                    <View style={styles.rigaTesto}>
                      <Text style={styles.rigaTitolo} numberOfLines={1}>
                        {u.displayName || u.username}
                      </Text>
                      <Text style={styles.rigaSottotitolo}>@{u.username}</Text>
                    </View>
                    <Pressable
                      style={({ pressed }) => [styles.sbloccaBtn, pressed && { opacity: 0.7 }]}
                      onPress={() => sblocca(u)}
                      disabled={azioni.sblocca.isPending && azioni.sblocca.variables === u.id}
                    >
                      <Text style={styles.sbloccaText}>
                        {azioni.sblocca.isPending && azioni.sblocca.variables === u.id
                          ? 'Sblocco…'
                          : 'Sblocca'}
                      </Text>
                    </Pressable>
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// --- Riga con Switch ----------------------------------------------------------

function RigaToggle({
  titolo,
  sottotitolo,
  value,
  onValueChange,
}: {
  titolo: string;
  sottotitolo: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.riga}>
      <View style={styles.rigaTesto}>
        <Text style={styles.rigaTitolo}>{titolo}</Text>
        <Text style={styles.rigaSottotitolo}>{sottotitolo}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.elevated, true: colors.accent }}
        thumbColor="#ffffff"
      />
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
  body: { paddingHorizontal: spacing.lg, gap: spacing.md },
  sezione: {
    color: colors.muted,
    fontSize: fontSize.xs,
    fontFamily: fontFamily.semibold,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: spacing.sm,
  },
  gruppo: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  riga: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  rigaTesto: { flex: 1, gap: 2 },
  rigaTitolo: { color: colors.ink, fontSize: fontSize.base, fontFamily: fontFamily.semibold },
  rigaSottotitolo: {
    color: colors.muted,
    fontSize: fontSize.xs,
    fontFamily: fontFamily.sans,
    lineHeight: 16,
  },
  divisore: { height: 1, backgroundColor: colors.border, marginLeft: spacing.lg },
  nota: {
    color: colors.faint,
    fontSize: fontSize.xs,
    fontFamily: fontFamily.sans,
    lineHeight: 17,
    paddingHorizontal: spacing.xs,
  },
  sbloccaBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
  },
  sbloccaText: { color: colors.accentSoft, fontSize: fontSize.xs, fontFamily: fontFamily.semibold },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  vuoto: {
    color: colors.muted,
    fontSize: fontSize.sm,
    fontFamily: fontFamily.sans,
    textAlign: 'center',
  },
});
