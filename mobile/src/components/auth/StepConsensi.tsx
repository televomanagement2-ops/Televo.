// =============================================================================
// StepConsensi — consensi GDPR + FINALIZZAZIONE dell'account.
// =============================================================================
// Qui si chiude l'onboarding: registriamo i consensi (record_consent) e poi
// chiamiamo complete_onboarding (età + username + birth_date + redeem invito,
// atomico lato DB). Alla riuscita il profilo è attivo (age_verified=true).

import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { StepLayout } from './StepLayout';
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

export function StepConsensi({ onNext }: { onNext: () => void }) {
  const store = useOnboardingStore();
  const { refreshProfile } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const ready = store.consentPrivacy && store.consentTos;

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
      // Foto profilo facoltativa: se manca o fallisce, si entra comunque.
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
          // non blocca l'ingresso: la foto si può aggiungere dopo.
        }
      }
      await refreshProfile();
      onNext();
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <StepLayout
      title="Un'ultima cosa"
      subtitle="Televo è uno spazio di persone vere. Accetta le regole per entrare."
      footer={
        <Button label="Accetto ed entro" onPress={submit} loading={loading} disabled={!ready} />
      }
    >
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
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </StepLayout>
  );
}

function Check({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable style={styles.checkRow} onPress={onToggle} hitSlop={6}>
      <View style={[styles.box, checked && styles.boxOn]}>
        {checked ? <Text style={styles.tick}>✓</Text> : null}
      </View>
      <Text style={styles.checkLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
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
});
