// =============================================================================
// Posizione e mappa — kill-switch master + stato sessione (M7 / MM6).
// =============================================================================
// Il cancello MASTER della Mappa della Città: profiles.share_location. OFF fa
// SPARIRE subito dalla mappa (il trigger DB cancella presenza + eventi live) e
// azzera la sessione locale. ON riabilita (e registra il consenso 'location'):
// la sessione vera si accende poi col gesto sulla mappa. Qui vive anche lo stato
// "sei visibile ancora Xh" con "Spegni ora": è l'unica superficie di controllo
// raggiungibile ANCHE in Expo Go (dove la mappa MapLibre non gira).

import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/components/ui/Button';
import { VistaStato } from '@/components/ui/VistaStato';
import { useMyProfile } from '@/hooks/useProfilo';
import { useCondivisionePosizione } from '@/hooks/useCondivisionePosizione';
import { useSafeZones, type SafeZone } from '@/hooks/useSafeZones';
import { sessioneAttiva } from '@/store/mapStore';
import { residuoCompatto } from '@/lib/datetime';
import { avvisa, conferma } from '@/lib/dialoghi';
import { mapErrorMessage } from '@/lib/errors';
import { statoSchermo } from '@/lib/query-ui';
import { useOnline } from '@/lib/rete';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';

export default function ImpostazioniPosizione() {
  const router = useRouter();
  const profilo = useMyProfile();
  const online = useOnline();
  const stato = statoSchermo(profilo, online);
  const { sessione, impostaMaster, spegni } = useCondivisionePosizione();
  const safeZones = useSafeZones();

  // Override ottimistico locale del master (mentre la mutazione è in volo).
  const [override, setOverride] = useState<boolean | null>(null);
  const master = override ?? profilo.data?.share_location ?? false;

  // Tick per il countdown della sessione attiva.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const attiva = sessioneAttiva(sessione, Date.now());

  const applica = (on: boolean) => {
    setOverride(on);
    impostaMaster.mutate(on, {
      onSuccess: () => setOverride(null),
      onError: (e) => {
        setOverride(null);
        avvisa('Ops', mapErrorMessage(e));
      },
    });
  };

  const toggle = (on: boolean) => {
    if (on) {
      applica(true);
      return;
    }
    conferma({
      titolo: 'Disattiva la mappa',
      messaggio:
        'Sparisci subito dalla Mappa della Città e la tua Aura si spegne. Potrai riattivarla quando vuoi.',
      confermaLabel: 'Disattiva',
      distruttiva: true,
      onConferma: () => applica(false),
    });
  };

  const spegniOra = () =>
    spegni.mutate(undefined, { onError: (e) => avvisa('Ops', mapErrorMessage(e)) });

  const eliminaZona = (z: SafeZone) =>
    conferma({
      titolo: 'Elimina zona',
      messaggio: `Rimuovere «${z.label}»? Dal prossimo aggiornamento tornerai visibile nel punto esatto quando sei lì.`,
      confermaLabel: 'Elimina',
      distruttiva: true,
      onConferma: () =>
        safeZones.elimina.mutate(z.id, { onError: (e) => avvisa('Ops', mapErrorMessage(e)) }),
    });

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>
        <Text style={styles.title}>Posizione e mappa</Text>
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
          {/* Stato sessione: visibile solo se accesa (anche in Expo Go). */}
          {attiva && sessione ? (
            <View style={styles.statoCard}>
              <View style={styles.statoRiga}>
                <View style={styles.dot} />
                <Text style={styles.statoTitolo}>La tua Aura è accesa</Text>
              </View>
              <Text style={styles.statoSub}>
                Sei visibile ai tuoi amici ancora {residuoCompatto(sessione.sharingUntil)}.
              </Text>
              <Button
                label={spegni.isPending ? 'Spengo…' : 'Spegni ora'}
                variant="secondary"
                onPress={spegniOra}
              />
            </View>
          ) : null}

          <Text style={styles.sezione}>Mappa della Città</Text>
          <View style={styles.gruppo}>
            <View style={styles.riga}>
              <View style={styles.rigaTesto}>
                <Text style={styles.rigaTitolo}>Condivisione posizione</Text>
                <Text style={styles.rigaSottotitolo}>
                  Il cancello principale della mappa. Se è spento non appari mai, in nessuno stato.
                  Con esso acceso, accendi la tua Aura dal gesto sulla mappa, per il tempo che vuoi.
                </Text>
              </View>
              <Switch
                value={master}
                onValueChange={toggle}
                disabled={impostaMaster.isPending}
                trackColor={{ false: colors.elevated, true: colors.accent }}
                thumbColor="#ffffff"
              />
            </View>
          </View>

          <Text style={styles.nota}>
            La tua posizione è visibile SOLO agli amici reciproci, mai agli sconosciuti. È esatta di
            default; spegnendo la condivisione sparisci all’istante, senza lasciare un «visto poco
            fa».
          </Text>

          {/* Zone sicure (MM9): lista + elimina. La CREAZIONE avviene sulla mappa
              (long-press → editor): qui si gestiscono quelle esistenti. */}
          <Text style={styles.sezione}>Zone sicure</Text>
          {safeZones.isLoading ? (
            <View style={styles.gruppo}>
              <Text style={styles.zoneInfo}>Carico le tue zone…</Text>
            </View>
          ) : safeZones.isError ? (
            <View style={[styles.gruppo, styles.zoneErrore]}>
              <Text style={styles.zoneErroreText}>Non riesco a caricare le zone.</Text>
              <Button label="Riprova" variant="secondary" onPress={() => void safeZones.refetch()} />
            </View>
          ) : safeZones.zones.length === 0 ? (
            <View style={styles.gruppo}>
              <Text style={styles.zoneInfo}>
                Non hai ancora zone sicure. Creane una con un tocco prolungato sulla mappa.
              </Text>
            </View>
          ) : (
            <View style={styles.gruppo}>
              {safeZones.zones.map((z, i) => (
                <View key={z.id} style={[styles.riga, i > 0 && styles.rigaDivisa]}>
                  <Ionicons name="shield-half-outline" size={20} color={colors.accentSoft} />
                  <View style={styles.rigaTesto}>
                    <Text style={styles.rigaTitolo}>{z.label}</Text>
                    <Text style={styles.rigaSottotitolo}>Raggio · {z.radiusM} m</Text>
                  </View>
                  <Pressable
                    onPress={() => eliminaZona(z)}
                    hitSlop={12}
                    disabled={safeZones.elimina.isPending}
                    accessibilityRole="button"
                    accessibilityLabel={`Elimina la zona ${z.label}`}
                  >
                    <Ionicons name="trash-outline" size={20} color={colors.danger} />
                  </Pressable>
                </View>
              ))}
            </View>
          )}
          <Text style={styles.nota}>
            Dentro una zona sicura appari come «In zona · nome», mai nel punto esatto — utile per casa
            o lavoro. Puoi averne al massimo 2; le crei con un tocco prolungato sulla mappa.
          </Text>
        </ScrollView>
      )}
    </SafeAreaView>
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
  body: { paddingHorizontal: spacing.lg, gap: spacing.md, paddingBottom: spacing['3xl'] },

  statoCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.4)',
    padding: spacing.lg,
    gap: spacing.sm,
  },
  statoRiga: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent },
  statoTitolo: { color: colors.ink, fontSize: fontSize.base, fontFamily: fontFamily.semibold },
  statoSub: { color: colors.muted, fontSize: fontSize.sm, fontFamily: fontFamily.sans, lineHeight: 19 },

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
  rigaDivisa: { borderTopWidth: 1, borderTopColor: colors.border },
  zoneInfo: {
    color: colors.muted,
    fontSize: fontSize.sm,
    fontFamily: fontFamily.sans,
    lineHeight: 20,
    padding: spacing.lg,
  },
  zoneErrore: { padding: spacing.lg, gap: spacing.md },
  zoneErroreText: { color: colors.muted, fontSize: fontSize.sm, fontFamily: fontFamily.sans, lineHeight: 20 },
  rigaTesto: { flex: 1, gap: 2 },
  rigaTitolo: { color: colors.ink, fontSize: fontSize.base, fontFamily: fontFamily.semibold },
  rigaSottotitolo: {
    color: colors.muted,
    fontSize: fontSize.xs,
    fontFamily: fontFamily.sans,
    lineHeight: 16,
  },
  nota: {
    color: colors.faint,
    fontSize: fontSize.xs,
    fontFamily: fontFamily.sans,
    lineHeight: 17,
    paddingHorizontal: spacing.xs,
  },
});
