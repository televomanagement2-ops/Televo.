// =============================================================================
// CommentInput — pillola "Commenta..." + composer a layer assoluto (M12 / LM6).
// =============================================================================
// Stato compresso: pillola semi-trasparente in basso a sinistra. Tap → il
// parent (LiveSurface) monta CommentComposer come layer assoluto alla radice
// dello schermo, sopra i controlli. NIENTE Modal: dentro un Modal trasparente
// Android il resize della finestra non è affidabile e la tastiera copre
// l'input. La barra segue la tastiera con useAnimatedKeyboard (translateY
// esplicito, identico su iOS e Android). L'errore del trigger (rate-limit
// 5/30s, commenti spenti, live in pausa…) si mostra INLINE nell'overlay, mai
// un modal sopra la diretta. L'invio delega a useLiveComments (insert +
// moderazione).

import { useEffect, useState } from 'react';
import {
  BackHandler,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { liveErrorMessage } from '@/lib/errors';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';

const MAX_COMMENTO = 200;

/** Pillola compressa: apre il composer (montato dal parent a livello schermo). */
export function CommentInput({ onApri }: { onApri: () => void }) {
  return (
    <Pressable style={styles.pillola} onPress={onApri}>
      <Ionicons name="chatbubble-outline" size={16} color={colors.muted} />
      <Text style={styles.pillolaTesto}>Commenta...</Text>
    </Pressable>
  );
}

interface ComposerProps {
  /** Invia il commento (throw = errore mostrato inline). */
  onInvia: (body: string) => Promise<void>;
  onChiudi: () => void;
}

/**
 * Layer di scrittura full-screen: backdrop che chiude + barra input incollata
 * alla tastiera. Va montato alla RADICE dello schermo live (riempie tutto lo
 * schermo); montarlo solo quando serve, così useAnimatedKeyboard non prende
 * il controllo della tastiera nel resto dell'app.
 */
export function CommentComposer({ onInvia, onChiudi }: ComposerProps) {
  const insets = useSafeAreaInsets();
  const [testo, setTesto] = useState('');
  const [errore, setErrore] = useState<string | null>(null);
  const [inVolo, setInVolo] = useState(false);

  const tastiera = useAnimatedKeyboard();
  const stileBarra = useAnimatedStyle(() => ({
    transform: [{ translateY: -tastiera.height.value }],
  }));

  // Back hardware Android: chiude il composer, non lo schermo live.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onChiudi();
      return true;
    });
    return () => sub.remove();
  }, [onChiudi]);

  const invia = async () => {
    const body = testo.trim();
    if (!body || inVolo) return;
    setInVolo(true);
    setErrore(null);
    try {
      await onInvia(body);
      setTesto('');
      onChiudi();
    } catch (e) {
      setErrore(liveErrorMessage(e));
    } finally {
      setInVolo(false);
    }
  };

  return (
    <View style={styles.layer}>
      {/* Backdrop: tap fuori chiude (la diretta resta visibile dietro). */}
      <Pressable style={styles.backdrop} onPress={onChiudi} />
      <Animated.View style={stileBarra}>
        <BlurView
          intensity={40}
          tint="dark"
          style={[styles.barra, { paddingBottom: Math.max(spacing.xl, insets.bottom + spacing.md) }]}
        >
          {errore ? <Text style={styles.errore}>{errore}</Text> : null}
          <View style={styles.rigaInput}>
            <TextInput
              value={testo}
              onChangeText={setTesto}
              placeholder="Commenta..."
              placeholderTextColor={colors.faint}
              selectionColor={colors.accent}
              style={styles.input}
              maxLength={MAX_COMMENTO}
              autoFocus
              multiline={false}
              returnKeyType="send"
              onSubmitEditing={() => void invia()}
            />
            <Pressable
              onPress={() => void invia()}
              disabled={!testo.trim() || inVolo}
              style={[styles.invia, (!testo.trim() || inVolo) && styles.inviaOff]}
              hitSlop={6}
            >
              <Ionicons name="arrow-up" size={20} color="#ffffff" />
            </Pressable>
          </View>
        </BlurView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  pillola: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  pillolaTesto: { color: colors.muted, fontSize: fontSize.sm, fontFamily: fontFamily.medium },

  layer: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end', zIndex: 10 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.25)' },
  barra: {
    // Fallback Android (blur non nativo): il velo scuro tiene leggibile l'input.
    backgroundColor: Platform.OS === 'android' ? 'rgba(10,11,15,0.92)' : 'rgba(10,11,15,0.35)',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.sm,
    overflow: 'hidden',
  },
  rigaInput: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  input: {
    flex: 1,
    color: colors.ink,
    fontSize: fontSize.base,
    fontFamily: fontFamily.sans,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: Platform.OS === 'ios' ? spacing.md : spacing.sm,
  },
  invia: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviaOff: { opacity: 0.4 },
  errore: { color: colors.danger, fontSize: fontSize.xs, fontFamily: fontFamily.medium },
});
