// =============================================================================
// BollaMedia — thumbnail di una foto dentro la bolla (CM5, D3).
// =============================================================================
// La foto sta nel bucket PRIVATO chat-media: qui si firma l'URL EAGER al mount
// (diverso dal lazy-al-tap dei vocali: una thumbnail deve caricarsi da sola).
// Box a dimensioni FISSE 4:3 (niente width/height in DB → zero layout shift;
// crop `cover` accettato per l'anteprima, l'originale intero si vede nel
// viewer). `cacheKey = path`: i signed URL ruotano a ogni firma, senza chiave
// stabile la disk-cache di expo-image non colpirebbe mai.
// In coda d'invio (outbox) mostra il file locale con overlay di caricamento.

import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { signedUrlFoto } from '@/lib/media';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';

interface Props {
  /** messages.media_url: PATH storage (non un URL), null se GDPR-azzerato. */
  path: string | null;
  /** Outbox pending: URI locale della foto (mostrata subito, niente firma). */
  localUri?: string | null;
  /** True mentre l'upload è in corso (overlay spinner sulla foto locale). */
  uploading?: boolean;
  isMine: boolean;
  /** Apre il viewer full-screen (spento per pending/failed). */
  onPress?: () => void;
}

export function BollaMedia({ path, localUri, uploading, isMine, onPress }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    // Pending (file locale) o path assente: niente da firmare.
    if (localUri || !path) return;
    let attivo = true;
    setUrl(null);
    setFailed(false);
    signedUrlFoto(path)
      .then((u) => {
        if (attivo) setUrl(u);
      })
      .catch(() => {
        if (attivo) setFailed(true);
      });
    return () => {
      attivo = false;
    };
  }, [path, localUri]);

  // Foto irraggiungibile: file rimosso dallo storage o messaggio GDPR-azzerato.
  if (failed || (!path && !localUri)) {
    return (
      <View style={[styles.box, styles.fallback]}>
        <Ionicons name="image-outline" size={28} color={colors.muted} />
        <Text style={styles.fallbackText}>Foto non più disponibile</Text>
      </View>
    );
  }

  const sorgente = localUri
    ? { uri: localUri }
    : url
      ? { uri: url, cacheKey: path as string }
      : null;

  return (
    <Pressable onPress={onPress} disabled={!onPress} style={styles.box}>
      {sorgente ? (
        <Image
          source={sorgente}
          style={styles.img}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={120}
          onError={() => setFailed(true)}
        />
      ) : null}
      {/* Spinner: in attesa della firma, o upload in corso (pending). */}
      {!sorgente || uploading ? (
        <View style={styles.overlay}>
          <ActivityIndicator color={isMine ? '#ffffff' : colors.ink} />
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: {
    width: 240,
    height: 180,
    borderRadius: radius.lg - 4,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  img: { width: '100%', height: '100%' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  fallbackText: { color: colors.muted, fontSize: fontSize.sm, fontFamily: fontFamily.sans },
});
