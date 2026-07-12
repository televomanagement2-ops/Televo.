// =============================================================================
// ListaSpettatori — chi sta guardando ORA, con kick (M12 / LM6, solo host).
// =============================================================================
// La lista nasce dai partecipanti LiveKit in stanza (identity = user_id,
// live.md §5) passati dal parent: è il dato istantaneo, senza query di stato.
// Qui si risolvono solo le identità in card profilo. "Rimuovi" = kick (§12.3):
// conferma → Edge live-kick (DB prima, media dopo). Il kickato non rientra e
// NON viene notificato (kick ≠ block, §11). Il numero di spettatori resta un
// dato del SOLO host (anti-vanity §1.2).

import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Avatar } from '@/components/ui/Avatar';
import { conferma, avvisa } from '@/lib/dialoghi';
import { liveErrorMessage } from '@/lib/errors';
import { fetchProfileCards } from '@/lib/social';
import type { ProfileCard } from '@/types';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Identità LiveKit degli spettatori in stanza (esclusi gli host attivi). */
  ids: string[];
  /** Esegue il kick (Edge live-kick, scope viewer). Throw = errore mostrato. */
  onKick: (userId: string) => Promise<void>;
}

export function ListaSpettatori({ visible, onClose, ids, onKick }: Props) {
  const [cards, setCards] = useState<Map<string, ProfileCard>>(new Map());
  const [inKick, setInKick] = useState<string | null>(null);

  // Risolve le identità in card profilo a ogni apertura/cambio stanza.
  useEffect(() => {
    if (!visible || ids.length === 0) return;
    let vivo = true;
    fetchProfileCards(ids)
      .then((m) => {
        if (vivo) setCards(m);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [visible, ids]);

  const kick = (userId: string, nome: string) => {
    conferma({
      titolo: `Rimuovere ${nome}?`,
      messaggio: 'Non potrà più rientrare in questa live. Non riceverà nessuna notifica.',
      confermaLabel: 'Rimuovi',
      distruttiva: true,
      onConferma: () => {
        setInKick(userId);
        onKick(userId)
          .catch((e) => avvisa('Ops', liveErrorMessage(e)))
          .finally(() => setInKick(null));
      },
    });
  };

  if (!visible) return null;

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <BottomSheet onClose={onClose}>
        <Text style={styles.titolo}>Spettatori</Text>
        <Text style={styles.sub}>
          {ids.length === 0
            ? 'Nessuno sta guardando in questo momento.'
            : `${ids.length} in stanza ora — lo vedi solo tu.`}
        </Text>
        <ScrollView style={styles.lista} showsVerticalScrollIndicator={false}>
          {ids.map((id) => {
            const card = cards.get(id);
            const nome = card?.displayName ?? card?.username ?? '…';
            return (
              <View key={id} style={styles.riga}>
                <Avatar uri={card?.avatarUrl} name={nome} size={40} />
                <Text style={styles.nome} numberOfLines={1}>
                  {nome}
                </Text>
                <Pressable
                  onPress={() => kick(id, nome)}
                  disabled={inKick === id}
                  style={[styles.rimuovi, inKick === id && styles.rimuoviOff]}
                >
                  <Text style={styles.rimuoviTesto}>Rimuovi</Text>
                </Pressable>
              </View>
            );
          })}
        </ScrollView>
      </BottomSheet>
    </Modal>
  );
}

const styles = StyleSheet.create({
  titolo: { color: colors.ink, fontSize: fontSize.lg, fontFamily: fontFamily.displayBold },
  sub: { color: colors.muted, fontSize: fontSize.sm, fontFamily: fontFamily.sans },
  lista: { marginTop: spacing.sm },
  riga: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  nome: { flex: 1, color: colors.ink, fontSize: fontSize.base, fontFamily: fontFamily.medium },
  rimuovi: {
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.danger,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  rimuoviOff: { opacity: 0.5 },
  rimuoviTesto: { color: colors.danger, fontSize: fontSize.sm, fontFamily: fontFamily.semibold },
});
