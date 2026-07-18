// =============================================================================
// ShareCardClassifica — la card 9:16 per la condivisione esterna (M16 / AC4,
// classifica.md §6).
// =============================================================================
// L'UNICO artefatto del modulo che ESCE dall'app (WhatsApp, Instagram, ovunque):
// contiene ESCLUSIVAMENTE dati del mittente (INVARIANTE §6.1 — mai nomi, volti
// o rank di amici; `friends_total` come numero nudo nel badge è dato proprio).
// Layout logico 360×640, catturato a 1080×1920 PNG da useCondividiClassifica.
// Montata OFF-SCREEN on-demand (assoluta fuori viewport, collapsable={false}):
// l'utente non la vede mai come schermata, solo come immagine condivisa.
// Il gradiente brand viola→fucsia compare SOLO nel wordmark (design system).

import type { RefObject } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BrandLockup } from '@/components/brand/BrandLockup';
import { AuraAvatarRing } from '@/components/aura/AuraAvatarRing';
import { Avatar } from '@/components/ui/Avatar';
import { auraRingColor } from '@/constants/aura';
import { INVITE_URL } from '@/constants/config';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';
import type { DatiCardClassifica } from '@/hooks/useCondividiClassifica';

// Dimensioni LOGICHE della card (9:16). La cattura riscala a 1080×1920 (§6.2):
// il quadrato si ritaglia bene DA un 9:16, non viceversa.
export const CARD_W = 360;
export const CARD_H = 640;

const AVATAR = 132;

interface Props {
  dati: DatiCardClassifica;
  /** Ref del nodo da fotografare (captureRef del hook). */
  cardRef: RefObject<View | null>;
  /** Chiamata al primo layout: la card è montata e pronta alla cattura. */
  onPronta: () => void;
}

export function ShareCardClassifica({ dati, cardRef, onPronta }: Props) {
  const nome = dati.displayName || dati.username;
  const percento = Math.round(dati.auraScore);

  return (
    // Fuori viewport, mai interattiva: esiste solo per essere fotografata.
    <View style={styles.offscreen} pointerEvents="none">
      <View ref={cardRef} collapsable={false} style={styles.card} onLayout={onPronta}>
        <BrandLockup size={26} />

        <View style={styles.centro}>
          {/* Arco statico (still): nessuna animazione nello snapshot (§6.1). */}
          <AuraAvatarRing percent={dati.auraScore} size={AVATAR} still>
            <Avatar uri={dati.avatarUrl} name={nome} size={AVATAR} />
          </AuraAvatarRing>

          <Text style={styles.nome} numberOfLines={1}>
            {nome}
          </Text>
          <Text style={styles.username} numberOfLines={1}>
            @{dati.username}
          </Text>

          <Text style={[styles.percento, { color: auraRingColor(percento) }]}>{percento}%</Text>

          {/* «1° su 1» è ridicolo: il badge esiste solo con almeno un amico. */}
          {dati.friendsTotal >= 2 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeTesto}>{dati.rank}° tra i miei amici</Text>
            </View>
          ) : null}

          <Text style={styles.claim}>La mia Aura su Televo.{'\n'}Non follower, non like.</Text>
        </View>

        {/* Blocco conversione (AC-5): il link viene SOLO da INVITE_URL. */}
        <View style={styles.conversione}>
          <Text style={styles.invito}>Televo arriva a Terni — solo su invito</Text>
          <Text style={styles.url}>{INVITE_URL}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Assoluta FUORI viewport (niente opacity:0: su Android rischia di sparire
  // dalla cattura). Il layout interno resta quello reale.
  offscreen: { position: 'absolute', top: 0, left: -CARD_W * 4, width: CARD_W, height: CARD_H },
  card: {
    width: CARD_W,
    height: CARD_H,
    backgroundColor: colors.base,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 44,
    paddingHorizontal: spacing.xl,
  },
  centro: { alignItems: 'center', gap: 2 },
  nome: {
    color: colors.ink,
    fontSize: fontSize.xl,
    fontFamily: fontFamily.semibold,
    maxWidth: CARD_W - 64,
    marginTop: spacing.sm,
  },
  username: { color: colors.muted, fontSize: fontSize.sm, fontFamily: fontFamily.sans },
  percento: { fontSize: 64, fontFamily: fontFamily.displayBold, marginTop: spacing.md },
  badge: {
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    marginTop: spacing.sm,
  },
  badgeTesto: { color: colors.ink, fontSize: fontSize.sm, fontFamily: fontFamily.semibold },
  claim: {
    color: colors.muted,
    fontSize: fontSize.sm,
    fontFamily: fontFamily.sans,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: spacing.lg,
  },
  conversione: {
    alignItems: 'center',
    gap: 2,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    alignSelf: 'stretch',
  },
  invito: { color: colors.ink, fontSize: fontSize.sm, fontFamily: fontFamily.medium },
  url: { color: colors.accentSoft, fontSize: fontSize.base, fontFamily: fontFamily.semibold },
});
