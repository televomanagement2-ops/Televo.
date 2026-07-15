// =============================================================================
// LiveComposerSurface — composer camera-first della Live (M12 / LM6, §3).
// =============================================================================
// Fotocamera a schermo intero (preview dalla traccia LOCALE LiveKit, nessuna
// dipendenza expo-camera in più), riga compatta di toggle, titolo obbligatorio
// (1–80), "Avvia Live". Permessi camera+microfono richiesti ALL'INGRESSO: se
// negati, stato spiegato + Linking.openSettings (pattern CM7).
//
// Un proprietario per risorsa: la traccia di preview appartiene a QUESTO
// schermo e viene fermata prima di navigare — lo schermo live (/live/[id])
// riacquisisce la camera da host (gap impercettibile, pattern LM5).
// Caricato SOLO via lazy dalla rotta (mai valutato in Expo Go).

import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { createLocalVideoTrack, type LocalVideoTrack } from 'livekit-client';
// VideoView (deprecato a favore di VideoTrack) è l'UNICO renderer che accetta
// una traccia locale NON pubblicata: qui non c'è ancora stanza né publication.
import { VideoView } from '@livekit/react-native';
import { useKeepAwake } from 'expo-keep-awake';
import { Button } from '@/components/ui/Button';
import {
  ComposerToggles,
  IMPOSTAZIONI_LIVE_DEFAULT,
  type ImpostazioniLive,
} from '@/components/live/ComposerToggles';
import { CoHostSheet } from '@/components/live/CoHostSheet';
import { useAuth } from '@/hooks/useAuth';
import { authErrorCode } from '@/lib/auth';
import { richiediPermessoMic } from '@/lib/audio';
import { avvisa } from '@/lib/dialoghi';
import { liveErrorMessage } from '@/lib/errors';
import { avviaLive, invitaCoHost } from '@/lib/live';
import { inizializzaLiveKit } from '@/lib/livekit';
import { supabase } from '@/lib/supabase';
import { dynamicRoutes } from '@/constants/routes';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';

const MAX_TITOLO = 80;

type Permessi = 'in_verifica' | 'ok' | 'negati';

export default function LiveComposerSurface() {
  // M14/V3: la preview camera pre-live tiene lo schermo acceso come lo schermo
  // live che segue (unmount = timeout di sistema ripristinato).
  useKeepAwake();

  const { uid } = useAuth();

  const [permessi, setPermessi] = useState<Permessi>('in_verifica');
  const [track, setTrack] = useState<LocalVideoTrack | null>(null);
  const [frontale, setFrontale] = useState(true);
  const [titolo, setTitolo] = useState('');
  const [impostazioni, setImpostazioni] = useState<ImpostazioniLive>(IMPOSTAZIONI_LIVE_DEFAULT);
  const [coHostIds, setCoHostIds] = useState<string[]>([]);
  const [sheetCoLive, setSheetCoLive] = useState(false);
  const [inAvvio, setInAvvio] = useState(false);
  const trackRef = useRef<LocalVideoTrack | null>(null);
  const inVoloRef = useRef(false);

  // Permessi OS all'ingresso (§3) e preview camera dalla traccia locale.
  useEffect(() => {
    let vivo = true;
    void (async () => {
      const cam = await ImagePicker.requestCameraPermissionsAsync();
      const mic = await richiediPermessoMic();
      if (!vivo) return;
      if (!cam.granted || !mic) {
        setPermessi('negati');
        return;
      }
      setPermessi('ok');
      try {
        await inizializzaLiveKit();
        const t = await createLocalVideoTrack({ facingMode: 'user' });
        if (!vivo) {
          t.stop();
          return;
        }
        trackRef.current = t;
        setTrack(t);
      } catch {
        if (vivo) setPermessi('negati'); // camera occupata/negata a livello WebRTC
      }
    })();
    return () => {
      vivo = false;
      trackRef.current?.stop();
      trackRef.current = null;
    };
  }, []);

  const flip = async () => {
    const t = trackRef.current;
    if (!t) return;
    const nuovo = !frontale;
    try {
      await t.restartTrack({ facingMode: nuovo ? 'user' : 'environment' });
      setFrontale(nuovo);
    } catch {
      // dispositivo senza seconda camera: si resta dove si è
    }
  };

  /** L'unica live attiva per host è un vincolo DB (§2): se esiste già, si
   *  RIENTRA in quella invece di fallire (es. crash di un avvio precedente). */
  const vaiAllaLiveAttiva = async (): Promise<boolean> => {
    if (!uid) return false;
    const { data } = await supabase
      .from('lives')
      .select('id')
      .eq('host_id', uid)
      .is('ended_at', null)
      .maybeSingle();
    const riga = data as { id: string } | null;
    if (!riga?.id) return false;
    trackRef.current?.stop();
    trackRef.current = null;
    router.replace(dynamicRoutes.live(riga.id));
    return true;
  };

  const avvia = async () => {
    const t = titolo.trim();
    if (!t || inVoloRef.current) return;
    inVoloRef.current = true;
    setInAvvio(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      const creata = await avviaLive({
        titolo: t,
        visibility: impostazioni.visibility,
        commentiAbilitati: impostazioni.commenti,
        mostraSullaMappa: impostazioni.mappa,
        notifica: impostazioni.notifica,
      });

      // Inviti Co-Live (best-effort, la live è già partita): un invito fallito
      // non blocca l'avvio, si potrà rifare dallo schermo live.
      if (impostazioni.coLive) {
        for (const id of coHostIds) {
          try {
            await invitaCoHost(creata.live_id, id);
          } catch {
            // tetto raggiunto/amico non più valido: silenzioso, gestibile dopo
          }
        }
      }

      // La preview si ferma PRIMA di navigare: la camera passa allo schermo live.
      trackRef.current?.stop();
      trackRef.current = null;
      router.replace(dynamicRoutes.live(creata.live_id));

      // Hint mappa (§12.12): voleva il badge ma non c'è sessione posizione.
      if (impostazioni.mappa && !creata.map_attached) {
        avvisa(
          'Live avviata, ma non sei sulla mappa',
          'Attiva la condivisione della posizione per far comparire il badge LIVE sulla Mappa della Città.',
        );
      }
    } catch (e) {
      if (authErrorCode(e) === 'live_already_active') {
        const rientrato = await vaiAllaLiveAttiva();
        if (!rientrato) avvisa('Ops', liveErrorMessage(e));
      } else {
        avvisa('Ops', liveErrorMessage(e));
      }
      inVoloRef.current = false;
      setInAvvio(false);
    }
  };

  // --- Permessi negati: stato spiegato + impostazioni (CM7) --------------------
  if (permessi === 'negati') {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <Header />
        <View style={styles.centrato}>
          <Ionicons name="videocam-off-outline" size={40} color={colors.faint} />
          <Text style={styles.permTitolo}>Serve la fotocamera</Text>
          <Text style={styles.permSub}>
            Per andare in diretta consenti fotocamera e microfono nelle impostazioni.
          </Text>
          <Button label="Apri impostazioni" onPress={() => void Linking.openSettings()} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {/* Preview a schermo intero (traccia locale, non ancora pubblicata). */}
      <View style={styles.preview}>
        {track ? (
          <VideoView videoTrack={track} style={styles.video} objectFit="cover" mirror={frontale} />
        ) : (
          <View style={styles.attesa}>
            <ActivityIndicator color={colors.accent} />
          </View>
        )}
      </View>

      <Header
        destra={
          <Pressable onPress={() => void flip()} hitSlop={8} style={styles.headerBtn}>
            <Ionicons name="camera-reverse-outline" size={26} color={colors.ink} />
          </Pressable>
        }
      />

      {/* Piede sopra la preview: titolo → toggle → Avvia (camera-first, §3). */}
      <View style={styles.piede} pointerEvents="box-none">
        <View style={styles.titoloWrap}>
          <TextInput
            value={titolo}
            onChangeText={setTitolo}
            placeholder="Di cosa parla la tua live?"
            placeholderTextColor={colors.faint}
            selectionColor={colors.accent}
            style={styles.titoloInput}
            maxLength={MAX_TITOLO}
          />
        </View>

        <ComposerToggles
          valore={impostazioni}
          onChange={setImpostazioni}
          onCoLiveOn={() => setSheetCoLive(true)}
          coHostSelezionati={coHostIds.length}
        />

        <View style={styles.avviaWrap}>
          <Pressable
            onPress={() => void avvia()}
            disabled={!titolo.trim() || inAvvio}
            style={[styles.avvia, (!titolo.trim() || inAvvio) && styles.avviaOff]}
          >
            {inAvvio ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <>
                <View style={styles.puntinoLive} />
                <Text style={styles.avviaTesto}>Avvia Live</Text>
              </>
            )}
          </Pressable>
        </View>
      </View>

      <CoHostSheet
        mode="selezione"
        visible={sheetCoLive}
        onClose={() => {
          setSheetCoLive(false);
          // Sheet chiuso senza nessuno: il toggle torna Off (stato onesto).
          if (coHostIds.length === 0) setImpostazioni((i) => ({ ...i, coLive: false }));
        }}
        selectedIds={coHostIds}
        onChange={setCoHostIds}
      />
    </SafeAreaView>
  );
}

function Header({ destra }: { destra?: React.ReactNode }) {
  return (
    <View style={styles.header} pointerEvents="box-none">
      <Pressable onPress={() => router.back()} hitSlop={8} style={styles.headerBtn}>
        <Ionicons name="close" size={28} color={colors.ink} />
      </Pressable>
      <Text style={styles.headerTitle}>Nuova live</Text>
      {destra ?? <View style={styles.headerBtn} />}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.base },
  preview: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.base },
  video: { flex: 1 },
  attesa: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  headerBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  headerTitle: { color: colors.ink, fontSize: fontSize.lg, fontFamily: fontFamily.semibold },

  piede: { flex: 1, justifyContent: 'flex-end', gap: spacing.md, paddingBottom: spacing.md },
  titoloWrap: { paddingHorizontal: spacing.lg },
  titoloInput: {
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    color: colors.ink,
    fontSize: fontSize.base,
    fontFamily: fontFamily.medium,
  },
  avviaWrap: { paddingHorizontal: spacing.lg },
  avvia: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.danger,
    borderRadius: radius.full,
    paddingVertical: spacing.md,
  },
  avviaOff: { opacity: 0.5 },
  avviaTesto: { color: '#ffffff', fontSize: fontSize.base, fontFamily: fontFamily.semibold },
  puntinoLive: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#ffffff' },

  centrato: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  permTitolo: { color: colors.ink, fontSize: fontSize.lg, fontFamily: fontFamily.semibold },
  permSub: {
    color: colors.muted,
    fontSize: fontSize.sm,
    fontFamily: fontFamily.sans,
    textAlign: 'center',
    lineHeight: 20,
  },
});
