// =============================================================================
// DropAudioPlayer — player prominente del drop vocale nella card (S1) e nel
// dettaglio (S3). Il vocale è il formato PRIMARIO di Televo: player grande, non
// una bollicina. Bucket privato → caricamento LAZY: la durata si mostra subito
// (da `audio_seconds`, senza scaricare il file), l'URL firmato si risolve solo
// al primo play (signedUrlDropAudio). Se firma/carico falliscono (scaduto o
// rimosso) mostra un fallback invece di crashare. Un solo Sound per player,
// scaricato all'unmount (esce dalla lista → libera memoria).
// =============================================================================

import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Audio, type AVPlaybackStatus } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { signedUrlDropAudio } from '@/lib/drops';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';

interface Props {
  /** PATH storage del vocale (drops.audio_url), null se assente. */
  path: string | null;
  /** Durata dichiarata (drops.audio_seconds): mostrata prima del caricamento. */
  seconds: number | null;
}

/** secondi → "m:ss". */
function mmss(total: number): string {
  const s = Math.max(0, Math.round(total));
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, '0')}`;
}

export function DropAudioPlayer({ path, seconds }: Props) {
  const soundRef = useRef<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [positionMillis, setPositionMillis] = useState(0);
  // Durata "reale" dal Sound quando disponibile; altrimenti quella dichiarata.
  const [durationMillis, setDurationMillis] = useState((seconds ?? 0) * 1000);

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
    if (status.durationMillis) setDurationMillis(status.durationMillis);
    if (status.didJustFinish) {
      setIsPlaying(false);
      setPositionMillis(0);
      void soundRef.current?.setPositionAsync(0);
    }
  };

  const togglePlay = async () => {
    if (failed || !path) return;
    try {
      if (soundRef.current) {
        if (isPlaying) await soundRef.current.pauseAsync();
        else await soundRef.current.playAsync();
        return;
      }
      setLoading(true);
      const url = await signedUrlDropAudio(path);
      const { sound } = await Audio.Sound.createAsync({ uri: url }, { shouldPlay: true }, onStatus);
      soundRef.current = sound;
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  if (!path || failed) {
    return (
      <View style={styles.wrap}>
        <View style={[styles.playBtn, styles.playBtnMuted]}>
          <Ionicons name="mic-off-outline" size={22} color={colors.muted} />
        </View>
        <Text style={styles.unavailable}>Vocale non più disponibile</Text>
      </View>
    );
  }

  const progress = durationMillis > 0 ? Math.min(1, positionMillis / durationMillis) : 0;
  // Prima del play mostra la durata dichiarata; durante, il tempo trascorso.
  const label = positionMillis > 0 ? mmss(positionMillis / 1000) : mmss(seconds ?? durationMillis / 1000);

  return (
    <View style={styles.wrap}>
      <Pressable onPress={() => void togglePlay()} hitSlop={6} style={styles.playBtn}>
        <Ionicons
          name={loading ? 'ellipsis-horizontal' : isPlaying ? 'pause' : 'play'}
          size={24}
          color="#ffffff"
        />
      </Pressable>
      <View style={styles.body}>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${progress * 100}%` }]} />
        </View>
        <View style={styles.meta}>
          <Ionicons name="mic-outline" size={13} color={colors.muted} />
          <Text style={styles.time}>{label}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.elevated,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  playBtn: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtnMuted: { backgroundColor: colors.surface },
  body: { flex: 1, gap: 6 },
  track: { height: 5, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' },
  fill: { height: 5, borderRadius: 3, backgroundColor: colors.accent },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  time: { color: colors.muted, fontSize: fontSize.xs, fontFamily: fontFamily.medium },
  unavailable: {
    flex: 1,
    color: colors.muted,
    fontStyle: 'italic',
    fontSize: fontSize.sm,
    fontFamily: fontFamily.sans,
  },
});
