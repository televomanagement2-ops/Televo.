// =============================================================================
// Modifica profilo — l'utente aggiorna nome, username, bio breve e foto.
// =============================================================================
// Scrive SOLO le colonne con GRANT update (display_name, username, status_text,
// avatar_url). La foto passa da expo-image-picker → uploadAvatar (Storage) →
// avatar_url. Lo username è validato lato client (regex DB) + check di unicità;
// l'errore di unicità del DB è gestito con messaggio in italiano (niente crash).

import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import { useMyProfile, useUpdateProfile } from '@/hooks/useProfilo';
import {
  isUsernameAvailable,
  uploadAvatar,
  authErrorMessage,
} from '@/lib/auth';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';

const USERNAME_RE = /^[a-z0-9_.]{3,20}$/;
const STATUS_MAX = 140;

export default function ModificaProfilo() {
  const router = useRouter();
  const { session } = useAuth();
  const uid = session?.user.id;
  const { data: profile } = useMyProfile();
  const update = useUpdateProfile();

  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [username, setUsername] = useState(profile?.username ?? '');
  const [statusText, setStatusText] = useState(profile?.status_text ?? '');
  const [avatarUri, setAvatarUri] = useState<string | null>(profile?.avatar_url ?? null);
  const [avatarBase64, setAvatarBase64] = useState<string | null>(null);
  const [avatarMime, setAvatarMime] = useState<string>('image/jpeg');

  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      base64: true,
    });
    if (res.canceled) return;
    const asset = res.assets?.[0];
    if (!asset) return;
    setAvatarUri(asset.uri);
    setAvatarBase64(asset.base64 ?? null);
    setAvatarMime(asset.mimeType ?? 'image/jpeg');
  };

  const onSave = async () => {
    setFormError(null);
    setUsernameError(null);
    if (!uid) return;

    const uname = username.trim().toLowerCase();
    if (!USERNAME_RE.test(uname)) {
      setUsernameError('Username non valido (3–20: lettere minuscole, numeri, _ o .).');
      return;
    }

    setSaving(true);
    try {
      // Username cambiato → verifica disponibilità prima dello update.
      if (uname !== profile?.username) {
        const free = await isUsernameAvailable(uname);
        if (!free) {
          setUsernameError('Questo username è già preso.');
          setSaving(false);
          return;
        }
      }

      // Se è stata scelta una nuova foto, caricala e ottieni l'URL pubblico.
      let avatarUrl = profile?.avatar_url ?? null;
      if (avatarBase64) {
        avatarUrl = await uploadAvatar(uid, avatarBase64, avatarMime);
      }

      await update.mutateAsync({
        display_name: displayName.trim() || null,
        username: uname,
        status_text: statusText.trim() || null,
        avatar_url: avatarUrl,
      });

      router.back();
    } catch (e) {
      // Unicità username forzata anche a DB (vincolo): mappiamo il messaggio.
      const msg = authErrorMessage(e);
      const raw = String((e as { message?: string })?.message ?? e).toLowerCase();
      if (raw.includes('duplicate') || raw.includes('unique') || raw.includes('username')) {
        setUsernameError('Questo username è già preso.');
      } else {
        setFormError(msg || 'Qualcosa è andato storto. Riprova.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>Modifica profilo</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Foto */}
        <View style={styles.photoWrap}>
          <Pressable onPress={pickPhoto} style={styles.circle}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.img} />
            ) : (
              <Ionicons name="camera" size={30} color={colors.muted} />
            )}
            <View style={styles.badge}>
              <Ionicons name={avatarUri ? 'pencil' : 'add'} size={15} color="#ffffff" />
            </View>
          </Pressable>
          <Text style={styles.photoHint}>{avatarUri ? 'Tocca per cambiare' : 'Tocca per aggiungere'}</Text>
        </View>

        <Input
          label="Nome"
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Il tuo nome"
          maxLength={40}
          containerStyle={styles.field}
        />
        <Input
          label="Username"
          value={username}
          onChangeText={(t) => setUsername(t.toLowerCase())}
          placeholder="username"
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={20}
          error={usernameError}
          containerStyle={styles.field}
        />
        <Input
          label="Bio"
          value={statusText}
          onChangeText={setStatusText}
          placeholder="Una riga su di te"
          maxLength={STATUS_MAX}
          multiline
          containerStyle={styles.field}
        />
        <Text style={styles.counter}>
          {statusText.length}/{STATUS_MAX}
        </Text>

        {formError ? <Text style={styles.formError}>{formError}</Text> : null}

        <View style={styles.saveWrap}>
          <Button label="Salva" onPress={onSave} loading={saving} />
        </View>
        {saving ? (
          <View style={styles.savingRow}>
            <ActivityIndicator color={colors.muted} size="small" />
            <Text style={styles.savingText}>Salvataggio…</Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const AVATAR = 120;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.base },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  headerTitle: { color: colors.ink, fontSize: fontSize.lg, fontFamily: fontFamily.semibold },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing['3xl'], gap: spacing.md },

  photoWrap: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg },
  circle: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  img: { width: AVATAR, height: AVATAR, borderRadius: radius.full },
  badge: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 34,
    height: 34,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
    borderWidth: 3,
    borderColor: colors.base,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoHint: { color: colors.muted, fontSize: fontSize.sm, fontFamily: fontFamily.sans },

  field: { marginTop: spacing.xs },
  counter: {
    color: colors.faint,
    fontSize: fontSize.xs,
    fontFamily: fontFamily.medium,
    textAlign: 'right',
    marginRight: spacing.xs,
  },
  formError: { color: colors.danger, fontFamily: fontFamily.sans, fontSize: fontSize.sm },
  saveWrap: { marginTop: spacing.lg },
  savingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.sm },
  savingText: { color: colors.muted, fontFamily: fontFamily.sans, fontSize: fontSize.sm },
});
