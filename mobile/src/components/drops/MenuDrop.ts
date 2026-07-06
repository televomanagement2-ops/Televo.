// =============================================================================
// MenuDrop — il menu ⋯ del drop (S6) e la gerarchia dei gesti secondari (DM4).
// =============================================================================
// Logica imperativa (niente JSX): compone i dialoghi dark (mostraMenu/conferma,
// CM6.5) in un unico punto riusato dalla card del feed (S1) E dall'hero del
// dettaglio (S3), così il menu è identico ovunque. Due livelli (pattern CM6.5):
//   · Drop di un amico → Salva/Rimuovi · Dai Aura (4 tratti) · Segnala (motivi)
//   · Drop mio         → Vedi statistiche (solo dal feed) · Elimina (distruttiva)
// DM5: aggiunte "Inoltra in chat" (autore E amico) e "Rispondi in privato"
// (solo drop altrui → apre la DM con l'autore, riferimento precompilato). Le
// azioni vere (salva, reaction, report, delete, inoltro, DM) le esegue il
// chiamante via callback: MenuDrop naviga solo i dialoghi.

import { conferma, mostraMenu, type VoceMenu } from '@/lib/dialoghi';
import { DROP_REACTION_TRAITS, REPORT_REASONS } from '@/constants/drops';
import type { DropFeedRow, DropReactionTrait } from '@/types/supabase';

export interface MostraMenuDropOpts {
  row: DropFeedRow;
  /** Il drop è mio? (menu autore: statistiche + elimina; niente reaction/segnala). */
  isAuthor: boolean;
  /** 'feed' mostra "Apri/Vedi statistiche"; 'detail' è già aperto sul drop. */
  context: 'feed' | 'detail';
  /** Apre il dettaglio S3 (solo dal feed). */
  onOpen?: () => void;
  /** Toggle salvataggio (drop di un amico). */
  onSave: (next: boolean) => void;
  /** Toggle reaction-tratto "Dai Aura" (drop di un amico → prop → Aura). */
  onReaction: (trait: DropReactionTrait, next: boolean) => void;
  /** Segnala con un motivo (drop di un amico). Il chiamante fa la chiamata + feedback. */
  onReport: (reason: string) => void;
  /** Elimina il drop — invocata DOPO la conferma distruttiva. */
  onDelete: () => void;
  /** Inoltra il drop in chat come riferimento (DM5, R-08): autore E amico. */
  onForward: () => void;
  /** Rispondi in privato all'autore (DM5): apre la DM col drop precompilato.
   *  Solo per i drop altrui (rispondere al proprio non ha senso). */
  onReplyPrivate?: () => void;
}

/** Secondo livello "Dai Aura": i 4 tratti, con toggle su quelli già dati da me. */
function submenuAura(
  row: DropFeedRow,
  onReaction: (trait: DropReactionTrait, next: boolean) => void,
): void {
  mostraMenu({
    titolo: 'Dai Aura',
    sottotitolo: 'Un riconoscimento che alimenta la sua reputazione.',
    voci: DROP_REACTION_TRAITS.map(({ trait, emoji, label }): VoceMenu => {
      const attivo = row.mie_reactions.includes(trait);
      return {
        label: `${emoji}  ${label}${attivo ? '  ✓' : ''}`,
        onPress: () => onReaction(trait, !attivo),
      };
    }),
  });
}

/** Secondo livello "Segnala": i motivi standard (REPORT_REASONS). */
function submenuSegnala(onReport: (reason: string) => void): void {
  mostraMenu({
    titolo: 'Segnala drop',
    sottotitolo: 'La segnalazione è anonima e va ai moderatori.',
    voci: REPORT_REASONS.map((r): VoceMenu => ({
      label: r,
      icon: 'flag-outline',
      onPress: () => onReport(r),
    })),
  });
}

/**
 * Conferma distruttiva di eliminazione. `ricordo=true` per un drop già scaduto
 * (S5): la copy cambia ("dai tuoi Ricordi" vs "anche per i tuoi amici"). Esporta
 * perché la anche la schermata Ricordi la riusa per l'elimina definitivo.
 */
export function confermaEliminaDrop(ricordo: boolean, onConferma: () => void): void {
  conferma({
    titolo: ricordo ? 'Eliminare questo Ricordo?' : 'Eliminare il drop?',
    messaggio: ricordo
      ? 'Sparirà per sempre dai tuoi Ricordi. Non si può annullare.'
      : 'Sparirà subito anche per i tuoi amici. Non si può annullare.',
    confermaLabel: 'Elimina',
    distruttiva: true,
    onConferma,
  });
}

/** Apre il menu ⋯ del drop (S6), calibrato su autore/amico e feed/dettaglio. */
export function mostraMenuDrop(opts: MostraMenuDropOpts): void {
  const { row, isAuthor, context, onOpen, onSave, onReaction, onReport, onDelete, onForward, onReplyPrivate } = opts;
  const nome = row.author.display_name?.trim() || row.author.username;

  if (isAuthor) {
    const voci: VoceMenu[] = [];
    // Dal feed: scorciatoia al dettaglio (dove vivono le statistiche complete).
    // Dal dettaglio: il pannello StatistichePrivate è già sotto l'hero.
    if (context === 'feed' && onOpen) {
      voci.push({ label: 'Vedi statistiche', icon: 'stats-chart-outline', onPress: onOpen });
    }
    voci.push({ label: 'Inoltra in chat', icon: 'arrow-redo-outline', onPress: onForward });
    voci.push({
      label: 'Elimina',
      icon: 'trash-outline',
      danger: true,
      onPress: () => confermaEliminaDrop(false, onDelete),
    });
    mostraMenu({ titolo: 'Il tuo drop', voci });
    return;
  }

  const voci: VoceMenu[] = [];
  if (context === 'feed' && onOpen) {
    voci.push({ label: 'Apri', icon: 'open-outline', onPress: onOpen });
  }
  voci.push(
    row.mio_salvataggio
      ? { label: 'Rimuovi dai salvati', icon: 'bookmark', onPress: () => onSave(false) }
      : { label: 'Salva', icon: 'bookmark-outline', onPress: () => onSave(true) },
  );
  voci.push({ label: 'Inoltra in chat', icon: 'arrow-redo-outline', onPress: onForward });
  if (onReplyPrivate) {
    voci.push({ label: 'Rispondi in privato', icon: 'chatbubble-ellipses-outline', onPress: onReplyPrivate });
  }
  voci.push({ label: 'Dai Aura', icon: 'sparkles-outline', onPress: () => submenuAura(row, onReaction) });
  voci.push({ label: 'Segnala', icon: 'flag-outline', onPress: () => submenuSegnala(onReport) });
  mostraMenu({ titolo: nome, voci });
}
