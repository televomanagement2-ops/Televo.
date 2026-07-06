// =============================================================================
// CommentoVocale — player COMPATTO del commento vocale (S3). La voce è un gesto
// primario di Televo (§16.1): rispondere a un momento parlando. Stesso motore
// del player prominente del drop (bucket privato `drop-audio`, URL firmato lazy,
// durata da `audio_seconds` senza scaricare) ma in scala "riga di commento".
// Se firma/caricamento falliscono mostra un fallback invece di crashare.
// =============================================================================

import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Audio, type AVPlaybackStatus } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { signedUrlDropAudio } from '@/lib/drops';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';

interface Props {
  /** PATH storage del vocale (drop_comments.audio_url), null se assente. */
  path: string | null;
  /** Durata dichiarata (drop_comments.audio_seconds): mostrata prima del play. */
  seconds: number | null;
}

/** secondi → "m:ss". */
function mmss(total: number): string {
  const s = Math.max(0, Math.round(total));
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, '0')}`;
}

export function CommentoVocale({ path, seconds }: Props) {
  const soundRef = useRef<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [positionMillis, setPositionMillis] = useState(0);
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
    return <Text style={styles.unavailable}>Vocale non più disponibile</Text>;
  }

  const progress = durationMillis > 0 ? Math.min(1, positionMillis / durationMillis) : 0;
  const label = positionMillis > 0 ? mmss(positionMillis / 1000) : mmss(seconds ?? durationMillis / 1000);

  return (
    <View style={styles.wrap}>
      <Pressable onPress={() => void togglePlay()} hitSlop={6} style={styles.playBtn}>
        <Ionicons
          name={loading ? 'ellipsis-horizontal' : isPlaying ? 'pause' : 'play'}
          size={16}
          color="#ffffff"
        />
      </Pressable>
      <View style={styles.body}>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${progress * 100}%` }]} />
        </View>
      </View>
      <Text style={styles.time}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minWidth: 160,
    maxWidth: 260,
  },
  playBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1 },
  track: { height: 4, borderRadius: 2, backgroundColor: colors.border, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2, backgroundColor: colors.accent },
  time: { color: colors.muted, fontSize: 11, fontFamily: fontFamily.medium, minWidth: 30 },
  unavailable: { color: colors.muted, fontStyle: 'italic', fontSize: 13, fontFamily: fontFamily.sans },
});
