/**
 * Woher kommt der Gewinn: der Gesamtgewinn seit dem ersten Kauf, zerlegt nach Herkunft.
 *
 * Je Wertpapier zaehlt Buchgewinn plus realisierter Gewinn — auch eine laengst verkaufte
 * Position hat beigetragen. Daneben Ertraege, Steuern und Gebuehren als eigene Toepfe, nach
 * TYP wie in den Kennzahlen [ADR-014]. Was positiv ist, fliesst zu, was negativ ist, ab;
 * eine Steuererstattung ueber dem Abzug fliesst also zu, ein Positionsverlust ab.
 *
 * Mehr als `HOECHSTENS_JE_SEITE` Positionen je Seite fasst `uebrige` zusammen: mit dreissig
 * Baendern liest niemand mehr, woher der Gewinn kommt.
 */

import { anteil, betragVon, summe, type Cent } from './dezimal.ts';
import type { Isin } from './typen.ts';

export const HOECHSTENS_JE_SEITE = 8;

export type GewinnquelleArt = 'position' | 'uebrige' | 'ertraege' | 'steuern' | 'gebuehren';

export type Gewinnquelle = {
  readonly art: GewinnquelleArt;
  /** Nur bei `position`. */
  readonly isin: Isin | null;
  /** Nur bei `position`; Fremdtext, nie Markup. [INV-06] */
  readonly name: string | null;
  /** Bei `uebrige` die Zahl der zusammengefassten Positionen, sonst 1. */
  readonly anzahl: number;
  /** Die Positionen dahinter: bei `position` die eine, bei `uebrige` die zusammengefassten, sonst leer. */
  readonly isins: readonly Isin[];
  /** Mit Vorzeichen: Zufluesse positiv, Abfluesse negativ. */
  readonly betragCent: Cent;
  /** Betrag als Anteil an `mitteCent`. */
  readonly anteil: number;
};

export type Gewinnquellen = {
  /** Groesster zuerst; Positionen vor den Toepfen. */
  readonly zufluesse: readonly Gewinnquelle[];
  /** Groesster Betrag zuerst; Positionen vor den Toepfen. */
  readonly abfluesse: readonly Gewinnquelle[];
  /** Summe der Zufluesse. */
  readonly bruttoCent: Cent;
  /** Summe der Abfluesse, negativ oder 0. */
  readonly abzuegeCent: Cent;
  readonly nettoCent: Cent;
  /**
   * Der mittlere Knoten, durch den alles fliesst: die Zufluesse, bei einem Nettoverlust die
   * Abfluesse. Bezug aller Anteile.
   */
  readonly mitteCent: Cent;
  readonly nettoAnteil: number;
};

export type PositionsBeitrag = {
  readonly isin: Isin;
  readonly name: string;
  readonly gewinnCent: Cent;
};

export type GewinnquellenEingaben = {
  readonly positionen: readonly PositionsBeitrag[];
  readonly ertraegeCent: Cent;
  readonly steuernCent: Cent;
  readonly gebuehrenCent: Cent;
};

type Roh = Omit<Gewinnquelle, 'anteil'>;

function nachBetrag(a: Roh, b: Roh): number {
  const x = betragVon(a.betragCent);
  const y = betragVon(b.betragCent);
  return x > y ? -1 : x < y ? 1 : (a.isin ?? '').localeCompare(b.isin ?? '');
}

function seite(positionen: readonly Roh[], toepfe: readonly Roh[]): Roh[] {
  const sortiert = [...positionen].sort(nachBetrag);
  const gezeigt = sortiert.length > HOECHSTENS_JE_SEITE ? sortiert.slice(0, HOECHSTENS_JE_SEITE - 1) : sortiert;
  const rest = sortiert.slice(gezeigt.length);
  const ergebnis = [...gezeigt];
  if (rest.length > 0) {
    ergebnis.push({
      art: 'uebrige',
      isin: null,
      name: null,
      anzahl: rest.length,
      isins: rest.flatMap((q) => (q.isin === null ? [] : [q.isin])),
      betragCent: summe(rest.map((q) => q.betragCent)),
    });
  }
  return [...ergebnis, ...[...toepfe].sort(nachBetrag)];
}

export function gewinnquellen(e: GewinnquellenEingaben): Gewinnquellen {
  const positionen: Roh[] = e.positionen
    .filter((p) => p.gewinnCent !== 0n)
    .map((p) => ({ art: 'position', isin: p.isin, name: p.name, anzahl: 1, isins: [p.isin], betragCent: p.gewinnCent }));
  const toepfe: Roh[] = (
    [
      ['ertraege', e.ertraegeCent],
      ['steuern', e.steuernCent],
      ['gebuehren', e.gebuehrenCent],
    ] as const
  )
    .filter(([, betrag]) => betrag !== 0n)
    .map(([art, betrag]) => ({ art, isin: null, name: null, anzahl: 1, isins: [], betragCent: betrag }));

  const zufluesse = seite(
    positionen.filter((q) => q.betragCent > 0n),
    toepfe.filter((q) => q.betragCent > 0n),
  );
  const abfluesse = seite(
    positionen.filter((q) => q.betragCent < 0n),
    toepfe.filter((q) => q.betragCent < 0n),
  );
  const bruttoCent = summe(zufluesse.map((q) => q.betragCent));
  const abzuegeCent = summe(abfluesse.map((q) => q.betragCent));
  const nettoCent = bruttoCent + abzuegeCent;
  const mitteCent = bruttoCent > -abzuegeCent ? bruttoCent : -abzuegeCent;
  const mitAnteil = (q: Roh): Gewinnquelle => ({ ...q, anteil: anteil(betragVon(q.betragCent), mitteCent) });

  return {
    zufluesse: zufluesse.map(mitAnteil),
    abfluesse: abfluesse.map(mitAnteil),
    bruttoCent,
    abzuegeCent,
    nettoCent,
    mitteCent,
    nettoAnteil: anteil(betragVon(nettoCent), mitteCent),
  };
}
