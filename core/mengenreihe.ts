/**
 * Stueckzahlreihe aus Transaktionen.
 *
 * Alle Wertpapiertransaktionen nach ISIN gruppieren, chronologisch kumulieren, auf ein
 * Tageskalender-Raster forward-fillen. Ergibt menge[isin][tag] — die eine Haelfte der
 * Rekonstruktion; die andere ist das Kursraster.
 */

import type { MengeE8 } from './dezimal.ts';
import type { Tag } from './kalender.ts';
import { plusTage, vergleiche } from './kalender.ts';
import type { Isin, Tx } from './typen.ts';
import { zaehlt } from './typen.ts';
import { istWertpapieruebertrag } from './uebertraege.ts';

export type Mengenreihe = {
  /** Menge je ISIN und Tag, ab dem ersten Tag mit Bestand. */
  readonly menge: ReadonlyMap<Isin, ReadonlyMap<Tag, MengeE8>>;
  /** Aelteste Transaktion ueberhaupt, oder null bei leerer Historie. */
  readonly ersterTag: Tag | null;
  /** Endbestand je ISIN nach der letzten Transaktion. */
  readonly endbestand: ReadonlyMap<Isin, MengeE8>;
};

/**
 * Aenderung der Stueckzahl an einem Tag, je ISIN.
 *
 * Ein ausgeglichenes Uebertragspaar (siehe `uebertraege.ts`) zaehlt nicht mit — sonst
 * faellt die Stueckzahl an einem depotinternen Wechsel auf null und springt am
 * Folgetag zurueck, obwohl sich am Bestand nichts geaendert hat.
 */
export function mengenAenderungen(
  transaktionen: readonly Tx[],
  ausgeglichen: ReadonlySet<string>,
): Map<Isin, Map<Tag, MengeE8>> {
  const aenderungen = new Map<Isin, Map<Tag, MengeE8>>();

  for (const tx of transaktionen) {
    if (!zaehlt(tx)) continue;
    if (tx.art !== 'WERTPAPIER') continue;
    if (tx.isin === null || tx.mengeE8 === null) continue;
    if (ausgeglichen.has(tx.id)) continue;

    let jeIsin = aenderungen.get(tx.isin);
    if (jeIsin === undefined) {
      jeIsin = new Map();
      aenderungen.set(tx.isin, jeIsin);
    }
    jeIsin.set(tx.tag, (jeIsin.get(tx.tag) ?? 0n) + tx.mengeE8);
  }

  return aenderungen;
}

/**
 * Kumulierte Stueckzahl je ISIN und Tag ueber die Spanne von..bis.
 * Tage vor der ersten Transaktion einer ISIN bleiben leer — nicht null, sondern leer:
 * eine Position, die es noch nicht gab, hat keinen Wert, nicht den Wert null.
 */
export function baueMengenreihe(
  transaktionen: readonly Tx[],
  von: Tag,
  bis: Tag,
  ausgeglichen: ReadonlySet<string>,
): Mengenreihe {
  const aenderungen = mengenAenderungen(transaktionen, ausgeglichen);
  const menge = new Map<Isin, Map<Tag, MengeE8>>();
  const endbestand = new Map<Isin, MengeE8>();

  let ersterTag: Tag | null = null;
  for (const tx of transaktionen) {
    if (!zaehlt(tx)) continue;
    if (ersterTag === null || vergleiche(tx.tag, ersterTag) < 0) ersterTag = tx.tag;
  }

  for (const [isin, jeTag] of aenderungen) {
    const tage = [...jeTag.keys()].sort(vergleiche);
    const start = tage[0];
    if (start === undefined) continue;

    const reihe = new Map<Tag, MengeE8>();
    const beginn = vergleiche(start, von) > 0 ? start : von;

    // Alles vor `beginn` bildet den Anfangsbestand. Ohne das haette eine
    // Neuberechnung ab einem spaeteren Tag jeden frueheren Kauf vergessen und
    // ein leeres Depot ausgewiesen — dieselbe Regel wie in der Cashreihe.
    let bestand = 0n;
    for (const [tag, d] of jeTag) {
      if (vergleiche(tag, beginn) < 0) bestand += d;
    }

    for (let t = beginn; vergleiche(t, bis) <= 0; t = plusTage(t, 1)) {
      bestand += jeTag.get(t) ?? 0n;
      reihe.set(t, bestand);
    }

    // Aenderungen nach `bis` gehoeren nicht in die Reihe, aber in den Endbestand.
    let gesamt = 0n;
    for (const [, d] of jeTag) gesamt += d;

    menge.set(isin, reihe);
    endbestand.set(isin, gesamt);
  }

  return { menge, ersterTag, endbestand };
}

/**
 * Cashreihe: kumulative Summe aller Betraege. Wertpapierkaeufe sind darin negativ
 * enthalten, weil ihr Betrag aus Sicht des Depots ein Abfluss von der Cash-Seite ist.
 *
 * Ein Depotuebertrag in Stuecken (`istWertpapieruebertrag`) traegt einen Uebertragswert
 * als Betrag, obwohl kein Cent aufs Verrechnungskonto floss — ob gepaart oder nicht, er
 * bleibt aussen vor. Seine Stuecke zaehlt die Mengenreihe. [ADR-036]
 */
export function baueCashreihe(
  transaktionen: readonly Tx[],
  von: Tag,
  bis: Tag,
  ausgeglichen: ReadonlySet<string>,
): Map<Tag, bigint> {
  const jeTag = new Map<Tag, bigint>();
  for (const tx of transaktionen) {
    if (!zaehlt(tx)) continue;
    if (ausgeglichen.has(tx.id) || istWertpapieruebertrag(tx)) continue;
    jeTag.set(tx.tag, (jeTag.get(tx.tag) ?? 0n) + tx.betragCent);
  }

  // Alles, was vor `von` liegt, bildet den Anfangsbestand.
  let bestand = 0n;
  for (const [tag, betrag] of jeTag) {
    if (vergleiche(tag, von) < 0) bestand += betrag;
  }

  const reihe = new Map<Tag, bigint>();
  for (let t = von; vergleiche(t, bis) <= 0; t = plusTage(t, 1)) {
    bestand += jeTag.get(t) ?? 0n;
    reihe.set(t, bestand);
  }

  return reihe;
}

/**
 * Eingezahltes Kapital je Tag: nur externe Fluesse.
 * Sie ist die zweite Linie in Kachel 1 — der Abstand zur Wertlinie ist der Gewinn.
 */
export function baueEinzahlungsreihe(
  externeFluesse: readonly { tag: Tag; betrag: bigint }[],
  von: Tag,
  bis: Tag,
): Map<Tag, bigint> {
  const jeTag = new Map<Tag, bigint>();
  for (const f of externeFluesse) jeTag.set(f.tag, (jeTag.get(f.tag) ?? 0n) + f.betrag);

  let kum = 0n;
  for (const [tag, betrag] of jeTag) {
    if (vergleiche(tag, von) < 0) kum += betrag;
  }

  const reihe = new Map<Tag, bigint>();
  for (let t = von; vergleiche(t, bis) <= 0; t = plusTage(t, 1)) {
    kum += jeTag.get(t) ?? 0n;
    reihe.set(t, kum);
  }

  return reihe;
}
