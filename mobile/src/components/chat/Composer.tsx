// =============================================================================
// Composer — barra di composizione in fondo alla chat.
// =============================================================================
// Testo (M1b) + vocali (M2) + foto (CM5). Tre modalità di input mutuamente
// esclusive dentro la stessa barra: idle (input testo + microfono/invio),
// recording (timer + stop), preview vocale (riascolta → annulla/invia). La
// foto selezionata appare come barra-anteprima sopra l'input (la caption si
// scrive nell'input, l'invio parte col bottone). Se l'utente è mutato/bannato
// (M8) il composer è disabilitato. Mostra la barra di risposta quando si sta
// rispondendo a un messaggio.

import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';

export interface ReplyPreview {
  author: string | null;
  text: string;
}

/** Anteprima del vocale appena registrato (prima dell'invio). */
export interface AudioPreview {
  seconds: number;
  onPlay: () => void;
  onDiscard: () => void;
  onSend: () => void;
  /** True mentre l'upload/invio è in corso. */
  sending?: boolean;
}

/** Anteprima del messaggio in MODIFICA (CM4, RC-05). */
export interface EditPreview {
  text: string;
}

/** Foto selezionata in attesa d'invio (CM5): l'input diventa la caption. */
export interface MediaPreview {
  uri: string;
  onDiscard: () => void;
}

interface Props {
  value: string;
  onChangeText: (t: string) => void;
  onSend: () => void;
  sending?: boolean;
  /** Se disabilitato (mutato/bannato) mostra l'avviso invece dell'input. */
  disabledReason?: string | null;
  reply?: ReplyPreview | null;
  onCancelReply?: () => void;
  /** Se presente, il composer è in modalità MODIFICA: l'invio aggiorna il
   *  messaggio (niente mic/allegati — si edita solo testo). */
  editing?: EditPreview | null;
  onCancelEdit?: () => void;
  /** Tap sulla graffetta allegati → picker foto (CM5). */
  onAttach?: () => void;
  /** Foto selezionata (CM5): barra-anteprima sopra l'input, invio col bottone. */
  mediaPreview?: MediaPreview | null;
  /** Riferimento a un drop precompilato (DM5, "Rispondi in privato"): chip sopra
   *  l'input; il prossimo messaggio lo porta con sé (anche senza testo). */
  dropRefPreview?: { text: string } | null;
  onCancelDropRef?: () => void;
  // --- Vocali (M2) ---
  /** Avvia la registrazione (tap sul microfono). */
  onStartRecording?: () => void;
  /** Ferma la registrazione (tap su stop). */
  onStopRecording?: () => void;
  isRecording?: boolean;
  /** Secondi trascorsi mentre si registra. */
  recordingSeconds?: number;
  /** Se presente, siamo in fase di anteprima del vocale registrato. */
  audioPreview?: AudioPreview | null;
}

/** secondi → "m:ss". */
function mmss(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function Composer({
  value,
  onChangeText,
  onSend,
  sending,
  disabledReason,
  reply,
  onCancelReply,
  editing,
  onCancelEdit,
  onAttach,
  mediaPreview,
  dropRefPreview,
  onCancelDropRef,
  onStartRecording,
  onStopRecording,
  isRecording,
  recordingSeconds = 0,
  audioPreview,
}: Props) {
  if (disabledReason) {
    return (
      <View style={styles.disabledBar}>
        <Ionicons name="volume-mute-outline" size={18} color={colors.muted} />
        <Text style={styles.disabledText}>{disabledReason}</Text>
      </View>
    );
  }

  const hasText = value.trim().length > 0;
  // Con una foto in anteprima O un drop da inoltrare l'invio è sempre possibile
  // (caption/nota opzionale).
  const canSendText = (hasText || !!mediaPreview || !!dropRefPreview) && !sending;

  return (
    <View style={styles.wrap}>
      {editing ? (
        // Barra di modifica (CM4): speculare alla risposta, con la matita.
        <View style={styles.replyBar}>
          <Ionicons name="pencil" size={16} color={colors.accent} />
          <View style={styles.replyBody}>
            <Text style={styles.replyAuthor}>Modifica messaggio</Text>
            <Text style={styles.replyText} numberOfLines={1}>
              {editing.text}
            </Text>
          </View>
          <Pressable onPress={onCancelEdit} hitSlop={8}>
            <Ionicons name="close" size={18} color={colors.muted} />
          </Pressable>
        </View>
      ) : reply ? (
        <View style={styles.replyBar}>
          <View style={styles.replyLine} />
          <View style={styles.replyBody}>
            {reply.author ? <Text style={styles.replyAuthor}>{reply.author}</Text> : null}
            <Text style={styles.replyText} numberOfLines={1}>
              {reply.text}
            </Text>
          </View>
          <Pressable onPress={onCancelReply} hitSlop={8}>
            <Ionicons name="close" size={18} color={colors.muted} />
          </Pressable>
        </View>
      ) : null}

      {mediaPreview && !audioPreview && !isRecording ? (
        // --- Foto in attesa d'invio (CM5): thumbnail + hint caption ---
        <View style={styles.replyBar}>
          <Image source={{ uri: mediaPreview.uri }} style={styles.mediaThumb} contentFit="cover" />
          <View style={styles.replyBody}>
            <Text style={styles.replyAuthor}>Foto</Text>
            <Text style={styles.replyText} numberOfLines={1}>
              Aggiungi una didascalia, se vuoi
            </Text>
          </View>
          <Pressable onPress={mediaPreview.onDiscard} hitSlop={8}>
            <Ionicons name="close" size={18} color={colors.muted} />
          </Pressable>
        </View>
      ) : null}

      {dropRefPreview && !editing && !mediaPreview && !audioPreview && !isRecording ? (
        // --- Drop precompilato (DM5, "Rispondi in privato") ---
        <View style={styles.replyBar}>
          <Ionicons name="sparkles-outline" size={16} color={colors.accent} />
          <View style={styles.replyBody}>
            <Text style={styles.replyAuthor}>Rispondi al drop</Text>
            <Text style={styles.replyText} numberOfLines={1}>
              {dropRefPreview.text}
            </Text>
          </View>
          <Pressable onPress={onCancelDropRef} hitSlop={8}>
            <Ionicons name="close" size={18} color={colors.muted} />
          </Pressable>
        </View>
      ) : null}

      {audioPreview ? (
        // --- Anteprima vocale registrato ---
        <View style={styles.row}>
          <Pressable onPress={audioPreview.onDiscard} hitSlop={8} style={styles.iconBtn}>
            <Ionicons name="trash-outline" size={22} color={colors.danger} />
          </Pressable>
          <Pressable onPress={audioPreview.onPlay} style={styles.previewPill}>
            <Ionicons name="play" size={18} color={colors.ink} />
            <Text style={styles.previewText}>Vocale {mmss(audioPreview.seconds)}</Text>
          </Pressable>
          <Pressable
            onPress={audioPreview.onSend}
            disabled={audioPreview.sending}
            style={({ pressed }) => [
              styles.send,
              styles.sendActive,
              pressed && styles.pressed,
              audioPreview.sending && styles.pressed,
            ]}
          >
            <Ionicons name="arrow-up" size={20} color="#ffffff" />
          </Pressable>
        </View>
      ) : isRecording ? (
        // --- Registrazione in corso ---
        <View style={styles.row}>
          <View style={styles.recordingBar}>
            <View style={styles.recDot} />
            <Text style={styles.recText}>Registrando… {mmss(recordingSeconds)}</Text>
          </View>
          <Pressable onPress={onStopRecording} style={[styles.send, styles.stopBtn]}>
            <Ionicons name="stop" size={18} color="#ffffff" />
          </Pressable>
        </View>
      ) : (
        // --- Idle: graffetta allegati + input testo + microfono / invio ---
        // In MODIFICA niente allegati né mic: si edita solo il testo (RC-05).
        <View style={styles.row}>
          {/* La graffetta compare solo se il chiamante gestisce gli allegati
              (chat). I commenti drop (DM3) riusano il Composer senza foto: non
              passano onAttach → niente pulsante, testo + vocale soltanto. */}
          {!editing && onAttach ? (
            <Pressable
              onPress={onAttach}
              style={({ pressed }) => [styles.attachBtn, pressed && styles.pressed]}
              hitSlop={6}
              accessibilityLabel="Allega"
            >
              <Ionicons name="add-circle-outline" size={26} color={colors.muted} />
            </Pressable>
          ) : null}
          <TextInput
            value={value}
            onChangeText={onChangeText}
            placeholder={
              mediaPreview
                ? 'Didascalia…'
                : dropRefPreview
                  ? 'Scrivi qualcosa, se vuoi…'
                  : 'Scrivi un messaggio…'
            }
            placeholderTextColor={colors.faint}
            selectionColor={colors.accent}
            style={styles.input}
            multiline
          />
          {hasText || editing || mediaPreview || dropRefPreview ? (
            <Pressable
              onPress={onSend}
              disabled={!canSendText}
              style={({ pressed }) => [
                styles.send,
                canSendText ? styles.sendActive : styles.sendInactive,
                pressed && canSendText && styles.pressed,
              ]}
            >
              <Ionicons
                name={editing ? 'checkmark' : 'arrow-up'}
                size={20}
                color={canSendText ? '#ffffff' : colors.faint}
              />
            </Pressable>
          ) : (
            <Pressable
              onPress={onStartRecording}
              style={({ pressed }) => [styles.send, styles.micBtn, pressed && styles.pressed]}
            >
              <Ionicons name="mic" size={20} color={colors.ink} />
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.base,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: radius.xl,
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
  send: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendActive: { backgroundColor: colors.accent },
  sendInactive: { backgroundColor: colors.elevated },
  micBtn: { backgroundColor: colors.elevated },
  stopBtn: { backgroundColor: colors.danger },
  pressed: { opacity: 0.85 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  // Graffetta allegati: stessa altezza dell'input/mic per allinearsi sulla base.
  attachBtn: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },

  // Registrazione
  recordingBar: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
  },
  recDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.danger },
  recText: { color: colors.ink, fontSize: fontSize.sm, fontFamily: fontFamily.sans },

  // Anteprima vocale
  previewPill: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
  },
  previewText: { color: colors.ink, fontSize: fontSize.sm, fontFamily: fontFamily.sans },

  disabledBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  disabledText: { color: colors.muted, fontSize: fontSize.sm, fontFamily: fontFamily.sans },

  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  replyLine: { width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: colors.accent },
  // Thumbnail della foto in attesa d'invio (CM5).
  mediaThumb: { width: 48, height: 48, borderRadius: radius.sm, backgroundColor: colors.elevated },
  replyBody: { flex: 1, gap: 2 },
  replyAuthor: { color: colors.accentSoft, fontSize: fontSize.xs, fontFamily: fontFamily.semibold },
  replyText: { color: colors.muted, fontSize: fontSize.sm, fontFamily: fontFamily.sans },
});
