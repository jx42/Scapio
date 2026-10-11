/**
 * Marken auf der Zeitachse des Verlaufs: Auswahl aus den Transaktionen, keine Rechnung.
 */

import type { Cent } from '../core/dezimal.ts';
import type { Tag } from '../core/kalender.ts';
import { vergleiche } from '../core/kalender.ts';
import type { Isin, Tx } from '../core/typen.ts';
import { einordnen, zaehlt } from '../core/typen.ts';
import { ausgeglicheneUebertraege } from '../core/uebertraege.ts';

export type MarkenTyp = 'sparplan' | 'kauf' | 'verkauf' | 'ertrag';

/** Ein einzelner Vorgang hinter einer Marke — eine Transaktion, keine Kennzahl. */
export type MarkenVorgang = {
  readonly betragCent: Cent;
  readonly isin: Isin | null;
};

export type Marke = {
  readonly tag: Tag;
  readonly typ: MarkenTyp;
  /**
   * Alle Transaktionen desselben Tages und Typs, die diese Marke bilden — meist eine,
   * bei mehreren Sparplaenen am selben Tag auch mehrere mit unterschiedlicher ISIN.
   */
  readonly vorgaenge: readonly MarkenVorgang[];
};

/**
 * Was auf der Zeitachse als feine Markierung erscheint. Auswahl, keine Rechnung.
 *
 * Nur Wertpapiergeschaefte (Sparplan, Kauf, Verkauf) und Ertraege werden markiert —
 * dieselbe Investition-statt-Kontobewegung-Unterscheidung wie in Kachel 5 (siehe
 * ADR-008). Eine externe Ein- oder Auszahlung aufs Verrechnungskonto ist noch keine
 * Investition in ein Wertpapier und bekommt deshalb keine Linie im Verlauf.
 *
 * Ein ausgeglichenes Uebertragspaar (siehe `core/uebertraege.ts`) erzeugt gar keine
 * Marke — es ist kein Vorgang, den ein Anleger auf der Zeitachse wiedererkennen soll.
 * Mehrere Transaktionen desselben Tages und Typs teilen sich eine Marke, statt eine
 * davon zu verschlucken — sonst waere ein zweiter Sparplankauf am selben Tag unsichtbar.
 */
export function markenAus(transaktionen: readonly Tx[], von: Tag, bis: Tag): Marke[] {
  const ausgeglichen = ausgeglicheneUebertraege(transaktionen);
  const jeSchluessel = new Map<string, { tag: Tag; typ: MarkenTyp; vorgaenge: MarkenVorgang[] }>();

  for (const tx of transaktionen) {
    if (!zaehlt(tx)) continue;
    if (ausgeglichen.has(tx.id)) continue;
    if (vergleiche(tx.tag, von) < 0 || vergleiche(tx.tag, bis) > 0) continue;

    let typ: MarkenTyp;
    if (tx.typ === 'SAVINGS_PLAN') typ = 'sparplan';
    else if (tx.typ === 'BUY') typ = 'kauf';
    else if (tx.typ === 'SELL') typ = 'verkauf';
    else if (einordnen(tx.typ) === 'ertrag') typ = 'ertrag';
    else continue;

    const schluessel = `${tx.tag} ${typ}`;
    const vorgang: MarkenVorgang = { betragCent: tx.betragCent, isin: tx.isin };
    const eintrag = jeSchluessel.get(schluessel);
    if (eintrag === undefined) jeSchluessel.set(schluessel, { tag: tx.tag, typ, vorgaenge: [vorgang] });
    else eintrag.vorgaenge.push(vorgang);
  }

  return [...jeSchluessel.values()].sort((a, b) => vergleiche(a.tag, b.tag));
}
