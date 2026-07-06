// =============================================================================
// ViewerMedia — foto a schermo intero con pinch-zoom (CM5, S14c).
// =============================================================================
// Modal full-screen su sfondo nero. Gesti: pinch (zoom 1–4x), pan (solo da
// zoomati, con clamp ai bordi), doppio tap (toggle 1x/2.5x), tap singolo
// (mostra/nasconde l'header). ⚠️ GestureHandlerRootView DENTRO il Modal: su
// Android il Modal è una finestra nativa separata e i gesti RNGH non
// funzionano con la sola root di app/_layout. L'URL è firmato al volo
// (di norma già in cache dalla thumbnail); il pinch riparte da 1 a ogni
// apertura. Stati: caricamento, foto non più disponibile.

import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { signedUrlFoto } from '@/lib/media';
import { colors, fontFamily, fontSize, spacing } from '@/constants/theme';

const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;

interface Props {
  visible: boolean;
  /** PATH storage della foto (chat `media_url` o `drops.media_url`), null se sparita. */
  path: string | null;
  /** Caption della foto (body del messaggio/drop). */
  caption?: string | null;
  /**
   * Firmatario dell'URL: di default il bucket foto della CHAT (`signedUrlFoto`).
   * I drop passano `signedUrlDropFoto` (bucket privato `drop-media`) — così il
   * viewer resta uno solo per entrambi i domini, senza sapere quale bucket sia.
   */
  signer?: (path: string) => Promise<string>;
  onClose: () => void;
}

export function ViewerMedia({ visible, path, caption, signer = signedUrlFoto, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [headerVisible, setHeaderVisible] = useState(true);

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);

  // A ogni apertura: zoom azzerato, header visibile, URL firmato fresco.
  useEffect(() => {
    if (!visible) return;
    scale.value = 1;
    savedScale.value = 1;
    tx.value = 0;
    ty.value = 0;
    savedTx.value = 0;
    savedTy.value = 0;
    setHeaderVisible(true);
    setUrl(null);
    setFailed(false);
    if (!path) {
      setFailed(true);
      return;
    }
    let attivo = true;
    signer(path)
      .then((u) => {
        if (attivo) setUrl(u);
      })
      .catch(() => {
        if (attivo) setFailed(true);
      });
    return () => {
      attivo = false;
    };
    // Le shared value sono ref stabili: la dipendenza vera è l'apertura.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, path]);

  // Clamp della traslazione: la foto (cover dello schermo) non esce dai bordi.
  const clampTx = (v: number, s: number) => {
    'worklet';
    const max = (winW * (s - 1)) / 2;
    return Math.min(max, Math.max(-max, v));
  };
  const clampTy = (v: number, s: number) => {
    'worklet';
    const max = (winH * (s - 1)) / 2;
    return Math.min(max, Math.max(-max, v));
  };

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.min(MAX_SCALE, Math.max(0.8, savedScale.value * e.scale));
    })
    .onEnd(() => {
      if (scale.value < 1) {
        scale.value = withSpring(1);
        tx.value = withSpring(0);
        ty.value = withSpring(0);
        savedScale.value = 1;
        savedTx.value = 0;
        savedTy.value = 0;
      } else {
        savedScale.value = scale.value;
        tx.value = clampTx(tx.value, scale.value);
        ty.value = clampTy(ty.value, scale.value);
        savedTx.value = tx.value;
        savedTy.value = ty.value;
      }
    });

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      // Da non zoomati il clamp è 0: il pan non sposta nulla (voluto).
      tx.value = clampTx(savedTx.value + e.translationX, scale.value);
      ty.value = clampTy(savedTy.value + e.translationY, scale.value);
    })
    .onEnd(() => {
      savedTx.value = tx.value;
      savedTy.value = ty.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      const target = scale.value > 1 ? 1 : DOUBLE_TAP_SCALE;
      scale.value = withTiming(target, { duration: 180 });
      savedScale.value = target;
      tx.value = withTiming(0, { duration: 180 });
      ty.value = withTiming(0, { duration: 180 });
      savedTx.value = 0;
      savedTy.value = 0;
    });

  const singleTap = Gesture.Tap()
    .onEnd(() => {
      setHeaderVisible((v) => !v);
    })
    .runOnJS(true);

  const gesto = Gesture.Race(
    Gesture.Exclusive(doubleTap, singleTap),
    Gesture.Simultaneous(pinch, pan),
  );

  const stileImg = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <GestureHandlerRootView style={styles.root}>
        {failed ? (
          <View style={styles.center}>
            <Ionicons name="image-outline" size={40} color={colors.muted} />
            <Text style={styles.fallbackText}>Foto non più disponibile</Text>
          </View>
        ) : url ? (
          <GestureDetector gesture={gesto}>
            <Animated.View style={[styles.center, stileImg]}>
              <Image
                source={{ uri: url, cacheKey: path ?? undefined }}
                style={{ width: winW, height: winH }}
                contentFit="contain"
                cachePolicy="memory-disk"
                onError={() => setFailed(true)}
              />
            </Animated.View>
          </GestureDetector>
        ) : (
          <View style={styles.center}>
            <ActivityIndicator color={colors.ink} size="large" />
          </View>
        )}

        {headerVisible ? (
          <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
            <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
              <Ionicons name="close" size={26} color="#ffffff" />
            </Pressable>
            {caption ? (
              <Text style={styles.caption} numberOfLines={2}>
                {caption}
              </Text>
            ) : null}
          </View>
        ) : null}
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  closeBtn: { padding: 4 },
  caption: {
    flex: 1,
    color: '#ffffff',
    fontSize: fontSize.sm,
    fontFamily: fontFamily.sans,
  },
  fallbackText: { color: colors.muted, fontSize: fontSize.base, fontFamily: fontFamily.sans },
});
