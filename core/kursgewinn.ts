/**
 * Gesamtgewinn je Tag: Depotwert minus eingezahltes Kapital, gezaehlt ab dem Beginn
 * des gewaehlten Fensters — anders als `twr()` NICHT zeitgewichtet, also anfaellig dafuer,
 * dass eine grosse Einzahlung kurz als Cash liegt und die Prozentzahl kurzzeitig
 * verwaessert. Speist Kachel 1 (Kopfzeile, Chart, Tooltip); Abwaegung siehe ADR-011,
 * Fensterbezug siehe ADR-023.
 */

import type { Cent } from './dezimal.ts';
import type { Tag } from './kalender.ts';
import { vergleiche } from './kalender.ts';
import type { DepotTag } from './typen.ts';

export type KursgewinnPunkt = {
  readonly tag: Tag;
  /** Gewinn seit dem ersten Tag des Fensters; dort 0. */
  readonly gewinnCent: Cent;
  /** `gewinnCent` bezogen auf das eingezahlte Kapital dieses Tages. */
  readonly gewinnProzent: number;
};

export type KursgewinnFenster = {
  readonly punkte: readonly KursgewinnPunkt[];
  /** Gewinn am Fensterende — der letzte Punkt, hier nur der Bequemlichkeit halber. */
  readonly fensterGewinnCent: Cent;
  /**
   * `fensterGewinnCent` bezogen auf das eingezahlte Kapital zu Fensterende — NICHT
   * -beginn: zu Fensterbeginn kann die Einzahlung beliebig klein sein (bei "gesamte
   * Historie" ist der Fensterbeginn der allererste Zufluss ueberhaupt), was die
   * Prozentzahl auf absurde Werte treibt. Deckungsgleich mit `gewinnProzent` des
   * letzten Punkts.
   */
  readonly fensterGewinnProzent: number;
};

function gewinnVon(tag: DepotTag): Cent {
  return tag.gesamtCent - tag.nettoEinzahlungKumCent;
}

/**
 * Schneidet die Tagesreihe auf ein Fenster zu und bildet je Tag den Gewinn seit dem
 * Fensterbeginn ab. Reine Auswahl und Verhaeltnisbildung auf bereits gespeicherten
 * Werten, keine neue Kennzahl — deshalb hier und nicht im Server.
 */
export function kursgewinnFenster(reihe: readonly DepotTag[], von: Tag, bis: Tag): KursgewinnFenster {
  const teilReihe = reihe.filter((t) => vergleiche(t.tag, von) >= 0 && vergleiche(t.tag, bis) <= 0);
  const beginn = teilReihe[0];
  const gewinnBeginn = beginn === undefined ? 0n : gewinnVon(beginn);

  const punkte = teilReihe.map((t) => {
    const gewinnCent = gewinnVon(t) - gewinnBeginn;
    return {
      tag: t.tag,
      gewinnCent,
      gewinnProzent:
        t.nettoEinzahlungKumCent === 0n ? 0 : Number(gewinnCent) / Number(t.nettoEinzahlungKumCent),
    };
  });

  const letzter = punkte[punkte.length - 1];
  return {
    punkte,
    fensterGewinnCent: letzter?.gewinnCent ?? 0n,
    fensterGewinnProzent: letzter?.gewinnProzent ?? 0,
  };
}

export type VergleichPunkt = KursgewinnPunkt & {
  /**
   * Depotwert des Tages, bei dem die Vergleichslinie mit dem echten Depot am
   * Fensterbeginn zusammenfaellt: Depotwert minus Depotgewinn plus Vergleichsgewinn.
   */
  readonly wertCent: Cent;
  /** Gewinn des Depots minus Gewinn des Vergleichs seit Fensterbeginn; positiv = das Depot liegt vorn. */
  readonly differenzCent: Cent;
  /** Prozentpunkte: Depot-`gewinnProzent` minus Vergleichs-`gewinnProzent` desselben Tages. */
  readonly differenzProzent: number;
};

/**
 * Gewinn des Vergleichsdepots im selben Fenster und dieselbe Linie als Depotwert. Beide
 * Reihen tragen dasselbe eingezahlte Kapital (`baueEinzahlungsreihe`), Euro und Prozent sind
 * deshalb direkt mit dem Depot vergleichbar; die Differenz (Depot minus Vergleich) wird hier
 * gebildet, nicht in der Oberflaeche. Tage ohne Gegenstueck im Depot entfallen.
 */
export function vergleichImFenster(
  depot: readonly DepotTag[],
  vergleich: readonly DepotTag[],
  von: Tag,
  bis: Tag,
): readonly VergleichPunkt[] {
  const gesamt = new Map(depot.map((t) => [t.tag, t.gesamtCent]));
  const depotGewinn = new Map(kursgewinnFenster(depot, von, bis).punkte.map((p) => [p.tag, p]));
  return kursgewinnFenster(vergleich, von, bis).punkte.flatMap((p) => {
    const depotWert = gesamt.get(p.tag);
    const imDepot = depotGewinn.get(p.tag);
    if (depotWert === undefined || imDepot === undefined) return [];
    return [
      {
        ...p,
        wertCent: depotWert - imDepot.gewinnCent + p.gewinnCent,
        differenzCent: imDepot.gewinnCent - p.gewinnCent,
        differenzProzent: imDepot.gewinnProzent - p.gewinnProzent,
      },
    ];
  });
}
