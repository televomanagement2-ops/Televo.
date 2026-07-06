// =============================================================================
// S2 — Composer del drop (nuovo.tsx). Tre formati in una sola schermata:
// Foto (BeReal-style), Audio (post vocale) e Testo, preselezionati dal menu S0
// via ?tipo=. Pubblicazione OTTIMISTICA e offline-safe (RC-01): al tap su
// Pubblica il drop entra nell'outbox (id client, upload file prima dell'insert)
// e la schermata si chiude subito; pending/failed vivono nello store (il feed
// li mostrerà in DM2; in DM1 i fallimenti si annunciano dal runtime).
// Riusa i pattern collaudati della chat: media.ts (foto), audio.ts (vocali),
// composer a tre stati, permessi con invito alle impostazioni (CM7), dialoghi
// dark (mai Alert.alert). La didascalia/testo vive in dropStore.bozze (resiste
// alla chiusura accidentale). Audience sempre "Amici" (R-02), scadenza 24h.
// =============================================================================

import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import { useDropOutbox, useDropPromptOfDay } from '@/hooks/useDrops';
import { scattaFoto, scegliFotoDaGalleria, type FotoScelta } from '@/lib/media';
import { avviaRegistrazione, fermaRegistrazione, richiediPermessoMic } from '@/lib/audio';
import { fetchComposerDisabledReason } from '@/lib/chat';
import { avvisa, conferma } from '@/lib/dialoghi';
import { dropErrorMessage } from '@/lib/errors';
import { useDropStore, type DropComposerTipo } from '@/store/dropStore';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';

const TIPI: readonly { key: DropComposerTipo; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'foto', label: 'Foto', icon: 'camera-outline' },
  { key: 'audio', label: 'Audio', icon: 'mic-outline' },
  { key: 'testo', label: 'Testo', icon: 'create-outline' },
];

const MAX_TESTO = 2000;
const MAX_CAPTION = 280;
const MAX_AUDIO_SEC = 300;

/** secondi → "m:ss". */
function mmss(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function tipoValido(t: string | undefined): DropComposerTipo {
  return t === 'foto' || t === 'audio' || t === 'testo' ? t : 'foto';
}

export default function NuovoDrop() {
  const { tipo: tipoParam } = useLocalSearchParams<{ tipo?: string }>();
  const { session } = useAuth();
  const uid = session?.user.id;
  const { pubblicaTesto, pubblicaFoto, pubblicaAudio } = useDropOutbox();
  const { data: tema } = useDropPromptOfDay(); // DM7: tema del giorno (§16.2)

  const [tipo, setTipo] = useState<DropComposerTipo>(() => tipoValido(tipoParam));

  // Testo/didascalia per formato: bozza persistente (resiste alla chiusura).
  const bozza = useDropStore((s) => s.bozze[tipo]);
  const setBozza = useDropStore((s) => s.setBozza);
  const clearBozza = useDropStore((s) => s.clearBozza);

  // Motivo di composer disabilitato (mutato/bannato): parità col composer chat.
  const [disabledReason, setDisabledReason] = useState<string | null>(null);
  useEffect(() => {
    if (!uid) return;
    let vivo = true;
    fetchComposerDisabledReason(uid, null)
      .then((r) => vivo && setDisabledReason(r))
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [uid]);

  // --- Foto (riuso media.ts) -------------------------------------------------
  const [foto, setFoto] = useState<FotoScelta | null>(null);

  const scegliFoto = async (scegli: () => Promise<FotoScelta | null>) => {
    try {
      const f = await scegli();
      if (f) setFoto(f);
    } catch (e) {
      // Permesso OS negato: spiegazione + invito alle impostazioni (CM7).
      conferma({
        titolo: 'Permesso necessario',
        messaggio: dropErrorMessage(e),
        confermaLabel: 'Apri impostazioni',
        onConferma: () => void Linking.openSettings(),
      });
    }
  };

  // --- Audio (riuso audio.ts, stessa UX a 3 stati del composer chat) ---------
  const recordingRef = useRef<Audio.Recording | null>(null);
  const previewSoundRef = useRef<Audio.Sound | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioPreview, setAudioPreview] = useState<{ uri: string; seconds: number } | null>(null);

  const startRec = async () => {
    const ok = await richiediPermessoMic();
    if (!ok) {
      conferma({
        titolo: 'Permesso microfono',
        messaggio: 'Consenti l’accesso al microfono per registrare un vocale.',
        confermaLabel: 'Apri impostazioni',
        onConferma: () => void Linking.openSettings(),
      });
      return;
    }
    try {
      recordingRef.current = await avviaRegistrazione();
      setRecordingSeconds(0);
      setIsRecording(true);
    } catch {
      avvisa('Ops', 'Impossibile avviare la registrazione.');
    }
  };

  const stopRec = async () => {
    const rec = recordingRef.current;
    recordingRef.current = null;
    setIsRecording(false);
    if (!rec) return;
    try {
      const { uri, durationMillis } = await fermaRegistrazione(rec);
      setAudioPreview({ uri, seconds: Math.max(1, Math.round(durationMillis / 1000)) });
    } catch {
      avvisa('Ops', 'Registrazione non riuscita, riprova.');
    }
  };

  // Timer 1s mentre si registra.
  useEffect(() => {
    if (!isRecording) return;
    const t = setInterval(() => setRecordingSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [isRecording]);

  // Stop automatico al tetto (300s): effetto separato, updater di stato puro.
  useEffect(() => {
    if (isRecording && recordingSeconds >= MAX_AUDIO_SEC) void stopRec();
  }, [isRecording, recordingSeconds]);

  // Cleanup all'uscita: ferma registrazione e scarica l'anteprima.
  useEffect(() => {
    return () => {
      void recordingRef.current?.stopAndUnloadAsync().catch(() => {});
      recordingRef.current = null;
      void previewSoundRef.current?.unloadAsync();
      previewSoundRef.current = null;
    };
  }, []);

  const scartaAudio = () => {
    void previewSoundRef.current?.unloadAsync();
    previewSoundRef.current = null;
    setAudioPreview(null);
  };

  const riproduciAudio = async () => {
    if (!audioPreview) return;
    try {
      if (previewSoundRef.current) {
        await previewSoundRef.current.replayAsync();
        return;
      }
      const { sound } = await Audio.Sound.createAsync({ uri: audioPreview.uri }, { shouldPlay: true });
      previewSoundRef.current = sound;
      sound.setOnPlaybackStatusUpdate((s) => {
        if (s.isLoaded && s.didJustFinish) void sound.setPositionAsync(0);
      });
    } catch {
      avvisa('Ops', 'Impossibile riprodurre il vocale.');
    }
  };

  // --- Pubblicazione ---------------------------------------------------------
  const inVolo = useRef(false);

  const puoPubblicare =
    !disabledReason &&
    (tipo === 'testo' ? bozza.trim().length > 0 : tipo === 'foto' ? !!foto : !!audioPreview);

  const pubblica = () => {
    if (!uid || inVolo.current || !puoPubblicare) return;
    inVolo.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    if (tipo === 'testo') {
      pubblicaTesto(bozza);
    } else if (tipo === 'foto' && foto) {
      pubblicaFoto(foto.uri, foto.mimeType, bozza);
    } else if (tipo === 'audio' && audioPreview) {
      pubblicaAudio(audioPreview.uri, audioPreview.seconds, bozza);
    }
    clearBozza(tipo);
    // Chiusura immediata (ottimistica): l'esito vive nell'outbox.
    if (router.canGoBack()) router.back();
    else router.replace('/home');
  };

  const restanti = (tipo === 'testo' ? MAX_TESTO : MAX_CAPTION) - bozza.length;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header: chiudi + titolo + selettore formato */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={8} style={styles.headerBtn}>
            <Ionicons name="close" size={26} color={colors.ink} />
          </Pressable>
          <Text style={styles.headerTitle}>Nuovo drop</Text>
          <View style={styles.headerBtn} />
        </View>

        <View style={styles.tabs}>
          {TIPI.map((t) => {
            const attivo = t.key === tipo;
            return (
              <Pressable
                key={t.key}
                onPress={() => setTipo(t.key)}
                style={[styles.tab, attivo && styles.tabActive]}
              >
                <Ionicons name={t.icon} size={16} color={attivo ? '#ffffff' : colors.muted} />
                <Text style={[styles.tabLabel, attivo && styles.tabLabelActive]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Tema del giorno (DM7, §16.2): spunto informativo, mai obbligatorio */}
          {tema ? (
            <View
              style={styles.tema}
              accessibilityRole="text"
              accessibilityLabel={`Tema di oggi: ${tema.body}`}
            >
              <Ionicons name="sparkles" size={16} color={colors.accentSoft} />
              <View style={styles.temaTesti}>
                <Text style={styles.temaLabel}>Tema di oggi</Text>
                <Text style={styles.temaBody}>{tema.body}</Text>
              </View>
            </View>
          ) : null}

          {tipo === 'foto' ? (
            <FotoComposer foto={foto} onScegli={scegliFoto} onRimuovi={() => setFoto(null)} />
          ) : tipo === 'audio' ? (
            <AudioComposer
              isRecording={isRecording}
              recordingSeconds={recordingSeconds}
              preview={audioPreview}
              onStart={() => void startRec()}
              onStop={() => void stopRec()}
              onPlay={() => void riproduciAudio()}
              onScarta={scartaAudio}
            />
          ) : null}

          {/* Testo del drop (testo) o didascalia (foto/audio) */}
          <TextInput
            value={bozza}
            onChangeText={(t) => setBozza(tipo, t)}
            placeholder={tipo === 'testo' ? 'Scrivi un pensiero…' : 'Aggiungi una didascalia, se vuoi'}
            placeholderTextColor={colors.faint}
            selectionColor={colors.accent}
            style={[styles.input, tipo === 'testo' && styles.inputTesto]}
            maxLength={tipo === 'testo' ? MAX_TESTO : MAX_CAPTION}
            multiline
          />
          <Text style={styles.counter}>{restanti}</Text>
        </ScrollView>

        {/* Footer: audience + scadenza + Pubblica */}
        <View style={styles.footer}>
          {disabledReason ? (
            <View style={styles.disabledBar}>
              <Ionicons name="volume-mute-outline" size={18} color={colors.muted} />
              <Text style={styles.disabledText}>{disabledReason}</Text>
            </View>
          ) : (
            <View style={styles.meta}>
              <View style={styles.metaChip}>
                <Ionicons name="people" size={14} color={colors.accentSoft} />
                <Text style={styles.metaText}>Amici</Text>
              </View>
              <View style={styles.metaChip}>
                <Ionicons name="time-outline" size={14} color={colors.muted} />
                <Text style={styles.metaText}>Scade tra 24h</Text>
              </View>
            </View>
          )}
          <Button label="Pubblica" onPress={pubblica} disabled={!puoPubblicare} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// --- Sotto-composer: Foto ------------------------------------------------------

function FotoComposer({
  foto,
  onScegli,
  onRimuovi,
}: {
  foto: FotoScelta | null;
  onScegli: (scegli: () => Promise<FotoScelta | null>) => void;
  onRimuovi: () => void;
}) {
  if (foto) {
    return (
      <View style={styles.fotoWrap}>
        <Image source={{ uri: foto.uri }} style={styles.fotoPreview} contentFit="cover" />
        <Pressable onPress={onRimuovi} style={styles.fotoRimuovi} hitSlop={8}>
          <Ionicons name="close" size={18} color="#ffffff" />
        </Pressable>
      </View>
    );
  }
  return (
    <View style={styles.pickRow}>
      <Pressable style={styles.pickBtn} onPress={() => onScegli(scegliFotoDaGalleria)}>
        <Ionicons name="images-outline" size={26} color={colors.ink} />
        <Text style={styles.pickLabel}>Galleria</Text>
      </Pressable>
      <Pressable style={styles.pickBtn} onPress={() => onScegli(scattaFoto)}>
        <Ionicons name="camera-outline" size={26} color={colors.ink} />
        <Text style={styles.pickLabel}>Scatta</Text>
      </Pressable>
    </View>
  );
}

// --- Sotto-composer: Audio -----------------------------------------------------

function AudioComposer({
  isRecording,
  recordingSeconds,
  preview,
  onStart,
  onStop,
  onPlay,
  onScarta,
}: {
  isRecording: boolean;
  recordingSeconds: number;
  preview: { uri: string; seconds: number } | null;
  onStart: () => void;
  onStop: () => void;
  onPlay: () => void;
  onScarta: () => void;
}) {
  if (preview) {
    return (
      <View style={styles.audioBox}>
        <Pressable onPress={onPlay} style={styles.audioPlay}>
          <Ionicons name="play" size={22} color="#ffffff" />
        </Pressable>
        <Text style={styles.audioDur}>Vocale {mmss(preview.seconds)}</Text>
        <Pressable onPress={onScarta} hitSlop={8} style={styles.audioRifai}>
          <Ionicons name="refresh" size={18} color={colors.muted} />
          <Text style={styles.audioRifaiText}>Rifai</Text>
        </Pressable>
      </View>
    );
  }
  if (isRecording) {
    return (
      <View style={styles.audioBox}>
        <View style={styles.recDot} />
        <Text style={styles.audioDur}>Registrando… {mmss(recordingSeconds)}</Text>
        <Pressable onPress={onStop} style={[styles.audioPlay, styles.audioStop]}>
          <Ionicons name="stop" size={18} color="#ffffff" />
        </Pressable>
      </View>
    );
  }
  return (
    <Pressable style={styles.audioIdle} onPress={onStart}>
      <View style={styles.audioMic}>
        <Ionicons name="mic" size={30} color="#ffffff" />
      </View>
      <Text style={styles.audioIdleText}>Tocca per registrare (max 5 min)</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.base },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: colors.ink, fontSize: fontSize.lg, fontFamily: fontFamily.semibold },
  tabs: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  tabLabel: { color: colors.muted, fontSize: fontSize.sm, fontFamily: fontFamily.semibold },
  tabLabelActive: { color: '#ffffff' },

  body: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md },

  // Tema del giorno (DM7): banner sobrio, accento tenue, non interattivo.
  tema: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.accentDeep,
  },
  temaTesti: { flex: 1, gap: 2 },
  temaLabel: {
    color: colors.accentSoft,
    fontSize: fontSize.xs,
    fontFamily: fontFamily.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  temaBody: { color: colors.ink, fontSize: fontSize.sm, fontFamily: fontFamily.medium },

  input: {
    minHeight: 48,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    color: colors.ink,
    fontSize: fontSize.base,
    fontFamily: fontFamily.sans,
  },
  inputTesto: { minHeight: 160, fontSize: fontSize.lg, textAlignVertical: 'top' },
  counter: { color: colors.faint, fontSize: fontSize.xs, fontFamily: fontFamily.sans, alignSelf: 'flex-end' },

  // Foto
  fotoWrap: { alignSelf: 'center', width: '80%', aspectRatio: 4 / 5, borderRadius: radius.lg, overflow: 'hidden' },
  fotoPreview: { width: '100%', height: '100%', backgroundColor: colors.elevated },
  fotoRimuovi: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickRow: { flexDirection: 'row', gap: spacing.md },
  pickBtn: {
    flex: 1,
    aspectRatio: 1.4,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  pickLabel: { color: colors.ink, fontSize: fontSize.sm, fontFamily: fontFamily.semibold },

  // Audio
  audioIdle: {
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
  },
  audioMic: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  audioIdleText: { color: colors.muted, fontSize: fontSize.sm, fontFamily: fontFamily.sans },
  audioBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  audioPlay: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  audioStop: { backgroundColor: colors.danger },
  audioDur: { flex: 1, color: colors.ink, fontSize: fontSize.base, fontFamily: fontFamily.medium },
  audioRifai: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  audioRifaiText: { color: colors.muted, fontSize: fontSize.sm, fontFamily: fontFamily.medium },
  recDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.danger },

  // Footer
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.base,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.md,
  },
  meta: { flexDirection: 'row', gap: spacing.sm },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: colors.elevated,
  },
  metaText: { color: colors.muted, fontSize: fontSize.xs, fontFamily: fontFamily.medium },
  disabledBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
  },
  disabledText: { color: colors.muted, fontSize: fontSize.sm, fontFamily: fontFamily.sans },
});
