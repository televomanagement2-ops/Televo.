// =============================================================================
// PlayerVocale — player di un messaggio vocale dentro la bolla (M2).
// =============================================================================
// Bucket privato → l'audio si carica in modo LAZY: solo al primo play risolviamo
// un URL firmato (signedUrlVocale) e creiamo il Sound. Mostra play/pausa, durata
// mm:ss, una barra di avanzamento lineare (niente waveform: costosa, fuori MVP) e
// un badge "24h" se effimero. Se la firma/caricamento fallisce (vocale scaduto o
// rimosso), mostra "Vocale non più disponibile" invece di crashare.

import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Audio, type AVPlaybackStatus } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { signedUrlVocale } from '@/lib/audio';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';

interface Props {
  /** PATH storage del vocale (non URL: il bucket è privato). */
  path: string | null;
  isMine: boolean;
  /** Se valorizzato, il vocale è effimero (24h) → badge. */
  expiresAt: string | null;
}

/** ms → "m:ss". */
function mmss(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function PlayerVocale({ path, isMine, expiresAt }: Props) {
  const soundRef = useRef<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [durationMillis, setDurationMillis] = useState(0);
  const [positionMillis, setPositionMillis] = useState(0);

  // Scarica il Sound quando la bolla sparisce dalla lista.
  useEffect(() => {
    return () => {
      void soundRef.current?.unloadAsync();
      soundRef.current = null;
    };
  }, []);

  const onStatus = (status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    setIsPlaying(status.isPlaying);
    setPositionMillis(status.positionMillis);
    if (status.durationMillis != null) setDurationMillis(status.durationMillis);
    // A fine riproduzione: torna all'inizio e mostra "play".
    if (status.didJustFinish) {
      setIsPlaying(false);
      setPositionMillis(0);
      void soundRef.current?.setPositionAsync(0);
    }
  };

  const togglePlay = async () => {
    if (failed || !path) return;
    try {
      // Play/pausa se già caricato.
      if (soundRef.current) {
        if (isPlaying) await soundRef.current.pauseAsync();
        else await soundRef.current.playAsync();
        return;
      }
      // Primo play: firma l'URL e carica.
      setLoading(true);
      const url = await signedUrlVocale(path);
      const { sound } = await Audio.Sound.createAsync(
        { uri: url },
        { shouldPlay: true },
        onStatus,
      );
      soundRef.current = sound;
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  if (!path || failed) {
    return (
      <Text style={[styles.unavailable, isMine && styles.unavailableMine]}>
        Vocale non più disponibile
      </Text>
    );
  }

  const progress = durationMillis > 0 ? positionMillis / durationMillis : 0;
  const tint = isMine ? '#ffffff' : colors.ink;
  const trackBg = isMine ? 'rgba(255,255,255,0.25)' : colors.border;
  const fillBg = isMine ? '#ffffff' : colors.accent;
  const label = positionMillis > 0 ? mmss(positionMillis) : mmss(durationMillis);

  return (
    <View style={styles.wrap}>
      <Pressable onPress={togglePlay} hitSlop={6} style={styles.playBtn}>
        <Ionicons
          name={loading ? 'ellipsis-horizontal' : isPlaying ? 'pause' : 'play'}
          size={20}
          color={tint}
        />
      </Pressable>
      <View style={styles.body}>
        <View style={[styles.track, { backgroundColor: trackBg }]}>
          <View
            style={[styles.fill, { backgroundColor: fillBg, width: `${Math.min(1, progress) * 100}%` }]}
          />
        </View>
        <View style={styles.meta}>
          <Text style={[styles.time, isMine && styles.timeMine]}>{label}</Text>
          {expiresAt ? (
            <Text style={[styles.badge, isMine && styles.badgeMine]}>24h</Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minWidth: 180 },
  playBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  body: { flex: 1, gap: 4 },
  track: { height: 4, borderRadius: 2, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2 },
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  time: { color: colors.faint, fontSize: 11, fontFamily: fontFamily.sans },
  timeMine: { color: 'rgba(255,255,255,0.7)' },
  badge: {
    color: colors.faint,
    fontSize: 10,
    fontFamily: fontFamily.semibold,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  badgeMine: { color: 'rgba(255,255,255,0.85)', borderColor: 'rgba(255,255,255,0.4)' },
  unavailable: {
    color: colors.muted,
    fontStyle: 'italic',
    fontSize: fontSize.sm,
    fontFamily: fontFamily.sans,
  },
  unavailableMine: { color: 'rgba(255,255,255,0.7)' },
});
