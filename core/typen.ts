/**
 * Gemeinsame Begriffe des Rechenkerns.
 *
 * Diese Datei enthaelt ausschliesslich Typen und die Einordnung der Transaktionstypen —
 * keine Rechnung. Die Einordnung ist die folgenreichste Entscheidung der Anwendung [P-05]
 * und steht deshalb an genau einer Stelle.
 */

import type { Cent, MengeE8 } from './dezimal.ts';
import type { Tag } from './kalender.ts';

export type Isin = string;

/** Ist die Transaktion eine Wertpapier- oder eine reine Cash-Bewegung? */
export type Art = 'WERTPAPIER' | 'CASH';

export type Status = 'EXECUTED' | 'PENDING' | 'CANCELED';

export type Tx = {
  readonly id: string;
  /** ISO 8601 mit Offset, wie geliefert. */
  readonly ts: string;
  readonly tag: Tag;
  readonly art: Art;
  /** Typ der Bank, unveraendert uebernommen. */
  readonly typ: string;
  readonly isin: Isin | null;
  /**
   * Das Wertpapier, auf das sich eine reine Cash-Buchung BEZIEHT, ohne dass sich Stuecke
   * bewegen — `cash.relatedIsin` der Bank. Eine Vorabpauschale oder eine Ausschuettung
   * wird dem Verrechnungskonto belastet bzw. gutgeschrieben und traegt deshalb kein
   * `isin`, gehoert aber zu einem ETF.
   *
   * Bewusst NICHT dasselbe Feld wie `isin`: `isin` steuert Mengenreihe, FIFO und
   * Einstand. Traegt eine Steuerbuchung ohne Menge dort eine ISIN, entsteht eine
   * Phantomposition. `bezugIsin` wird ausschliesslich angezeigt, nie gerechnet.
   */
  readonly bezugIsin: Isin | null;
  /** Vorzeichen: Zugang zum Depot positiv, Abgang negativ. */
  readonly mengeE8: MengeE8 | null;
  /** Vorzeichen aus Sicht des Depots: Zufluss positiv, Abfluss negativ. */
  readonly betragCent: Cent;
  /** Fremdtext. Speichern, nie auswerten, nie loggen. [INV-06] */
  readonly beschreibung: string | null;
  readonly status: Status;
  readonly istExtern: boolean;
  readonly storniert: boolean;
};

/**
 * Externe Zahlungen: echtes Kapital, das ins Depot hinein oder aus ihm heraus geht.
 *
 * Ein Sparplankauf ist KEIN externer Fluss — er schiebt Geld nur von der Cash-Seite
 * auf die Wertpapierseite desselben Depots. Wer Kaeufe als Cashflows zaehlt, bekommt
 * eine bedeutungslose Rendite. [P-05]
 */
export const EXTERNE_TYPEN: ReadonlySet<string> = new Set([
  'CASH_TRANSFER_IN',
  'CASH_TRANSFER_OUT',
  'DEPOSIT_TRANSFER',
  // Bareinzahlung aufs Verrechnungskonto. Ueberwiegend echtes, vom Anleger eingesetztes
  // Kapital (Ersteinzahlung, Sparplan-Nachschuss) — ein einmaliger Wechselbonus ist hier
  // die seltene Ausnahme, nicht die Regel. Als Ertrag gezaehlt wuerde der Regelfall die
  // Rendite systematisch nach oben verzerren; die falsche Seite ist die teurere. [P-05]
  'DEPOSIT',
  'PAYOUT',
  'WITHDRAWAL',
  'SEPA_CREDIT_TRANSFER',
  'SEPA_DIRECT_DEBIT',
  // Depotuebertrag in Wertpapierform (Depotwechsel): echtes Kapital tritt ein oder aus,
  // nur eben als Stueck statt als Geldbetrag. Als intern gezaehlt wuerde er als
  // erfundene Rendite erscheinen. [P-05] Ausnahme: ein exakt gegenlaufendes Paar
  // (gleiche ISIN, gleiche Menge) ist ein depotinterner Wechsel, kein echter
  // Kapitalfluss — diese Ausnahme trifft `uebertraege.ts`, nicht diese Einordnung.
  'TRANSFER_IN',
  'TRANSFER_OUT',
]);

/**
 * Ertraege: sie erhoehen den Depotwert, sind aber kein eingesetztes Kapital.
 * Als Einzahlung gewertet wuerden sie die Rendite kuenstlich druecken.
 */
export const ERTRAGS_TYPEN: ReadonlySet<string> = new Set(['INTEREST', 'TAX_RETURN', 'DIVIDEND', 'DISTRIBUTION', 'BONUS']);

/** Interne Umschichtungen zwischen Cash- und Wertpapierseite. */
export const INTERNE_TYPEN: ReadonlySet<string> = new Set([
  'SAVINGS_PLAN',
  'BUY',
  'SELL',
  'ORDER',
  'TRADE',
  // Kauf aus einer Ausschuettung oder aus Taschengeld. Ohne `includeReinvestmentSubtypes`
  // liefert die Bank nur den Sammeltyp. Die Ausschuettung selbst kommt als eigene
  // `DISTRIBUTION` aufs Verrechnungskonto, die Wiederanlage verschiebt sie nur.
  'REINVESTMENT',
  'REINVESTMENT_DISTRIBUTION',
  'REINVESTMENT_POCKET_MONEY',
  // Umtausch (Fondsverschmelzung, ISIN-Wechsel): Stuecke der einen ISIN gehen, die der
  // anderen kommen. Mit Betrag 0 ist das eine Kapitalmassnahme in `fifo.ts`.
  'SWAP_IN',
  'SWAP_OUT',
  // Depot- oder Kontogebuehr: mindert den Cash-Bestand, ist aber keine vom Anleger
  // veranlasste Kapitalbewegung wie eine Auszahlung — kein externer Fluss. [P-05]
  'FEE',
  // Vorabpauschale: mindert den Depotwert wie ein Kursverlust, ist aber keine vom
  // Anleger veranlasste Kapitalbewegung — kein externer Fluss. [P-05]
  'TAX',
]);

/**
 * Steuerbuchungen — quer zur Einordnung oben, deshalb eine eigene Liste.
 *
 * `TAX` (Vorabpauschale, Kapitalertragsteuer) ist intern: kein vom Anleger veranlasster
 * Kapitalfluss. `TAX_RETURN` (Erstattung) ist Ertrag: er erhoeht den Depotwert, ohne
 * Einzahlung zu sein. Beide Einordnungen bleiben, wie sie sind — fuer die ANZEIGE
 * gehoeren die zwei aber in denselben Topf, weil eine Erstattung nichts anderes ist als
 * eine zurueckgenommene Steuer. Ohne diese Liste zaehlte die Kennzahl "Steuern" gar
 * keine Steuer mit. [ADR-014]
 */
export const STEUER_TYPEN: ReadonlySet<string> = new Set(['TAX', 'TAX_RETURN']);

/** Ist das eine Steuerbuchung — Abzug oder Erstattung? */
export function istSteuer(typ: string): boolean {
  return STEUER_TYPEN.has(typ.toUpperCase());
}

/** Gebuehrenbuchung — fuer die Anzeige ein eigener Topf wie die Steuern; die Einordnung bleibt intern. */
export function istGebuehr(typ: string): boolean {
  return typ.toUpperCase() === 'FEE';
}

export type Einordnung = 'extern' | 'ertrag' | 'intern';

/**
 * Ordnet einen Transaktionstyp ein. Unbekannte Typen gelten als intern —
 * ein unbekannter Typ darf die Renditerechnung nicht heimlich verschieben.
 * Der Ingest vermerkt ihn stattdessen als Hinweis im Lauf.
 */
export function einordnen(typ: string): Einordnung {
  const t = typ.toUpperCase();
  if (EXTERNE_TYPEN.has(t)) return 'extern';
  if (ERTRAGS_TYPEN.has(t)) return 'ertrag';
  return 'intern';
}

/** Kennt der Rechenkern diesen Typ ueberhaupt? Steuert den Hinweis im Lauf. */
export function istBekannterTyp(typ: string): boolean {
  const t = typ.toUpperCase();
  return EXTERNE_TYPEN.has(t) || ERTRAGS_TYPEN.has(t) || INTERNE_TYPEN.has(t);
}

/** Zaehlt eine Transaktion fuer die Berechnung, oder ist sie storniert bzw. schwebend? */
export function zaehlt(tx: Tx): boolean {
  return !tx.storniert && tx.status === 'EXECUTED';
}

export type Bestand = {
  readonly isin: Isin;
  readonly name: string;
  readonly mengeE8: MengeE8;
  readonly kursE6: bigint;
  readonly stand: string;
};

export type DepotTag = {
  readonly tag: Tag;
  readonly wertpapiereCent: Cent;
  readonly cashCent: Cent;
  readonly gesamtCent: Cent;
  readonly nettoEinzahlungKumCent: Cent;
  readonly lueckenhaft: boolean;
};

export type Fluss = {
  readonly tag: Tag;
  readonly betrag: Cent;
};
