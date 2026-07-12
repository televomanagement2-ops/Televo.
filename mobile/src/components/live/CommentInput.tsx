// =============================================================================
// CommentInput — pillola "Commenta..." + overlay di scrittura (M12 / LM6, §6).
// =============================================================================
// Stato compresso: pillola semi-trasparente in basso a sinistra. Tap → overlay
// in vetro smerigliato (BlurView; su Android degrada a velo scuro traslucido)
// con tastiera e invio. L'errore del trigger (rate-limit 5/30s, commenti
// spenti, live in pausa…) si mostra INLINE nell'overlay, mai un modal sopra la
// diretta. L'invio delega a useLiveComments (insert + moderazione).

import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { liveErrorMessage } from '@/lib/errors';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';

const MAX_COMMENTO = 200;

interface Props {
  /** Invia il commento (throw = errore mostrato inline). */
  onInvia: (body: string) => Promise<void>;
}

export function CommentInput({ onInvia }: Props) {
  const [aperto, setAperto] = useState(false);
  const [testo, setTesto] = useState('');
  const [errore, setErrore] = useState<string | null>(null);
  const [inVolo, setInVolo] = useState(false);

  const chiudi = () => {
    setAperto(false);
    setErrore(null);
  };

  const invia = async () => {
    const body = testo.trim();
    if (!body || inVolo) return;
    setInVolo(true);
    setErrore(null);
    try {
      await onInvia(body);
      setTesto('');
      chiudi();
    } catch (e) {
      setErrore(liveErrorMessage(e));
    } finally {
      setInVolo(false);
    }
  };

  return (
    <>
      <Pressable style={styles.pillola} onPress={() => setAperto(true)}>
        <Ionicons name="chatbubble-outline" size={16} color={colors.muted} />
        <Text style={styles.pillolaTesto}>Commenta...</Text>
      </Pressable>

      <Modal transparent visible={aperto} animationType="fade" onRequestClose={chiudi}>
        {/* Backdrop: tap fuori chiude (la diretta resta visibile dietro). */}
        <Pressable style={styles.backdrop} onPress={chiudi}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.avoiding}
            pointerEvents="box-none"
          >
            <Pressable onPress={() => {}}>
              <BlurView intensity={40} tint="dark" style={styles.barra}>
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
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </>
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

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'flex-end' },
  avoiding: { justifyContent: 'flex-end' },
  barra: {
    // Fallback Android (blur non nativo): il velo scuro tiene leggibile l'input.
    backgroundColor: Platform.OS === 'android' ? 'rgba(10,11,15,0.92)' : 'rgba(10,11,15,0.35)',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
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
