/*
 * Knoten und Baender des Sankey aus der Antwort von `/api/gewinnquellen`. Alle Betraege und
 * Anteile kommen fertig aus `core/gewinnquellen.ts`; hier wird nur zusammengesteckt.
 */

import { de } from '@/i18n/de';
import type { Gewinnquelle, Gewinnquellen } from '@/lib/api';
import { anteilProzent, euroAusCent, richtungswert } from '@/lib/format';
import { FARBE } from '@/lib/farben';
import type { BeschriftungEingabe } from './beschriftung';
import type { Auswahl } from './GewinnquellenBuchungen';

type Spalte = 0 | 1 | 2;

export type Knoten = {
  readonly schluessel: string;
  readonly name: string;
  readonly farbe: string;
  readonly spalte: Spalte;
  /** Mit Vorzeichen, wie er beschriftet wird. */
  readonly betragCent: number;
  /** Anteil an der Mitte; `null` an der Mitte selbst. */
  readonly anteil: number | null;
  /** Einziger Knoten seiner Spalte: sein Anteil ist 100 % und wird nicht beschriftet. */
  readonly allein: boolean;
  /** Welche Buchungen ein Klick oeffnet; `null` bei Mitte und Netto. */
  readonly auswahl: Auswahl | null;
};

type Band = {
  readonly source: number;
  readonly target: number;
  readonly value: number;
};

function quellenName(q: Gewinnquelle): string {
  switch (q.art) {
    case 'position':
      return q.name ?? q.isin ?? '';
    case 'uebrige':
      return de.gewinnquellen.uebrige(q.anzahl);
    case 'ertraege':
      return de.gewinnquellen.ertraege;
    case 'steuern':
      return de.gewinnquellen.steuern;
    case 'gebuehren':
      return de.gewinnquellen.gebuehren;
    case 'nichtZugeordnet':
      return de.gewinnquellen.nichtZugeordnet;
  }
}

function quellenAuswahl(q: Gewinnquelle, name: string): Auswahl | null {
  switch (q.art) {
    case 'position':
      return q.isin === null ? null : { art: 'position', isin: q.isin, name };
    case 'uebrige':
      return { art: 'uebrige', isins: q.isins, name };
    case 'nichtZugeordnet':
      // Ein Rest gegen den Gesamtgewinn, keine Liste von Buchungen.
      return null;
    default:
      return { art: q.art };
  }
}

function quellenKnoten(q: Gewinnquelle, spalte: Spalte, index: number): Knoten {
  const zufluss = q.betragCent > 0;
  const farbe = !zufluss ? FARBE.verlust : q.art === 'position' || q.art === 'uebrige' ? FARBE.gewinn : FARBE.chart5;
  const name = quellenName(q);
  return {
    schluessel: `${spalte}-${q.art}-${q.isin ?? index}`,
    name,
    farbe,
    spalte,
    betragCent: q.betragCent,
    anteil: q.anteil,
    allein: false,
    auswahl: quellenAuswahl(q, name),
  };
}

/**
 * Knoten in Recharts-Reihenfolge: je Spalte von oben nach unten, wie sie die API liefert.
 * Jedes Band laeuft in die Mitte hinein oder aus ihr heraus.
 */
export function graph(d: Gewinnquellen): {
  readonly knoten: readonly Knoten[];
  readonly baender: readonly Band[];
} {
  const verlust = d.nettoCent < 0;
  const links = d.zufluesse.map((q, i) => quellenKnoten(q, 0, i));
  const rechts = d.abfluesse.map((q, i) => quellenKnoten(q, 2, i));
  const netto: Knoten | null =
    d.nettoCent === 0
      ? null
      : {
          schluessel: 'netto',
          name: verlust ? de.gewinnquellen.nettoverlust : de.gewinnquellen.nettogewinn,
          farbe: verlust ? FARBE.verlust : FARBE.chart1,
          spalte: verlust ? 0 : 2,
          betragCent: d.nettoCent,
          anteil: d.nettoAnteil,
          allein: false,
          auswahl: null,
        };
  const mitte: Knoten = {
    schluessel: 'mitte',
    name: verlust ? de.gewinnquellen.abzuege : de.gewinnquellen.brutto,
    farbe: FARBE.chart1,
    spalte: 1,
    betragCent: d.mitteCent,
    anteil: null,
    allein: true,
    auswahl: null,
  };

  const reihe = [...links, ...(netto !== null && verlust ? [netto] : []), mitte, ...(netto !== null && !verlust ? [netto] : []), ...rechts];
  const knoten = reihe.map((k) => ({
    ...k,
    allein: reihe.filter((j) => j.spalte === k.spalte).length === 1,
  }));
  const m = reihe.indexOf(mitte);
  const baender = knoten.flatMap((k, i): Band[] => {
    if (k.spalte === 0) return [{ source: i, target: m, value: Math.abs(k.betragCent) }];
    if (k.spalte === 2) return [{ source: m, target: i, value: Math.abs(k.betragCent) }];
    return [];
  });
  return { knoten, baender };
}

function betragText(cent: number): string {
  const r = richtungswert(cent, euroAusCent);
  return r.pfeil === '' ? r.wert : `${r.pfeil}\u00a0${r.wert}`;
}

export function beschriftungEingabe(k: Knoten, zeichen: number): BeschriftungEingabe {
  return {
    name: k.name,
    betrag: betragText(k.betragCent),
    anteil: k.anteil === null || k.allein ? null : anteilProzent(k.anteil),
    zeichen,
  };
}
