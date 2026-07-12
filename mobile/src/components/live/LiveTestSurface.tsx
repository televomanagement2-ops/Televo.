// =============================================================================
// LiveTestSurface — banco di prova delle fondamenta LiveKit (M12 / LM5).
// =============================================================================
// TEMPORANEO (sostituito dagli schermi veri in LM6). Valida su device le tre
// gambe di LM5, nell'ordine del "Done when" del piano (live.md §18/LM5):
//  1. SDK: registerGlobals + connessione a una stanza reale + video locale;
//  2. strato dati: create_live (notifica 'none': la prova NON spamma gli
//     amici) → token Edge (mint=join) → end_live;
//  3. inbox realtime: gli eventi live_* di un SECONDO device amico compaiono
//     nell'elenco sotto (riflessi nel liveStore, che è ciò che si testa).
// Caricato SOLO via lazy dalla rotta /live/test (mai valutato in Expo Go).

import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AudioSession, VideoTrack } from '@livekit/react-native';
import { Room, Track } from 'livekit-client';
import type { LocalTrackPublication } from 'livekit-client';
import { useAuth } from '@/hooks/useAuth';
import { authErrorCode } from '@/lib/auth';
import { liveErrorMessage } from '@/lib/errors';
import { avviaLive, fetchTokenLive, terminaLive } from '@/lib/live';
import { inizializzaLiveKit } from '@/lib/livekit';
import { subscribeMapInbox } from '@/lib/map-realtime';
import { supabase } from '@/lib/supabase';
import { useLiveStore } from '@/store/liveStore';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';

type Fase = 'bootstrap' | 'pronto' | 'avvio' | 'in_onda' | 'chiusura';

export default function LiveTestSurface() {
  const { session } = useAuth();
  const uid = session?.user.id;

  const [fase, setFase] = useState<Fase>('bootstrap');
  const [errore, setErrore] = useState<string | null>(null);
  const [camPub, setCamPub] = useState<LocalTrackPublication | null>(null);
  const roomRef = useRef<Room | null>(null);
  const liveIdRef = useRef<string | null>(null);

  // Store: le live degli amici arrivate dai delta inbox (test della gamba 3).
  const lives = useLiveStore((s) => s.lives);
  const ordine = useLiveStore((s) => s.ordine);
  const liveAmici = ordine.map((id) => lives[id]).filter((l) => !!l);

  // 1) Bootstrap del runtime nativo (registerGlobals, idempotente).
  useEffect(() => {
    let attivo = true;
    inizializzaLiveKit()
      .then((ok) => {
        if (attivo) setFase(ok ? 'pronto' : 'bootstrap');
      })
      .catch((e) => {
        if (attivo) setErrore(liveErrorMessage(e));
      });
    return () => {
      attivo = false;
    };
  }, []);

  // 3) Inbox realtime → liveStore: la stessa registrazione che farà l'hook del
  // feed in LM7 (un solo canale, handler live_* accanto a quelli mappa).
  useEffect(() => {
    if (!uid) return;
    return subscribeMapInbox(uid, {
      onLiveStarted: (p) => useLiveStore.getState().applicaLiveStarted(p),
      onLiveStatus: (p) => useLiveStore.getState().applicaLiveStatus(p),
      onLiveEnded: (p) => useLiveStore.getState().rimuoviLive(p.live_id),
    });
  }, [uid]);

  // Teardown all'unmount: la prova non lascia live orfane (best-effort: le
  // reti di sicurezza server — webhook + cron — coprono comunque).
  useEffect(() => {
    return () => {
      if (liveIdRef.current) void terminaLive(liveIdRef.current).catch(() => {});
      void roomRef.current?.disconnect();
      void AudioSession.stopAudioSession();
      useLiveStore.getState().resetDatiLive();
    };
  }, []);

  /** Chiude un'eventuale live di prova rimasta attiva (crash di un giro
   *  precedente): la propria live attiva è leggibile via RLS. */
  async function bonificaLiveOrfana(): Promise<void> {
    if (!uid) return;
    const { data } = await supabase
      .from('lives')
      .select('id')
      .eq('host_id', uid)
      .is('ended_at', null)
      .maybeSingle();
    const riga = data as { id: string } | null;
    if (riga?.id) await terminaLive(riga.id);
  }

  async function avvia() {
    setErrore(null);
    setFase('avvio');
    try {
      // 2) Strato dati: create_live SENZA notifiche né mappa (è una prova).
      let creata;
      try {
        creata = await avviaLive({ titolo: 'Prova tecnica LM5', notifica: 'none' });
      } catch (e) {
        if (authErrorCode(e) !== 'live_already_active') throw e;
        await bonificaLiveOrfana(); // giro precedente crashato: chiudi e riprova
        creata = await avviaLive({ titolo: 'Prova tecnica LM5', notifica: 'none' });
      }
      liveIdRef.current = creata.live_id;

      const token = await fetchTokenLive(creata.live_id);

      // 1) SDK: sessione audio, connessione, camera locale (mic spento: la
      // prova valida il video; l'audio vero arriva con gli schermi LM6).
      await AudioSession.startAudioSession();
      const room = new Room();
      roomRef.current = room;
      await room.connect(token.wsUrl, token.token);
      await room.localParticipant.setCameraEnabled(true);
      setCamPub(room.localParticipant.getTrackPublication(Track.Source.Camera) ?? null);
      setFase('in_onda');
    } catch (e) {
      setErrore(liveErrorMessage(e));
      await chiudi(true);
    }
  }

  async function chiudi(silenzioso = false) {
    if (!silenzioso) setFase('chiusura');
    setCamPub(null);
    const liveId = liveIdRef.current;
    liveIdRef.current = null;
    try {
      if (liveId) await terminaLive(liveId);
    } catch {
      // best-effort: webhook room_finished / cron chiudono comunque
    }
    await roomRef.current?.disconnect();
    roomRef.current = null;
    await AudioSession.stopAudioSession();
    setFase('pronto');
  }

  const room = roomRef.current;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.contenuto}>
      <Text style={styles.titolo}>Prova tecnica Live (LM5)</Text>
      <Text style={styles.sub}>
        Schermo temporaneo: valida SDK, token e inbox realtime. Gli schermi veri arrivano con LM6.
      </Text>

      {/* Gamba 1+2: stanza di prova con video locale */}
      <View style={styles.riquadroVideo}>
        {fase === 'in_onda' && room && camPub ? (
          <VideoTrack
            trackRef={{
              participant: room.localParticipant,
              publication: camPub,
              source: Track.Source.Camera,
            }}
            style={styles.video}
            objectFit="cover"
          />
        ) : (
          <View style={styles.videoPlaceholder}>
            {fase === 'avvio' || fase === 'chiusura' ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <Text style={styles.placeholderText}>
                {fase === 'bootstrap' ? 'Preparo il runtime…' : 'Nessuna stanza attiva'}
              </Text>
            )}
          </View>
        )}
      </View>

      {fase === 'pronto' && (
        <Pressable style={styles.bottone} onPress={() => void avvia()}>
          <Text style={styles.bottoneTesto}>Avvia stanza di prova</Text>
        </Pressable>
      )}
      {fase === 'in_onda' && (
        <Pressable style={[styles.bottone, styles.bottoneStop]} onPress={() => void chiudi()}>
          <Text style={styles.bottoneTesto}>Termina la prova</Text>
        </Pressable>
      )}

      {errore ? <Text style={styles.errore}>{errore}</Text> : null}

      {/* Gamba 3: delta inbox → liveStore (serve un secondo device amico) */}
      <Text style={styles.sezione}>Amici in live (delta inbox → store)</Text>
      {liveAmici.length === 0 ? (
        <Text style={styles.vuoto}>
          Nessun evento ricevuto. Avvia una live da un secondo device (account amico): deve
          comparire qui senza refresh.
        </Text>
      ) : (
        liveAmici.map((l) => (
          <View key={l.liveId} style={styles.rigaLive}>
            <Text style={styles.rigaTitolo}>
              {l.host.displayName ?? l.host.username} — {l.title}
            </Text>
            <Text style={styles.rigaMeta}>
              {l.status === 'paused' ? 'in pausa' : 'in onda'} ·{' '}
              {new Date(l.startedAt).toLocaleTimeString()}
            </Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.base },
  contenuto: { padding: spacing.lg, gap: spacing.md },
  titolo: { color: colors.ink, fontSize: fontSize.xl, fontFamily: fontFamily.semibold },
  sub: { color: colors.muted, fontSize: fontSize.sm, fontFamily: fontFamily.sans },
  riquadroVideo: {
    height: 320,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  video: { flex: 1 },
  videoPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  placeholderText: { color: colors.faint, fontSize: fontSize.sm, fontFamily: fontFamily.sans },
  bottone: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  bottoneStop: { backgroundColor: colors.danger },
  bottoneTesto: { color: colors.ink, fontSize: fontSize.base, fontFamily: fontFamily.semibold },
  errore: { color: colors.danger, fontSize: fontSize.sm, fontFamily: fontFamily.sans },
  sezione: {
    color: colors.ink,
    fontSize: fontSize.base,
    fontFamily: fontFamily.semibold,
    marginTop: spacing.md,
  },
  vuoto: { color: colors.faint, fontSize: fontSize.sm, fontFamily: fontFamily.sans },
  rigaLive: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rigaTitolo: { color: colors.ink, fontSize: fontSize.sm, fontFamily: fontFamily.semibold },
  rigaMeta: { color: colors.muted, fontSize: fontSize.xs, fontFamily: fontFamily.sans },
});
