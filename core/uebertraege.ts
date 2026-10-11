/**
 * Depotinterne Uebertragspaare erkennen.
 *
 * Ein exakt gegenlaufendes `TRANSFER_OUT`/`TRANSFER_IN`-Paar — gleiche ISIN, exakt
 * entgegengesetzte Menge — ist kein Marktvorgang und kein Kapitalfluss: derselbe
 * Bestand verlaesst das Depot und kommt unveraendert zurueck, meist bei einem
 * depotinternen Wechsel (z. B. Broker-Migration). Jede Funktion, die Transaktionen zu
 * einer Zeitreihe oder einem Cashflow verarbeitet, uebergeht beide Buchungen eines
 * solchen Paares vollstaendig.
 *
 * Ein unpaariger `TRANSFER_OUT`/`TRANSFER_IN` (echter Depotwechsel zu einer anderen
 * Bank) ist ein externer Fluss in Hoehe des Uebertragswerts und in FIFO ein Kauf bzw.
 * Verkauf zu diesem Wert. Auf das Verrechnungskonto bucht er nichts — siehe
 * `istWertpapieruebertrag`. Diese Erkennung ist an keine bestimmte ISIN oder Bank
 * gebunden; sie greift bei jedem Depot, in dem ein solches Paar auftritt. [ADR-036]
 */

import type { KursE6 } from './dezimal.ts';
import { wert } from './dezimal.ts';
import type { Tag } from './kalender.ts';
import { tageZwischen } from './kalender.ts';
import type { Isin, Tx } from './typen.ts';
import { zaehlt } from './typen.ts';

/**
 * Hoechster Abstand zwischen beiden Seiten eines Paares. Ein Brokerwechsel innerhalb
 * der Bank dauert Tage; ein Ausgang 2022 und ein zufaellig gleich grosser Eingang 2025
 * sind zwei echte Depotwechsel, kein Paar.
 */
export const PAAR_HOECHSTENS_TAGE = 30;

/**
 * Bewegt dieser Uebertrag Stuecke? Dann ist sein Betrag der Uebertragswert der Stuecke
 * und kein Geld auf dem Verrechnungskonto — ihn dort zu buchen, zaehlte denselben Wert
 * zweimal: als Bestand und als Cash.
 */
export function istWertpapieruebertrag(tx: Tx): boolean {
  const typ = tx.typ.toUpperCase();
  return (typ === 'TRANSFER_IN' || typ === 'TRANSFER_OUT') && tx.mengeE8 !== null && tx.mengeE8 !== 0n;
}

/**
 * Findet zu jedem `TRANSFER_OUT` ein `TRANSFER_IN` derselben ISIN mit exakt
 * entgegengesetzter Menge, hoechstens `PAAR_HOECHSTENS_TAGE` entfernt, und gibt die IDs
 * beider Seiten aller gefundenen Paare zurueck. Stornierte oder offene Buchungen paaren nicht. Ein Treffer wird sofort verbraucht, damit zwei Uebertraege mit derselben
 * Menge nicht denselben Partner doppelt binden.
 */
export function ausgeglicheneUebertraege(transaktionen: readonly Tx[]): Set<string> {
  const insUebrigJeIsin = new Map<Isin, Tx[]>();
  for (const t of transaktionen) {
    if (!zaehlt(t) || t.typ.toUpperCase() !== 'TRANSFER_IN' || t.isin === null || t.mengeE8 === null) continue;
    const liste = insUebrigJeIsin.get(t.isin);
    if (liste === undefined) insUebrigJeIsin.set(t.isin, [t]);
    else liste.push(t);
  }

  const ausgeschlossen = new Set<string>();
  for (const out of transaktionen) {
    if (!zaehlt(out) || out.typ.toUpperCase() !== 'TRANSFER_OUT' || out.isin === null || out.mengeE8 === null) continue;
    const kandidaten = insUebrigJeIsin.get(out.isin);
    if (kandidaten === undefined) continue;
    const gesuchteMenge = -out.mengeE8;
    const index = kandidaten.findIndex(
      (i) => i.mengeE8 === gesuchteMenge && Math.abs(tageZwischen(out.tag, i.tag)) <= PAAR_HOECHSTENS_TAGE,
    );
    if (index === -1) continue;
    const [treffer] = kandidaten.splice(index, 1);
    ausgeschlossen.add(out.id);
    ausgeschlossen.add(treffer!.id);
  }

  return ausgeschlossen;
}

/** Ein unverpaarter Wertpapieruebertrag, fuer den die Bank keinen Wert liefert. */
export function istUebertragOhneWert(tx: Tx, ausgeglichen: ReadonlySet<string>): boolean {
  return zaehlt(tx) && istWertpapieruebertrag(tx) && tx.betragCent === 0n && !ausgeglichen.has(tx.id);
}

/**
 * Bewertet jeden unverpaarten `TRANSFER_OUT` ohne Betrag zum letzten Kurs bis zu seinem
 * Tag. Mit Betrag 0 waere der Uebertrag zu einer Fremdbank ein Totalverlust — im TWR,
 * im IZF und in FIFO. Bewertet wirkt er wie eine Entnahme zum Tageswert. Ohne Kurs
 * bleibt die Buchung unveraendert. Ein Eingang ohne Wert wird nicht geschaetzt, sondern
 * im Lauf gemeldet (`uebertragOhneWert`). [ADR-043]
 */
export function bewerteAusgaenge(
  transaktionen: readonly Tx[],
  ausgeglichen: ReadonlySet<string>,
  kursBis: (isin: Isin, tag: Tag) => KursE6 | null,
): readonly Tx[] {
  let geaendert = false;
  const ergebnis = transaktionen.map((tx) => {
    if (tx.typ.toUpperCase() !== 'TRANSFER_OUT' || !istUebertragOhneWert(tx, ausgeglichen) || tx.isin === null) return tx;
    const kurs = kursBis(tx.isin, tx.tag);
    if (kurs === null) return tx;
    geaendert = true;
    return { ...tx, betragCent: -wert(-tx.mengeE8!, kurs) };
  });
  return geaendert ? ergebnis : transaktionen;
}
