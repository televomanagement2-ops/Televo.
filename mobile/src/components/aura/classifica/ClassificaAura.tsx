// =============================================================================
// ClassificaAura — la Classifica Aura nel tab Aura della Home (M16 / AC3).
// =============================================================================
// Container a tutta altezza (pattern DropFeed/MapCanvas/LiveFeed): header
// (titolo + kebab ⋮) + FlatList col podio 2/1/3 come header, le righe dal 4°
// in giù, la caption «Si aggiorna ogni giorno» come footer (§2.4: il dato è
// GIORNALIERO, il refetch raccoglie variazioni di composizione). Stati: SWR
// via statoSchermo/VistaStato + i due stati di prodotto dedicati — «non
// listed» (opt-out reciproco, CTA di rientro) e «vuoto» (0 amici, CTA verso
// /amici). Puro JS (react-native-svg): gira anche in Expo Go — la share card
// (AC4) usa moduli nativi ma è dietro guard (import dinamici nel hook: in
// Expo Go degrada al fallback testuale senza crash).

import { useCallback, useState, type ReactNode } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApriDm } from '@/hooks/useAmici';
import { useClassificaAura, useClassificaVisibile } from '@/hooks/useClassificaAura';
import { useCondividiClassifica, type DatiCardClassifica } from '@/hooks/useCondividiClassifica';
import { useMyProfile } from '@/hooks/useProfilo';
import { PodioAura } from './PodioAura';
import { RigaClassifica } from './RigaClassifica';
import { MenuClassifica } from './MenuClassifica';
import { ShareCardClassifica } from './ShareCardClassifica';
import { StatoNonVisibile } from './StatoNonVisibile';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { VistaStato } from '@/components/ui/VistaStato';
import { avvisa } from '@/lib/dialoghi';
import { chatErrorMessage } from '@/lib/errors';
import { statoSchermo } from '@/lib/query-ui';
import { useOnline } from '@/lib/rete';
import { ROUTES, dynamicRoutes } from '@/constants/routes';
import { colors, fontFamily, fontSize, spacing } from '@/constants/theme';
import type { ClassificaAuraRigaRaw } from '@/types/supabase';

export function ClassificaAura() {
  const query = useClassificaAura();
  const online = useOnline();
  const visibile = useClassificaVisibile();
  const apriDm = useApriDm();
  const profilo = useMyProfile();
  const [menuAperto, setMenuAperto] = useState(false);

  const apriProfilo = useCallback((riga: ClassificaAuraRigaRaw) => {
    router.push(riga.is_me ? ROUTES.profilo : dynamicRoutes.profiloUtente(riga.id));
  }, []);

  // Pattern del profilo (§4): apri/crea la DM e naviga alla conversazione.
  const apriChat = useCallback(
    (userId: string) => {
      if (apriDm.isPending) return;
      apriDm.mutate(userId, {
        onSuccess: (convId) => router.push(dynamicRoutes.chat(convId)),
        onError: (e) => avvisa('Ops', chatErrorMessage(e)),
      });
    },
    [apriDm],
  );

  const cambiaVisibilita = useCallback(
    (mostra: boolean) => {
      if (visibile.isPending) return;
      visibile.mutate(mostra, {
        onError: () => avvisa('Ops', 'Impostazione non salvata, riprova.'),
      });
    },
    [visibile],
  );

  const env = query.data;
  const stato = statoSchermo(query, online);

  // Share card (AC4): il pacchetto contiene SOLO dati propri (INVARIANTE
  // §6.1) — identità dal profilo proprio, rank/score dall'envelope (`me` è
  // sticky: presente anche oltre il cap). Niente share da soli («1° su 1»).
  const me = profilo.data;
  const datiCard: DatiCardClassifica | null =
    env?.listed && env.me && (env.friends_total ?? 0) >= 2 && me?.username
      ? {
          rank: env.me.rank,
          friendsTotal: env.friends_total ?? 0,
          auraScore: env.me.aura_score,
          displayName: me.display_name,
          username: me.username,
          avatarUrl: me.avatar_url,
        }
      : null;
  const share = useCondividiClassifica(datiCard);

  // Header row della sezione: titolo + kebab ⋮ (senza back: la pagina vive nel
  // tab). Il menu resta raggiungibile anche da non-listed (switch off, §5).
  const header = (
    <View style={styles.header}>
      <Text style={styles.titolo}>Classifica Aura</Text>
      {env ? (
        <Pressable
          onPress={() => setMenuAperto(true)}
          hitSlop={10}
          style={({ pressed }) => [styles.kebab, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Opzioni classifica"
        >
          <Ionicons name="ellipsis-vertical" size={20} color={colors.ink} />
        </Pressable>
      ) : null}
    </View>
  );

  let corpo: ReactNode;
  if (stato !== 'dati' || !env) {
    corpo = (
      <VistaStato
        stato={stato === 'dati' ? 'caricamento' : stato}
        onRetry={() => void query.refetch()}
        messaggio="Classifica non disponibile, riprova."
      />
    );
  } else if (!env.listed) {
    // Cancello chiamante (§2.3): stato di prodotto, non errore.
    corpo = <StatoNonVisibile onRientra={() => cambiaVisibilita(true)} inCorso={visibile.isPending} />;
  } else if (!env.rows) {
    // Transitorio post-rientro: `listed` è già true (ottimistico) ma l'envelope
    // in cache è quello corto — le righe arrivano col refetch in volo.
    corpo = <LoadingSpinner style={styles.flex} />;
  } else if (env.rows.length <= 1) {
    // §10.1: solo io in classifica — lo share non esiste, la CTA porta agli amici.
    corpo = (
      <View style={styles.vuoto}>
        <Ionicons name="people-outline" size={44} color={colors.muted} />
        <Text style={styles.vuotoTitolo}>La classifica Aura si accende con gli amici</Text>
        <Text style={styles.vuotoTesto}>
          Aggiungi i tuoi amici veri: la classifica è solo tra di voi.
        </Text>
        <View style={styles.vuotoCta}>
          <Button label="Trova i tuoi amici" onPress={() => router.push(ROUTES.amici)} />
        </View>
      </View>
    );
  } else {
    const rows = env.rows;
    corpo = (
      <FlatList
        data={rows.slice(3)}
        keyExtractor={(r) => r.id}
        renderItem={({ item }) => (
          <RigaClassifica
            riga={item}
            onApriProfilo={apriProfilo}
            onApriChat={apriChat}
            chatInApertura={apriDm.isPending && apriDm.variables === item.id}
            onCondividi={datiCard ? share.condividi : null}
            condivisioneInCorso={share.inCorso}
          />
        )}
        ListHeaderComponent={
          <View>
            <PodioAura
              primi={rows.slice(0, 3)}
              onApriProfilo={apriProfilo}
              onCondividi={datiCard ? share.condividi : null}
              condivisioneInCorso={share.inCorso}
            />
            <View style={styles.separatore} />
          </View>
        }
        ListFooterComponent={<Text style={styles.caption}>Si aggiorna ogni giorno</Text>}
        contentContainerStyle={styles.lista}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() => void query.refetch()}
            tintColor={colors.accent}
          />
        }
      />
    );
  }

  return (
    <View style={styles.flex}>
      {header}
      {corpo}
      {env ? (
        <MenuClassifica
          visible={menuAperto}
          onClose={() => setMenuAperto(false)}
          listed={env.listed}
          onCambia={cambiaVisibilita}
          inCorso={visibile.isPending}
          onCondividi={share.condividi}
          shareAbilitato={!!datiCard && !share.inCorso}
        />
      ) : null}
      {/* La card off-screen esiste SOLO durante la cattura (AC4, §6.2). */}
      {share.montaCard && datiCard ? (
        <ShareCardClassifica dati={datiCard} cardRef={share.cardRef} onPronta={share.onCardPronta} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  titolo: { color: colors.ink, fontSize: fontSize.lg, fontFamily: fontFamily.semibold },
  kebab: { padding: spacing.xs },
  pressed: { opacity: 0.7 },
  separatore: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  lista: { paddingHorizontal: spacing.sm, paddingBottom: 110, gap: 2 },
  caption: {
    color: colors.faint,
    fontSize: fontSize.xs,
    fontFamily: fontFamily.sans,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
  vuoto: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  vuotoTitolo: {
    color: colors.ink,
    fontSize: fontSize.lg,
    fontFamily: fontFamily.semibold,
    textAlign: 'center',
  },
  vuotoTesto: {
    color: colors.muted,
    fontSize: fontSize.sm,
    fontFamily: fontFamily.sans,
    textAlign: 'center',
    lineHeight: 20,
  },
  vuotoCta: { marginTop: spacing.md, alignSelf: 'stretch' },
});
