// =============================================================================
// useLive — la sessione live e i commenti dello schermo /live/[id] (M12 / LM6).
// =============================================================================
// Due hook:
//
// - useLiveSession: possiede la Room LiveKit end-to-end (unico proprietario:
//   connessione, publish, pausa/unpublish, kick, teardown) e la verità DB
//   (live_detail). Ruolo dal token (il mint È il join, live.md §5): host e
//   co-host attivi pubblicano, tutti gli altri sono subscribe-only. Tre canali
//   di verità, in ordine di autorità: live_detail (snapshot + revalidation
//   60s), delta inbox live_status/live_ended (istantanei, solo non-host),
//   eventi Room (media). Su `not_visible`/`ended` ci si disconnette (§5).
//
// - useLiveComments: colonna commenti realtime (postgres_changes + RLS,
//   pattern drop_comments) + invio con moderazione fire-and-forget (§6).
//   Il fade-out è SOLO visivo e vive nell'overlay, non qui.
//
// ⚠️ Questo modulo importa livekit-client/@livekit/react-native (nativo):
// va importato SOLO dalle superfici live caricate pigramente dietro il guard
// Expo Go (pattern MapCanvas), mai dalla shell.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { AudioSession } from '@livekit/react-native';
import { DisconnectReason, LocalVideoTrack, Room, RoomEvent, Track } from 'livekit-client';
import type { Participant, TrackPublication } from 'livekit-client';
import { useAuth } from '@/hooks/useAuth';
import { authErrorCode } from '@/lib/auth';
import { liveErrorMessage } from '@/lib/errors';
import {
  accettaInvitoCoHost,
  esciDalCoLive,
  fetchLiveDetail,
  fetchMioStatoCoHost,
  fetchTokenLive,
  inviaCommentoLive,
  invitaCoHost,
  kickDaLive,
  lasciaLive,
  moderaCommentoLive,
  pausaLive,
  riprendiLive,
  rimuoviCoHost,
  terminaLive,
  type RigaCoHost,
} from '@/lib/live';
import { subscribeLiveComments } from '@/lib/live-realtime';
import { subscribeMapInbox } from '@/lib/map-realtime';
import { inizializzaLiveKit } from '@/lib/livekit';
import { fetchProfileCards } from '@/lib/social';
import type { LiveCommentRow } from '@/types';
import type { LiveDetailHostRaw, LiveDetailRaw, LiveStatus } from '@/types/supabase';

// -----------------------------------------------------------------------------
// Tipi esposti alla UI
// -----------------------------------------------------------------------------

/** Fase dello schermo: gli stati finali distinguono la fine pulita ("live
 *  terminata") dalla perdita di visibilità (kick/blocco → copy NEUTRA, mai
 *  rivelare il motivo) e dall'errore recuperabile (Riprova). */
export type FaseLive = 'connessione' | 'attiva' | 'terminata' | 'rimossa' | 'errore';

/** Riferimento traccia per <VideoTrack/> (stessa forma del TrackReference di
 *  components-react, dichiarato qui per non dipendere dal pacchetto transitivo). */
export interface TrackRefLive {
  participant: Participant;
  publication: TrackPublication;
  source: Track.Source;
}

/** Un riquadro video da renderizzare (host principale primo, poi co-host). */
export interface RiquadroVideo {
  userId: string;
  locale: boolean;
  trackRef: TrackRefLive;
}

export interface OpzioniLiveSession {
  /** Host, in onda, 0 spettatori ininterrotti per ~3 min (QA-6): il prompt
   *  gentile "Nessuno sta guardando" (§12.20). Al più una volta per "vuoto". */
  onLiveVuota?: () => void;
}

/** Millisecondi di vuoto prima del prompt live-vuota (QA-6: ~3 minuti). */
const LIVE_VUOTA_MS = 3 * 60_000;
/** Cadenza della revalidation live_detail (live.md §5). */
const REVALIDATION_MS = 60_000;

export interface LiveSessionApi {
  fase: FaseLive;
  /** Messaggio per fase 'errore' (già in italiano). */
  errore: string | null;
  /** Stato live/paused corrente (patchato da RPC, inbox e revalidation). */
  status: LiveStatus;
  titolo: string;
  commentiAbilitati: boolean;
  /** Host ATTIVI (principale primo) da live_detail. */
  hosts: LiveDetailHostRaw[];
  sonoHost: boolean;
  sonoCoHost: boolean;
  possoPubblicare: boolean;
  possoCommentare: boolean;
  /** Riquadri video da renderizzare (vuoto in pausa: tracce unpublished). */
  riquadri: RiquadroVideo[];
  /** Spettatori in stanza ORA (identità LiveKit, esclusi gli host attivi).
   *  Il NUMERO è mostrato agli host ATTIVI — principale e co-host (V6) — mai
   *  agli spettatori (anti-vanity §1.2). */
  idsSpettatori: string[];
  /** Controlli publisher (host e co-host attivi). */
  micAttivo: boolean;
  cameraAttiva: boolean;
  fotocameraFrontale: boolean;
  toggleMic: () => Promise<void>;
  toggleCamera: () => Promise<void>;
  flipCamera: () => Promise<void>;
  /** Audio remoto silenziato localmente (spettatore, §5: non tocca l'host). */
  audioSilenziato: boolean;
  toggleAudioLocale: () => void;
  /** Azioni host principale. */
  pausa: () => Promise<void>;
  riprendi: () => Promise<void>;
  termina: () => Promise<void>;
  kickSpettatore: (userId: string) => Promise<void>;
  rimuoviCoHostLive: (userId: string, status: RigaCoHost['status']) => Promise<void>;
  invitaAmico: (userId: string) => Promise<void>;
  /** Spettatore/co-host: uscita volontaria (best-effort + disconnessione). */
  esci: () => void;
  /** Invito co-host pendente per ME (banner "Accetta"), e l'accettazione
   *  (RPC → token nuovo con canPublish → riconnessione → publish). */
  mioInvitoPendente: boolean;
  accettaInvito: () => Promise<void>;
  /** Co-host attivo: lascia il Co-Live (RPC → 'left' → riconnessione da
   *  spettatore, specchio di accettaInvito). La live continua senza di lui. */
  lasciaCoLive: () => Promise<void>;
  /** Ritenta la connessione dalla fase 'errore'. */
  ricarica: () => void;
}

// -----------------------------------------------------------------------------
// useLiveSession
// -----------------------------------------------------------------------------

export function useLiveSession(
  liveId: string | undefined,
  opzioni?: OpzioniLiveSession,
): LiveSessionApi {
  const { uid } = useAuth();

  const [fase, setFase] = useState<FaseLive>('connessione');
  const [errore, setErrore] = useState<string | null>(null);
  const [detail, setDetail] = useState<LiveDetailRaw | null>(null);
  const [status, setStatus] = useState<LiveStatus>('live');
  const [possoPubblicare, setPossoPubblicare] = useState(false);
  const [micAttivo, setMicAttivo] = useState(true);
  const [cameraAttiva, setCameraAttiva] = useState(true);
  const [fotocameraFrontale, setFotocameraFrontale] = useState(true);
  const [audioSilenziato, setAudioSilenziato] = useState(false);
  const [mioInvito, setMioInvito] = useState<RigaCoHost | null>(null);
  // Contatore bumpato dagli eventi Room: i derivati (riquadri, spettatori) si
  // ricalcolano in render dalla Room viva (pattern LM5, niente stato duplicato).
  const [versione, setVersione] = useState(0);
  const [tentativo, setTentativo] = useState(0); // ricarica()

  const roomRef = useRef<Room | null>(null);
  // true mentre smontiamo/riconnettiamo DI PROPOSITO: silenzia il gestore
  // Disconnected (che altrimenti scambierebbe l'uscita per un kick).
  const disconnessioneVolutaRef = useRef(false);
  const audioSilenziatoRef = useRef(false);
  const pausaAutomaticaRef = useRef(false); // §12.2: pausa da interruzione OS

  const sonoHost = detail?.me.is_host ?? false;
  const sonoCoHost = detail?.me.is_cohost ?? false;
  const commentiAbilitati = detail?.live.comments_enabled ?? true;

  // --- Helpers di teardown -----------------------------------------------------

  const chiudiRoom = useCallback(async () => {
    const room = roomRef.current;
    roomRef.current = null;
    if (room) {
      disconnessioneVolutaRef.current = true;
      try {
        await room.disconnect();
      } catch {
        // la stanza può essere già morta (fine live): non è un errore
      }
      room.removeAllListeners();
      disconnessioneVolutaRef.current = false;
    }
  }, []);

  /** Applica il mute locale a TUTTI i partecipanti remoti (e ai futuri: viene
   *  richiamata a ogni evento participant finché lo stato resta silenziato). */
  const applicaVolumeLocale = useCallback((room: Room, muto: boolean) => {
    for (const p of room.remoteParticipants.values()) p.setVolume(muto ? 0 : 1);
  }, []);

  // --- Verità DB: revalidation (60s) e su eventi sospetti -----------------------

  const revalida = useCallback(async (): Promise<'ok' | 'finita'> => {
    if (!liveId) return 'finita';
    try {
      const d = await fetchLiveDetail(liveId);
      setDetail(d);
      setStatus(d.live.status);
      if (d.live.status === 'ended') {
        await chiudiRoom();
        setFase('terminata');
        return 'finita';
      }
      return 'ok';
    } catch (e) {
      const code = authErrorCode(e);
      if (code === 'not_visible' || code === 'live_not_found') {
        // Blocco, rimozione amicizia o kick a metà live (§12.4): copy neutra.
        await chiudiRoom();
        setFase('rimossa');
        return 'finita';
      }
      return 'ok'; // errore transiente di rete: si riprova al prossimo giro
    }
  }, [liveId, chiudiRoom]);

  // M14/V5: la griglia dei riquadri nasce da detail.hosts — quando un co-host
  // accetta, RIENTRA nella stanza con token publisher, e l'attesa del giro dei
  // 60s teneva lo split-screen invisibile per tutti. Al churn dei partecipanti
  // la verità si richiede SUBITO, debounced (un burst di join/leave collassa
  // in una sola chiamata).
  const revalidaDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revalidaPresto = useCallback(() => {
    if (revalidaDebounceRef.current) clearTimeout(revalidaDebounceRef.current);
    revalidaDebounceRef.current = setTimeout(() => {
      revalidaDebounceRef.current = null;
      void revalida();
    }, 400);
  }, [revalida]);

  // --- Connessione (mount, ricarica, riconnessione post-accettazione) -----------

  const connetti = useCallback(
    async (segnale: { annullato: boolean }) => {
      if (!liveId || !uid) return;
      setFase('connessione');
      setErrore(null);
      try {
        const pronto = await inizializzaLiveKit();
        if (!pronto || segnale.annullato) return; // Expo Go: il guard a monte non arriva qui

        const d = await fetchLiveDetail(liveId);
        if (segnale.annullato) return;
        setDetail(d);
        setStatus(d.live.status);
        if (d.live.status === 'ended') {
          setFase('terminata');
          return;
        }

        // Il mint è il join: qui si diventa spettatori reali (upsert
        // live_viewers) e si riceve il ruolo (canPublish per host/co-host attivi).
        const token = await fetchTokenLive(liveId);
        if (segnale.annullato) return;
        setPossoPubblicare(token.canPublish);

        await AudioSession.startAudioSession();
        const room = new Room({ adaptiveStream: true });
        roomRef.current = room;

        const bump = () => setVersione((v) => v + 1);
        const suPartecipanti = () => {
          bump();
          // Il mute locale dello spettatore vale anche per chi entra dopo.
          if (audioSilenziatoRef.current) applicaVolumeLocale(room, true);
        };
        room
          .on(RoomEvent.ParticipantConnected, () => {
            suPartecipanti();
            revalidaPresto(); // V5: il nuovo arrivato può essere un co-host
          })
          .on(RoomEvent.ParticipantDisconnected, () => {
            bump();
            revalidaPresto(); // V5: chi esce può essere un co-host (griglia giù)
          })
          .on(RoomEvent.TrackSubscribed, suPartecipanti)
          .on(RoomEvent.TrackUnsubscribed, bump)
          .on(RoomEvent.TrackMuted, bump)
          .on(RoomEvent.TrackUnmuted, bump)
          .on(RoomEvent.LocalTrackPublished, bump)
          .on(RoomEvent.LocalTrackUnpublished, bump)
          .on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
            if (disconnessioneVolutaRef.current) return;
            if (reason === DisconnectReason.PARTICIPANT_REMOVED) {
              // Kick: il media è già tagliato; la copy resta neutra (§12.3).
              roomRef.current = null;
              setFase('rimossa');
              return;
            }
            // Fine stanza, token scaduto su reconnect o rete persa in modo
            // definitivo: la verità la dice il DB (che su mint nuovo ricontrolla
            // anche visibilità e kick, §12.13).
            void revalida().then((esito) => {
              if (esito === 'ok') setTentativo((t) => t + 1); // riconnetti da capo
            });
          });

        await room.connect(token.wsUrl, token.token);
        if (segnale.annullato) {
          await chiudiRoom();
          return;
        }

        // Publisher (host/co-host attivo) con live IN ONDA: pubblica subito.
        // In pausa non si pubblica nulla (le tracce si alzano alla ripresa).
        if (token.canPublish && d.live.status === 'live') {
          await room.localParticipant.setCameraEnabled(true);
          await room.localParticipant.setMicrophoneEnabled(true);
          setCameraAttiva(true);
          setMicAttivo(true);
          setFotocameraFrontale(true);
        }
        if (audioSilenziatoRef.current) applicaVolumeLocale(room, true);

        setFase('attiva');
        setVersione((v) => v + 1);
      } catch (e) {
        if (segnale.annullato) return;
        const code = authErrorCode(e);
        if (code === 'live_not_joinable' || code === 'live_already_ended') {
          setFase('terminata');
        } else if (code === 'not_visible' || code === 'forbidden' || code === 'live_not_found') {
          setFase('rimossa');
        } else {
          setErrore(liveErrorMessage(e));
          setFase('errore');
        }
        await chiudiRoom();
      }
    },
    [liveId, uid, applicaVolumeLocale, chiudiRoom, revalida, revalidaPresto],
  );

  useEffect(() => {
    const segnale = { annullato: false };
    void connetti(segnale);
    return () => {
      segnale.annullato = true;
      if (revalidaDebounceRef.current) {
        clearTimeout(revalidaDebounceRef.current);
        revalidaDebounceRef.current = null;
      }
      void chiudiRoom();
      void AudioSession.stopAudioSession();
    };
  }, [connetti, chiudiRoom, tentativo]);

  // --- Revalidation periodica (§5): la verità è live_detail ---------------------

  useEffect(() => {
    if (fase !== 'attiva') return;
    const t = setInterval(() => void revalida(), REVALIDATION_MS);
    return () => clearInterval(t);
  }, [fase, revalida]);

  // --- Delta inbox (live_status / live_ended): istantanei per gli spettatori ----
  // (l'host non riceve i propri eventi: le sue azioni aggiornano lo stato via RPC)

  useEffect(() => {
    if (!uid || !liveId || fase !== 'attiva') return;
    return subscribeMapInbox(uid, {
      onLiveStatus: (p) => {
        if (p.live_id === liveId && p.status !== 'ended') setStatus(p.status);
      },
      onLiveEnded: (p) => {
        if (p.live_id !== liveId) return;
        void chiudiRoom().then(() => setFase('terminata'));
      },
    });
  }, [uid, liveId, fase, chiudiRoom]);

  // --- Invito co-host pendente (banner "Accetta") --------------------------------

  useEffect(() => {
    if (!uid || !liveId || fase !== 'attiva' || sonoHost || sonoCoHost) return;
    let vivo = true;
    fetchMioStatoCoHost(liveId, uid)
      .then((r) => {
        if (vivo) setMioInvito(r);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [uid, liveId, fase, sonoHost, sonoCoHost]);

  // --- Derivati dalla Room (ricalcolati a ogni bump di `versione`) ---------------

  const hosts = useMemo(() => detail?.hosts ?? [], [detail]);

  const { riquadri, idsSpettatori } = useMemo(() => {
    void versione; // dipendenza esplicita: la Room è mutabile, il bump la fotografa
    const room = roomRef.current;
    const out: RiquadroVideo[] = [];
    const spettatori: string[] = [];
    if (!room || fase !== 'attiva') return { riquadri: out, idsSpettatori: spettatori };

    const idsHost = new Set(hosts.map((h) => h.user_id));
    // Riquadri nell'ordine di live_detail (host principale primo, poi co-host).
    for (const h of hosts) {
      const locale = h.user_id === room.localParticipant.identity;
      const participant = locale
        ? room.localParticipant
        : room.remoteParticipants.get(h.user_id);
      const publication = participant?.getTrackPublication(Track.Source.Camera);
      if (participant && publication?.track && !publication.isMuted) {
        out.push({
          userId: h.user_id,
          locale,
          trackRef: { participant, publication, source: Track.Source.Camera },
        });
      }
    }
    for (const p of room.remoteParticipants.values()) {
      if (!idsHost.has(p.identity)) spettatori.push(p.identity);
    }
    return { riquadri: out, idsSpettatori: spettatori };
  }, [versione, fase, hosts]);

  // --- Prompt "live vuota" (host, §12.20 / QA-6) ---------------------------------

  const onLiveVuotaRef = useRef(opzioni?.onLiveVuota);
  onLiveVuotaRef.current = opzioni?.onLiveVuota;
  const promptMostratoRef = useRef(false);

  const vuota = sonoHost && fase === 'attiva' && status === 'live' && idsSpettatori.length === 0;
  useEffect(() => {
    if (!vuota) {
      promptMostratoRef.current = false; // qualcuno è entrato: il timer si riarma
      return;
    }
    if (promptMostratoRef.current) return; // già chiesto per questo "vuoto"
    const t = setTimeout(() => {
      promptMostratoRef.current = true;
      onLiveVuotaRef.current?.();
    }, LIVE_VUOTA_MS);
    return () => clearTimeout(t);
  }, [vuota]);

  // --- Controlli publisher --------------------------------------------------------

  const toggleMic = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const nuovo = !micAttivo;
    await room.localParticipant.setMicrophoneEnabled(nuovo);
    setMicAttivo(nuovo);
  }, [micAttivo]);

  const toggleCamera = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const nuovo = !cameraAttiva;
    await room.localParticipant.setCameraEnabled(nuovo);
    setCameraAttiva(nuovo);
  }, [cameraAttiva]);

  const flipCamera = useCallback(async () => {
    const room = roomRef.current;
    const track = room?.localParticipant.getTrackPublication(Track.Source.Camera)?.track;
    if (!(track instanceof LocalVideoTrack)) return;
    const frontale = !fotocameraFrontale;
    await track.restartTrack({ facingMode: frontale ? 'user' : 'environment' });
    setFotocameraFrontale(frontale);
  }, [fotocameraFrontale]);

  const toggleAudioLocale = useCallback(() => {
    setAudioSilenziato((muto) => {
      const nuovo = !muto;
      audioSilenziatoRef.current = nuovo;
      const room = roomRef.current;
      if (room) applicaVolumeLocale(room, nuovo);
      return nuovo;
    });
  }, [applicaVolumeLocale]);

  // --- Pausa / ripresa (solo host principale, §2) ---------------------------------
  // DB PRIMA (l'RPC è l'arbitro delle transizioni), POI il media: in pausa le
  // tracce vengono davvero UNPUBLISHED (camera e mic si spengono, non un frame
  // nero); alla ripresa si ripubblicano rispettando i toggle correnti.

  const spegniTracce = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    // Copia: l'unpublish rimuove le entry dalla Map mentre la si scorre.
    const pubs = [...room.localParticipant.trackPublications.values()];
    for (const pub of pubs) {
      if (pub.track) await room.localParticipant.unpublishTrack(pub.track, true);
    }
  }, []);

  const accendiTracce = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    if (cameraAttiva) await room.localParticipant.setCameraEnabled(true);
    if (micAttivo) await room.localParticipant.setMicrophoneEnabled(true);
  }, [cameraAttiva, micAttivo]);

  const pausa = useCallback(async () => {
    if (!liveId) return;
    await pausaLive(liveId);
    setStatus('paused');
    await spegniTracce();
  }, [liveId, spegniTracce]);

  const riprendi = useCallback(async () => {
    if (!liveId) return;
    await riprendiLive(liveId);
    setStatus('live');
    await accendiTracce();
  }, [liveId, accendiTracce]);

  // §12.2 — interruzioni OS (telefonata, app in background): l'host in onda va
  // in pausa automatica (best-effort) e riprende da solo al ritorno, SOLO se la
  // pausa era automatica (una pausa scelta dall'utente resta sua).
  const sonoHostRef = useRef(false);
  sonoHostRef.current = sonoHost && fase === 'attiva';
  const statusRef = useRef(status);
  statusRef.current = status;

  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'background' && sonoHostRef.current && statusRef.current === 'live') {
        pausaAutomaticaRef.current = true;
        void pausa().catch(() => {
          pausaAutomaticaRef.current = false;
        });
      } else if (st === 'active' && pausaAutomaticaRef.current) {
        pausaAutomaticaRef.current = false;
        void riprendi().catch(() => {});
      }
    });
    return () => sub.remove();
  }, [pausa, riprendi]);

  // --- Azioni host / spettatore ----------------------------------------------------

  const termina = useCallback(async () => {
    if (!liveId) return;
    await terminaLive(liveId);
    await chiudiRoom();
    setFase('terminata');
  }, [liveId, chiudiRoom]);

  const esci = useCallback(() => {
    if (liveId) lasciaLive(liveId); // best-effort: il webhook riconcilia (§5)
    void chiudiRoom();
  }, [liveId, chiudiRoom]);

  const kickSpettatore = useCallback(
    async (userId: string) => {
      if (!liveId) return;
      await kickDaLive(liveId, userId, 'viewer'); // DB prima, media dopo (§12.3)
      setVersione((v) => v + 1);
    },
    [liveId],
  );

  const rimuoviCoHostLive = useCallback(
    async (userId: string, statusRiga: RigaCoHost['status']) => {
      if (!liveId) return;
      if (statusRiga === 'active') {
        // Co-host attivo: la Edge marca 'removed' E taglia il media subito.
        await kickDaLive(liveId, userId, 'cohost');
      } else {
        // Solo invitato: basta la revoca RPC (nessun media da tagliare).
        await rimuoviCoHost(liveId, userId);
      }
      await revalida();
    },
    [liveId, revalida],
  );

  const invitaAmico = useCallback(
    async (userId: string) => {
      if (!liveId) return;
      await invitaCoHost(liveId, userId);
    },
    [liveId],
  );

  const accettaInvito = useCallback(async () => {
    if (!liveId) return;
    await accettaInvitoCoHost(liveId);
    setMioInvito(null);
    // Da qui il MIO grafo entra nel pubblico (L-3) ma il token in mano è
    // subscribe-only: serve un mint nuovo → riconnessione completa (il flusso
    // connetti ripete detail+token e pubblica se la live è in onda).
    await chiudiRoom();
    setTentativo((t) => t + 1);
  }, [liveId, chiudiRoom]);

  // V6: specchio di accettaInvito — la riga live_hosts passa a 'left' e il
  // token publisher in mano non riflette più il ruolo: mint nuovo da
  // spettatore (il flusso connetti ripete detail+token, canPublish=false).
  const lasciaCoLive = useCallback(async () => {
    if (!liveId) return;
    await esciDalCoLive(liveId);
    await chiudiRoom();
    setTentativo((t) => t + 1);
  }, [liveId, chiudiRoom]);

  const ricarica = useCallback(() => setTentativo((t) => t + 1), []);

  return {
    fase,
    errore,
    status,
    titolo: detail?.live.title ?? '',
    commentiAbilitati,
    hosts,
    sonoHost,
    sonoCoHost,
    possoPubblicare,
    possoCommentare: commentiAbilitati && status === 'live',
    riquadri,
    idsSpettatori,
    micAttivo,
    cameraAttiva,
    fotocameraFrontale,
    toggleMic,
    toggleCamera,
    flipCamera,
    audioSilenziato,
    toggleAudioLocale,
    pausa,
    riprendi,
    termina,
    kickSpettatore,
    rimuoviCoHostLive,
    invitaAmico,
    esci,
    mioInvitoPendente: mioInvito?.status === 'invited',
    accettaInvito,
    lasciaCoLive,
    ricarica,
  };
}

// -----------------------------------------------------------------------------
// useLiveComments — colonna commenti (effimeri a schermo, moderati server-side)
// -----------------------------------------------------------------------------

/** Un commento pronto per l'overlay (autore già risolto). */
export interface CommentoLive {
  id: string;
  authorId: string;
  nome: string;
  avatarUrl: string | null;
  body: string;
  createdAtMs: number;
  mio: boolean;
}

/** Identità già note al chiamante (gli host da live_detail): evitano un fetch. */
export interface IdentitaNota {
  userId: string;
  nome: string;
  avatarUrl: string | null;
}

/** Tetto dei commenti tenuti in memoria (l'overlay ne mostra molti meno). */
const MAX_COMMENTI = 50;

export function useLiveComments(
  liveId: string | undefined,
  attivi: boolean,
  identitaNote: IdentitaNota[],
) {
  const { uid, profile } = useAuth();

  const [commenti, setCommenti] = useState<CommentoLive[]>([]);
  // Cache identità autore (userId → nome/avatar), seminata con host e profilo
  // proprio; i mancanti si risolvono in batch da profiles (via RLS).
  const identitaRef = useRef(new Map<string, { nome: string; avatarUrl: string | null }>());
  const inRisoluzioneRef = useRef(new Set<string>());

  useEffect(() => {
    for (const i of identitaNote) {
      identitaRef.current.set(i.userId, { nome: i.nome, avatarUrl: i.avatarUrl });
    }
  }, [identitaNote]);
  useEffect(() => {
    if (uid && profile) {
      identitaRef.current.set(uid, {
        nome: profile.display_name ?? profile.username,
        avatarUrl: profile.avatar_url,
      });
    }
  }, [uid, profile]);

  const aggiungi = useCallback(
    (row: LiveCommentRow) => {
      setCommenti((prev) => {
        if (prev.some((c) => c.id === row.id)) return prev; // eco del proprio insert
        const ident = identitaRef.current.get(row.author_id);
        const nuovo: CommentoLive = {
          id: row.id,
          authorId: row.author_id,
          nome: ident?.nome ?? '…',
          avatarUrl: ident?.avatarUrl ?? null,
          body: row.body,
          createdAtMs: Date.parse(row.created_at),
          mio: row.author_id === uid,
        };
        const out = [...prev, nuovo].sort((a, b) => a.createdAtMs - b.createdAtMs);
        return out.length > MAX_COMMENTI ? out.slice(out.length - MAX_COMMENTI) : out;
      });

      // Autore ignoto: risolvi in background e patcha (un fetch per autore).
      if (!identitaRef.current.has(row.author_id) && !inRisoluzioneRef.current.has(row.author_id)) {
        inRisoluzioneRef.current.add(row.author_id);
        fetchProfileCards([row.author_id])
          .then((cards) => {
            const card = cards.get(row.author_id);
            if (!card) return;
            identitaRef.current.set(row.author_id, {
              nome: card.displayName ?? card.username,
              avatarUrl: card.avatarUrl,
            });
            setCommenti((prev) =>
              prev.map((c) =>
                c.authorId === row.author_id
                  ? { ...c, nome: card.displayName ?? card.username, avatarUrl: card.avatarUrl }
                  : c,
              ),
            );
          })
          .catch(() => {})
          .finally(() => inRisoluzioneRef.current.delete(row.author_id));
      }
    },
    [uid],
  );

  // Canale realtime: vive solo con lo schermo aperto e i commenti attivi.
  useEffect(() => {
    if (!liveId || !attivi) return;
    return subscribeLiveComments(liveId, aggiungi);
  }, [liveId, attivi, aggiungi]);

  /** Invia: insert diretta (trigger = arbitro) + moderazione fire-and-forget.
   *  L'aggiunta è ottimistica sulla riga RITORNATA (l'eco realtime si dedupa). */
  const invia = useCallback(
    async (body: string) => {
      if (!liveId) return;
      const riga = await inviaCommentoLive(liveId, body);
      aggiungi(riga);
      moderaCommentoLive(riga.id, body);
    },
    [liveId, aggiungi],
  );

  return { commenti, invia };
}
