// =============================================================================
// StepNotifiche — priming permesso notifiche (stile BeReal). Facoltativo: si
// può saltare. La registrazione del device token vera arriverà con le notifiche
// (M8); qui chiediamo solo il permesso e chiudiamo l'onboarding.
// =============================================================================

import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import { Button } from '@/components/ui/Button';
import { StepLayout } from './StepLayout';
import { colors, fontFamily, fontSize, spacing } from '@/constants/theme';

export function StepNotifiche({ onFinish }: { onFinish: () => void }) {
  const [loading, setLoading] = useState(false);

  const enable = async () => {
    setLoading(true);
    try {
      await Notifications.requestPermissionsAsync();
    } catch {
      // niente permesso / non disponibile: prosegui comunque.
    } finally {
      setLoading(false);
      onFinish();
    }
  };

  return (
    <StepLayout
      title="Resta nel momento"
      subtitle="Ti avvisiamo solo quando conta. Niente notifiche-spazzatura, promesso."
      footer={
        <>
          <Button label="Attiva le notifiche" onPress={enable} loading={loading} />
          <Button label="Più tardi" variant="ghost" onPress={onFinish} />
        </>
      }
    >
      <InfoRow title="Un amico va in live" body="Sai quando c'è qualcuno con cui stare, ora." />
      <InfoRow title="Hai ricevuto un prop" body="Quando qualcuno apprezza la tua presenza." />
      <InfoRow title="Solo l'essenziale" body="Decidi tu cosa ricevere, quando vuoi." />
    </StepLayout>
  );
}

function InfoRow({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.row}>
      <View style={styles.dot} />
      <View style={styles.texts}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.md },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.accent,
    marginTop: 5,
  },
  texts: { flex: 1 },
  title: { color: colors.ink, fontSize: fontSize.base, fontFamily: fontFamily.semibold },
  body: {
    color: colors.muted,
    fontSize: fontSize.sm,
    fontFamily: fontFamily.sans,
    marginTop: 2,
    lineHeight: 19,
  },
});
