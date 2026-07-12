// =============================================================================
// CoHostSheet — invito e gestione dei co-host (M12 / LM6, live.md §4).
// =============================================================================
// Due modalità sullo stesso foglio (stessa lista amici, stessa estetica):
//  - 'selezione' (composer): si SCELGONO fino a 3 amici da invitare all'avvio
//    (tetto 4 host totali col principale); nessuna RPC, solo stato locale.
//  - 'gestione' (live in corso): la verità sono le righe live_hosts (visibili
//    per intero all'host via RLS): Invita/Revoca/Rimuovi chiamano le RPC/Edge
//    del parent e la lista si rilegge dopo ogni azione. L'invito va accettato
//    (§4): finché è 'invited' conta nel tetto ma non pubblica.

import { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Avatar } from '@/components/ui/Avatar';
import { useAmici } from '@/hooks/useAmici';
import { avvisa, conferma } from '@/lib/dialoghi';
import { liveErrorMessage } from '@/lib/errors';
import { fetchRigheCoHost, type RigaCoHost } from '@/lib/live';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';

/** Massimo di co-host oltre l'host principale (tetto 4 host totali). */
export const MAX_COHOST = 3;

interface PropsBase {
  visible: boolean;
  onClose: () => void;
}

interface PropsSelezione extends PropsBase {
  mode: 'selezione';
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

interface PropsGestione extends PropsBase {
  mode: 'gestione';
  liveId: string;
  /** Invita un amico (RPC live_invite_cohost). Throw = errore mostrato. */
  onInvita: (userId: string) => Promise<void>;
  /** Revoca un invito o rimuove un co-host attivo (RPC / Edge live-kick). */
  onRimuovi: (userId: string, status: RigaCoHost['status']) => Promise<void>;
}

type Props = PropsSelezione | PropsGestione;

export function CoHostSheet(props: Props) {
  const { visible, onClose } = props;
  const { data: amici } = useAmici();

  // Solo 'gestione': righe live_hosts correnti (invited/active per il tetto).
  const [righe, setRighe] = useState<RigaCoHost[]>([]);
  const [inAzione, setInAzione] = useState<string | null>(null);

  // Chiave stabile: `props` cambia identità a ogni render del parent (eventi
  // Room frequenti) e non deve rifar partire il fetch delle righe.
  const gestioneLiveId = props.mode === 'gestione' ? props.liveId : null;
  const ricarica = useCallback(() => {
    if (!gestioneLiveId) return;
    fetchRigheCoHost(gestioneLiveId)
      .then(setRighe)
      .catch(() => {});
  }, [gestioneLiveId]);

  useEffect(() => {
    if (visible) ricarica();
  }, [visible, ricarica]);

  if (!visible) return null;

  const occupati =
    props.mode === 'gestione'
      ? righe.filter((r) => r.status === 'invited' || r.status === 'active').length
      : props.selectedIds.length + 1; // +1 = host principale
  const pieno = occupati >= MAX_COHOST + 1;

  const toggleSelezione = (userId: string) => {
    if (props.mode !== 'selezione') return;
    const gia = props.selectedIds.includes(userId);
    if (gia) props.onChange(props.selectedIds.filter((id) => id !== userId));
    else if (props.selectedIds.length < MAX_COHOST) props.onChange([...props.selectedIds, userId]);
  };

  const invita = (userId: string) => {
    if (props.mode !== 'gestione') return;
    setInAzione(userId);
    props
      .onInvita(userId)
      .then(ricarica)
      .catch((e) => avvisa('Ops', liveErrorMessage(e)))
      .finally(() => setInAzione(null));
  };

  const rimuovi = (userId: string, nome: string, status: RigaCoHost['status']) => {
    if (props.mode !== 'gestione') return;
    const attivo = status === 'active';
    conferma({
      titolo: attivo ? `Rimuovere ${nome} dalla live?` : `Revocare l’invito a ${nome}?`,
      messaggio: attivo ? 'Smetterà subito di trasmettere e non potrà rientrare.' : undefined,
      confermaLabel: attivo ? 'Rimuovi' : 'Revoca',
      distruttiva: attivo,
      onConferma: () => {
        setInAzione(userId);
        props
          .onRimuovi(userId, status)
          .then(ricarica)
          .catch((e) => avvisa('Ops', liveErrorMessage(e)))
          .finally(() => setInAzione(null));
      },
    });
  };

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <BottomSheet onClose={onClose}>
        <Text style={styles.titolo}>Co-Live</Text>
        <Text style={styles.sub}>
          {props.mode === 'selezione'
            ? `Scegli fino a ${MAX_COHOST} amici da invitare (trasmetterete insieme).`
            : pieno
              ? 'La live è al completo (massimo 4 host).'
              : 'Invita un amico a trasmettere con te. Deve accettare per entrare in onda.'}
        </Text>

        <ScrollView style={styles.lista} showsVerticalScrollIndicator={false}>
          {(amici ?? []).map((a) => {
            const nome = a.displayName ?? a.username;
            const riga =
              props.mode === 'gestione' ? righe.find((r) => r.userId === a.id) : undefined;
            const stato = riga?.status;
            const selezionato = props.mode === 'selezione' && props.selectedIds.includes(a.id);
            const occupato = inAzione === a.id;

            return (
              <View key={a.id} style={styles.riga}>
                <Avatar uri={a.avatarUrl} name={nome} size={40} />
                <View style={styles.testi}>
                  <Text style={styles.nome} numberOfLines={1}>
                    {nome}
                  </Text>
                  {stato === 'invited' ? (
                    <Text style={styles.statoInvitato}>Invitato — in attesa</Text>
                  ) : stato === 'active' ? (
                    <Text style={styles.statoAttivo}>In onda con te</Text>
                  ) : null}
                </View>

                {props.mode === 'selezione' ? (
                  <Pressable
                    onPress={() => toggleSelezione(a.id)}
                    disabled={!selezionato && props.selectedIds.length >= MAX_COHOST}
                    style={[
                      styles.check,
                      selezionato && styles.checkOn,
                      !selezionato && props.selectedIds.length >= MAX_COHOST && styles.azioneOff,
                    ]}
                    hitSlop={6}
                  >
                    {selezionato ? <Text style={styles.checkTesto}>✓</Text> : null}
                  </Pressable>
                ) : stato === 'invited' || stato === 'active' ? (
                  <Pressable
                    onPress={() => rimuovi(a.id, nome, stato)}
                    disabled={occupato}
                    style={[styles.azioneDanger, occupato && styles.azioneOff]}
                  >
                    <Text style={styles.azioneDangerTesto}>
                      {stato === 'active' ? 'Rimuovi' : 'Revoca'}
                    </Text>
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={() => invita(a.id)}
                    disabled={pieno || occupato}
                    style={[styles.azione, (pieno || occupato) && styles.azioneOff]}
                  >
                    <Text style={styles.azioneTesto}>Invita</Text>
                  </Pressable>
                )}
              </View>
            );
          })}
          {(amici ?? []).length === 0 ? (
            <Text style={styles.vuoto}>Aggiungi degli amici per fare una Co-Live.</Text>
          ) : null}
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
  testi: { flex: 1, gap: 1 },
  nome: { color: colors.ink, fontSize: fontSize.base, fontFamily: fontFamily.medium },
  statoInvitato: { color: colors.warning, fontSize: fontSize.xs, fontFamily: fontFamily.medium },
  statoAttivo: { color: colors.success, fontSize: fontSize.xs, fontFamily: fontFamily.medium },
  azione: {
    borderRadius: radius.full,
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.lg,
    paddingVertical: 6,
  },
  azioneTesto: { color: '#ffffff', fontSize: fontSize.sm, fontFamily: fontFamily.semibold },
  azioneDanger: {
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.danger,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  azioneDangerTesto: { color: colors.danger, fontSize: fontSize.sm, fontFamily: fontFamily.semibold },
  azioneOff: { opacity: 0.4 },
  check: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkTesto: { color: '#ffffff', fontSize: fontSize.sm, fontFamily: fontFamily.semibold },
  vuoto: {
    color: colors.faint,
    fontSize: fontSize.sm,
    fontFamily: fontFamily.sans,
    paddingVertical: spacing.md,
  },
});
