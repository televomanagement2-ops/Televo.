// =============================================================================
// StepFoto — foto profilo FACOLTATIVA. Si sceglie dalla galleria (ritaglio 1:1)
// e si tiene in store (uri per l'anteprima, base64 per l'upload a fine
// onboarding). Si può saltare e aggiungerla dopo.
// =============================================================================

import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/components/ui/Button';
import { StepLayout } from './StepLayout';
import { useOnboardingStore } from '@/store/onboardingStore';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';

export function StepFoto({ onNext }: { onNext: () => void }) {
  const store = useOnboardingStore();
  const [uri, setUri] = useState<string | null>(store.avatarUri);

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

  return (
    <StepLayout
      title="Metti una faccia"
      subtitle="Una foto aiuta gli amici a riconoscerti. È facoltativa: puoi aggiungerla anche dopo."
      footer={
        <>
          <Button label="Continua" onPress={onNext} />
          {!uri ? <Button label="Salta per ora" variant="ghost" onPress={onNext} /> : null}
        </>
      }
    >
      <View style={styles.center}>
        <Pressable onPress={pick} style={styles.circle}>
          {uri ? (
            <Image source={{ uri }} style={styles.img} />
          ) : (
            <Ionicons name="camera" size={32} color={colors.muted} />
          )}
          <View style={styles.badge}>
            <Ionicons name={uri ? 'pencil' : 'add'} size={16} color="#ffffff" />
          </View>
        </Pressable>
        <Text style={styles.hint}>{uri ? 'Tocca per cambiare' : 'Tocca per aggiungere'}</Text>
      </View>
    </StepLayout>
  );
}

const AVATAR = 132;

const styles = StyleSheet.create({
  center: { alignItems: 'center', marginTop: spacing.xl },
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
    right: 4,
    bottom: 4,
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
    borderWidth: 3,
    borderColor: colors.base,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: { color: colors.muted, fontSize: fontSize.sm, fontFamily: fontFamily.sans, marginTop: spacing.md },
});
