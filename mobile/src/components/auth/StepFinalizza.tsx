// =============================================================================
// StepFinalizza — secondo dei DUE step di registrazione: foto profilo FACOLTATIVA
// + consensi GDPR + finalizzazione (complete_onboarding). Look leggero/arioso.
// Qui si chiude l'onboarding: record_consent + complete_onboarding (età + username
// + birth_date + redeem invito, atomico lato DB) + upload foto se presente.
// =============================================================================

import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/components/ui/Button';
import {
  completeOnboarding,
  recordConsent,
  uploadAvatar,
  setAvatarUrl,
  authErrorMessage,
} from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useOnboardingStore } from '@/store/onboardingStore';
import { useAuth } from '@/hooks/useAuth';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';

export function StepFinalizza({ onDone }: { onDone: () => void }) {
  const store = useOnboardingStore();
  const { refreshProfile } = useAuth();
  const [uri, setUri] = useState<string | null>(store.avatarUri);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const ready = store.consentPrivacy && store.consentTos && !loading;

  const pick = async () => {
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
    setUri(asset.uri);
    store.patch({
      avatarUri: asset.uri,
      avatarBase64: asset.base64 ?? null,
      avatarMime: asset.mimeType ?? 'image/jpeg',
    });
  };

  const submit = async () => {
    if (!ready) return;
    if (!store.birthDate) {
      setError('Manca la data di nascita, torna indietro.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await recordConsent('privacy', true);
      await recordConsent('tos', true);
      await completeOnboarding({
        username: store.username,
        displayName: store.displayName || null,
        birthDate: store.birthDate,
        inviteCode: store.inviteCode,
      });
      // Foto facoltativa: se manca o fallisce, si entra comunque.
      if (store.avatarBase64) {
        try {
          const { data } = await supabase.auth.getUser();
          if (data.user) {
            const url = await uploadAvatar(
              data.user.id,
              store.avatarBase64,
              store.avatarMime ?? 'image/jpeg',
            );
            await setAvatarUrl(data.user.id, url);
          }
        } catch {
          // non blocca l'ingresso: la foto si aggiunge dopo.
        }
      }
      await refreshProfile();
      onDone();
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Ci siamo</Text>
      <Text style={styles.subtitle}>Una foto (se vuoi) e le regole. Poi sei dentro.</Text>

      {/* Foto opzionale */}
      <View style={styles.photoWrap}>
        <Pressable onPress={pick} style={styles.circle}>
          {uri ? (
            <Image source={{ uri }} style={styles.img} />
          ) : (
            <Ionicons name="camera" size={28} color={colors.muted} />
          )}
          <View style={styles.badge}>
            <Ionicons name={uri ? 'pencil' : 'add'} size={14} color="#ffffff" />
          </View>
        </Pressable>
        <Text style={styles.hint}>{uri ? 'Tocca per cambiare' : 'Foto profilo (facoltativa)'}</Text>
      </View>

      {/* Consensi */}
      <View style={styles.checks}>
        <Check
          label="Ho letto la Privacy Policy"
          checked={store.consentPrivacy}
          onToggle={() => store.patch({ consentPrivacy: !store.consentPrivacy })}
        />
        <Check
          label="Accetto i Termini di Servizio"
          checked={store.consentTos}
          onToggle={() => store.patch({ consentTos: !store.consentTos })}
        />
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.footer}>
        <Button label="Accetto ed entro" onPress={submit} loading={loading} disabled={!ready} />
      </View>
    </View>
  );
}

function Check({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
  return (
    <Pressable style={styles.checkRow} onPress={onToggle} hitSlop={6}>
      <View style={[styles.box, checked && styles.boxOn]}>
        {checked ? <Text style={styles.tick}>✓</Text> : null}
      </View>
      <Text style={styles.checkLabel}>{label}</Text>
    </Pressable>
  );
}

const AVATAR = 96;

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: spacing.lg },
  title: { color: colors.ink, fontSize: fontSize['2xl'], fontFamily: fontFamily.displayBold, letterSpacing: 0.2 },
  subtitle: { color: colors.muted, fontSize: fontSize.base, fontFamily: fontFamily.sans, marginTop: spacing.xs },
  photoWrap: { alignItems: 'center', marginTop: spacing['2xl'] },
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
    right: 0,
    bottom: 0,
    width: 30,
    height: 30,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
    borderWidth: 3,
    borderColor: colors.base,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: { color: colors.muted, fontSize: fontSize.sm, fontFamily: fontFamily.sans, marginTop: spacing.md },
  checks: { marginTop: spacing['2xl'] },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  box: {
    width: 24,
    height: 24,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  tick: { color: '#ffffff', fontSize: fontSize.sm, fontFamily: fontFamily.displayBold },
  checkLabel: { color: colors.ink, fontSize: fontSize.base, fontFamily: fontFamily.sans, flexShrink: 1 },
  error: { color: colors.danger, fontSize: fontSize.sm, fontFamily: fontFamily.sans, marginTop: spacing.md },
  footer: { marginTop: spacing.xl, marginBottom: spacing.lg },
});
