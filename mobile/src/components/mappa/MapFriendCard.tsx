// =============================================================================
// MapFriendCard — card di dettaglio di un punto sulla mappa (M7 / MM8).
// =============================================================================
// Tap su un'aura o su una bolla → bottom sheet (riuso BottomSheet/Modal come
// ShareSheet) con identità minima + anello Aura + tempo relativo ("2h fa",
// calibrato UTC) + azioni: Vedi profilo · Messaggio (map.md §6). Il "join stanza"
// arriverà con la UI Live (M4): finché non c'è la rotta stanza, mostriamo lo stato
// live ma non un pulsante che porterebbe a un vicolo cieco.
//
// La mappa NON crea contenuti: da qui si esce verso profilo/chat esistenti (RPC
// get_or_create_dm via useApriDm — DM solo tra amici, già garantito a monte).

import { Modal, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { AuraAvatarRing } from '@/components/aura/AuraAvatarRing';
import { useApriDm } from '@/hooks/useAmici';
import { avvisa } from '@/lib/dialoghi';
import { chatErrorMessage } from '@/lib/errors';
import { tempoRelativoCalibrato } from '@/lib/datetime';
import { statoAmico, type PuntoAmico, type PuntoEvento } from '@/store/mapStore';
import { dynamicRoutes } from '@/constants/routes';
import { colors, fontFamily, fontSize, spacing } from '@/constants/theme';

/** Cosa mostra la card: un amico, oppure un evento (con l'host se è un amico noto). */
export type SelezioneMappa =
  | { tipo: 'amico'; amico: PuntoAmico }
  | { tipo: 'evento'; evento: PuntoEvento; host: PuntoAmico | null };

interface Props {
  selezione: SelezioneMappa | null;
  /** "now" calibrato su server_now (map.md §8) per il tempo relativo. */
  nowMs: number;
  onClose: () => void;
}

export function MapFriendCard({ selezione, nowMs, onClose }: Props) {
  const router = useRouter();
  const apriDm = useApriDm();

  // L'utente al centro dell'azione: l'amico, o l'host della stanza.
  const persona: PuntoAmico | null =
    selezione?.tipo === 'amico'
      ? selezione.amico
      : selezione?.tipo === 'evento'
        ? selezione.host
        : null;

  const vaiAlProfilo = () => {
    if (!persona) return;
    onClose();
    router.push(dynamicRoutes.profiloUtente(persona.userId));
  };

  const messaggia = () => {
    if (!persona) return;
    apriDm.mutate(persona.userId, {
      onSuccess: (convId) => {
        onClose();
        router.push(dynamicRoutes.chat(convId));
      },
      onError: (e) => avvisa('Ops', chatErrorMessage(e)),
    });
  };

  return (
    <Modal
      visible={!!selezione}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <BottomSheet onClose={onClose}>
        {selezione?.tipo === 'amico' ? (
          <ContenutoAmico amico={selezione.amico} nowMs={nowMs} />
        ) : selezione?.tipo === 'evento' ? (
          <ContenutoEvento evento={selezione.evento} host={selezione.host} nowMs={nowMs} />
        ) : null}

        {persona ? (
          <View style={styles.azioni}>
            <Button label="Messaggio" onPress={messaggia} loading={apriDm.isPending} />
            <Button label="Vedi profilo" variant="secondary" onPress={vaiAlProfilo} />
          </View>
        ) : null}
      </BottomSheet>
    </Modal>
  );
}

// -----------------------------------------------------------------------------
// Contenuto: amico (aura piena/spenta + tempo relativo, "In zona" se mascherato).
// -----------------------------------------------------------------------------
function ContenutoAmico({ amico, nowMs }: { amico: PuntoAmico; nowMs: number }) {
  const live = statoAmico(amico, nowMs) === 'live';
  const nome = amico.displayName ?? amico.username ?? 'Amico';

  return (
    <View style={styles.intestazione}>
      <AuraAvatarRing percent={amico.auraScore ?? 0} size={64} still>
        <Avatar uri={amico.avatarUrl} name={amico.username ?? nome} size={64} />
      </AuraAvatarRing>
      <View style={styles.testi}>
        <Text style={styles.nome} numberOfLines={1}>
          {nome}
        </Text>
        {amico.username ? (
          <Text style={styles.username} numberOfLines={1}>
            @{amico.username}
          </Text>
        ) : null}
        <View style={styles.statoRiga}>
          {live ? (
            <>
              <View style={styles.dotLive} />
              <Text style={styles.statoLive}>Ora sulla mappa</Text>
            </>
          ) : (
            <Text style={styles.statoMuted}>
              Visto {tempoRelativoCalibrato(amico.updatedAt, nowMs)}
            </Text>
          )}
        </View>
        {amico.masked ? (
          <View style={styles.zonaRiga}>
            <Ionicons name="shield-half-outline" size={13} color={colors.accentSoft} />
            <Text style={styles.zonaText}>In zona · {amico.zoneLabel ?? 'zona'}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

// -----------------------------------------------------------------------------
// Contenuto: evento stanza (titolo + stato live/echo + host se amico noto).
// -----------------------------------------------------------------------------
function ContenutoEvento({
  evento,
  host,
  nowMs,
}: {
  evento: PuntoEvento;
  host: PuntoAmico | null;
  nowMs: number;
}) {
  const live = evento.endedAt == null;

  return (
    <View style={styles.body}>
      <View style={styles.eventoTitolo}>
        <Ionicons name={live ? 'radio' : 'time-outline'} size={18} color={live ? colors.accent : colors.muted} />
        <Text style={styles.nome} numberOfLines={2}>
          {evento.title ?? 'Stanza'}
        </Text>
      </View>
      <Text style={styles.statoMuted}>
        {live
          ? 'Stanza live ora'
          : evento.endedAt != null
            ? `Finita ${tempoRelativoCalibrato(evento.endedAt, nowMs)}`
            : 'Stanza'}
      </Text>
      {host ? (
        <View style={styles.hostRiga}>
          <Avatar uri={host.avatarUrl} name={host.username ?? undefined} size={28} />
          <Text style={styles.hostNome} numberOfLines={1}>
            {host.displayName ?? host.username ?? 'Amico'}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  intestazione: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: spacing.xs },
  body: { gap: spacing.sm, paddingTop: spacing.xs },
  testi: { flex: 1, gap: 2 },
  nome: { color: colors.ink, fontSize: fontSize.lg, fontFamily: fontFamily.semibold, flexShrink: 1 },
  username: { color: colors.muted, fontSize: fontSize.sm, fontFamily: fontFamily.sans },
  statoRiga: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: 2 },
  dotLive: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
  statoLive: { color: colors.accentSoft, fontSize: fontSize.sm, fontFamily: fontFamily.semibold },
  statoMuted: { color: colors.muted, fontSize: fontSize.sm, fontFamily: fontFamily.medium },
  zonaRiga: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: 2 },
  zonaText: { color: colors.accentSoft, fontSize: fontSize.xs, fontFamily: fontFamily.medium },
  eventoTitolo: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  hostRiga: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  hostNome: { color: colors.ink, fontSize: fontSize.sm, fontFamily: fontFamily.medium, flexShrink: 1 },
  azioni: { gap: spacing.sm, marginTop: spacing.md },
});
