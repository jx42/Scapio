/**
 * Selbstkontrolle: die rekonstruierte Wahrheit gegen die gemeldete.
 *
 * Die berechnete Stueckzahl von heute muss `holdings.position.filled` treffen, der
 * berechnete Cashbestand den gemeldeten, der Gesamtwert den gemeldeten. Diese Pruefung
 * ist nicht optional — sie ist der Grund, warum man den Zahlen trauen kann. [P-02]
 *
 * Vier Stufen statt zwei: 0,5 % als einzige Schwelle waere entweder zu laut oder zu
 * still. [P-08]
 */

import type { Cent } from './dezimal.ts';
import { betragVon, wert } from './dezimal.ts';
import type { Bestand, DepotTag, Isin } from './typen.ts';

export type Schwellen = {
  readonly hinweis: number;
  readonly banner: number;
  readonly abbruch: number;
};

export const VORGABE_SCHWELLEN: Schwellen = {
  hinweis: 0.001,
  banner: 0.005,
  abbruch: 0.02,
};

/** `leer`: noch keine rekonstruierte Reihe, also nichts zu pruefen — kein Warnsignal. */
export type Stufe = 'ok' | 'hinweis' | 'banner' | 'abbruch' | 'ausgesetzt' | 'leer';

export type Abweichungsdetail = {
  readonly isin: Isin;
  readonly berechnetCent: Cent;
  readonly gemeldetCent: Cent;
  readonly abweichung: number;
};

export type DriftErgebnis = {
  readonly stufe: Stufe;
  /** Relative Abweichung des Gesamtwerts, 0..1. */
  readonly abweichung: number;
  readonly berechnetGesamtCent: Cent;
  readonly gemeldetGesamtCent: Cent;
  readonly cashAbweichung: number;
  readonly positionen: readonly Abweichungsdetail[];
  /** Warum die Pruefung ausgesetzt wurde, falls sie es ist. */
  readonly grund: string | null;
};

function relativ(berechnet: Cent, gemeldet: Cent): number {
  if (gemeldet === 0n) return berechnet === 0n ? 0 : 1;
  return Number(betragVon(berechnet - gemeldet)) / Number(betragVon(gemeldet));
}

function stufeFuer(abweichung: number, schwellen: Schwellen): Stufe {
  if (abweichung >= schwellen.abbruch) return 'abbruch';
  if (abweichung >= schwellen.banner) return 'banner';
  if (abweichung >= schwellen.hinweis) return 'hinweis';
  return 'ok';
}

/**
 * @param berechnet   Der letzte Tag der rekonstruierten Reihe.
 * @param bestand     Der gemeldete Bestand. Leer heisst: Pruefung ausgesetzt, nicht bestanden.
 * @param cash        Gemeldeter Cashbestand.
 * @param schwellen   Aus der Konfiguration, sonst die Vorgabe.
 * @param positionen  Berechnete Positionswerte des letzten Tages. Liegen sie vor, zeigt
 *                    das Ergebnis auch, WELCHE Position auseinanderlaeuft — sonst nur,
 *                    DASS etwas auseinanderlaeuft.
 */
export function drift(
  berechnet: DepotTag | null,
  bestand: readonly Bestand[],
  cash: Cent,
  schwellen: Schwellen = VORGABE_SCHWELLEN,
  positionen: ReadonlyMap<Isin, Cent> | null = null,
): DriftErgebnis {
  if (berechnet === null) {
    return {
      stufe: 'leer',
      abweichung: 0,
      berechnetGesamtCent: 0n,
      gemeldetGesamtCent: 0n,
      cashAbweichung: 0,
      positionen: [],
      grund: null,
    };
  }
  if (bestand.length === 0) {
    return {
      stufe: 'ausgesetzt',
      abweichung: 0,
      berechnetGesamtCent: berechnet.gesamtCent,
      gemeldetGesamtCent: 0n,
      cashAbweichung: 0,
      positionen: [],
      grund: 'Der Bestand konnte beim letzten Lauf nicht abgerufen werden.',
    };
  }

  let gemeldetWertpapiere = 0n;
  for (const b of bestand) gemeldetWertpapiere += wert(b.mengeE8, b.kursE6);

  const gemeldetGesamt = gemeldetWertpapiere + cash;
  const abweichung = relativ(berechnet.gesamtCent, gemeldetGesamt);
  const cashAbweichung = relativ(berechnet.cashCent, cash);

  return {
    stufe: stufeFuer(abweichung, schwellen),
    abweichung,
    berechnetGesamtCent: berechnet.gesamtCent,
    gemeldetGesamtCent: gemeldetGesamt,
    cashAbweichung,
    positionen: positionen === null ? [] : driftJePosition(positionen, bestand),
    grund: null,
  };
}

/**
 * Feinere Variante: vergleicht auch je Position, wenn die berechneten Positionswerte
 * vorliegen. Die Oberflaeche zeigt damit, WELCHE Position auseinanderlaeuft.
 */
export function driftJePosition(
  berechnetePositionen: ReadonlyMap<Isin, Cent>,
  bestand: readonly Bestand[],
): Abweichungsdetail[] {
  const details: Abweichungsdetail[] = [];

  for (const b of bestand) {
    const gemeldet = wert(b.mengeE8, b.kursE6);
    const berechnet = berechnetePositionen.get(b.isin) ?? 0n;
    details.push({
      isin: b.isin,
      berechnetCent: berechnet,
      gemeldetCent: gemeldet,
      abweichung: relativ(berechnet, gemeldet),
    });
  }

  return details.sort((a, b) => b.abweichung - a.abweichung);
}
