/**
 * Aufloesung je gehaltener ISIN: welcher Anbieter, ob die Bestandteile einsehbar sind.
 *
 * Ersetzt fuer die automatisch erkannten Fonds das Durchprobieren gegen `funds.json`.
 * `durchsicht` bleibt eine eigene Spalte, nicht aus `anbieter` abgeleitet — siehe
 * Migration 005.
 */

import type { DatabaseSync } from 'node:sqlite';
import { platzhalter, spaltenliste, stmt, ueberschreibe } from './hilfen.ts';
import type { Bindung, Spalten } from './hilfen.ts';

export type Anbietername = 'ishares' | 'xtrackers' | 'amundi' | 'firsttrust' | 'lgim';
export type Durchsicht = 'moeglich' | 'gesperrt' | 'unbekannt';

/**
 * Die drei Anbieter, die `ingest/anbieter.ts` automatisch aufloest und die auch von Hand
 * in `funds.json` eingetragen werden koennen — Typquelle fuer den funds.json-Pfad in
 * `ingest/lauf.ts`, fuer `server/lesemodell.ts` und, nur als Typ, fuer die Oberflaeche
 * (`import type`, kein Serverpfad im Bundle [INV-11]). `Anbietername` bleibt breiter:
 * `firsttrust`/`lgim` sind reserviert, aber nicht funds.json-faehig. [ADR-018]
 */
export const FUNDS_JSON_ANBIETER = ['ishares', 'xtrackers', 'amundi'] as const satisfies readonly Anbietername[];
export type FundsJsonAnbieter = (typeof FUNDS_JSON_ANBIETER)[number];

export type Aufloesung = {
  readonly isin: string;
  readonly anbieter: Anbietername | null;
  readonly durchsicht: Durchsicht;
  readonly adresse: string | null;
  readonly geprueftAm: string;
};

type Zeile = {
  isin: string;
  anbieter: string | null;
  durchsicht: string;
  adresse: string | null;
  geprueft_am: string;
};

const SPALTEN = {
  isin: true,
  anbieter: true,
  durchsicht: true,
  adresse: true,
  geprueft_am: true,
} satisfies Spalten<Zeile>;
const SPALTENLISTE = spaltenliste(SPALTEN);

const zu = (z: Zeile): Aufloesung => ({
  isin: z.isin,
  anbieter: z.anbieter as Anbietername | null,
  durchsicht: z.durchsicht as Durchsicht,
  adresse: z.adresse,
  geprueftAm: z.geprueft_am,
});

const EINFUEGEN = `INSERT INTO fonds_aufloesung (${SPALTENLISTE}) VALUES (${platzhalter(SPALTEN)})
  ON CONFLICT(isin) DO UPDATE SET ${ueberschreibe(SPALTEN, ['isin'])}`;

/**
 * Schreibt eine Aufloesung fest — neu oder ueberschreibend. Aufrufer haelt die
 * Transaktion. [INV-09]
 */
export function setze(db: DatabaseSync, a: Aufloesung): void {
  const bindung: Bindung<Zeile> = {
    isin: a.isin,
    anbieter: a.anbieter,
    durchsicht: a.durchsicht,
    adresse: a.adresse,
    geprueft_am: a.geprueftAm,
  };
  stmt(db, EINFUEGEN).run(bindung);
}

export function fuerIsin(db: DatabaseSync, isin: string): Aufloesung | null {
  const zeile = stmt(db, `SELECT ${SPALTENLISTE} FROM fonds_aufloesung WHERE isin = ?`).get(isin) as Zeile | undefined;
  return zeile === undefined ? null : zu(zeile);
}

export function alle(db: DatabaseSync): Aufloesung[] {
  const zeilen = stmt(db, `SELECT ${SPALTENLISTE} FROM fonds_aufloesung ORDER BY isin`).all() as Zeile[];
  return zeilen.map(zu);
}

export function anzahl(db: DatabaseSync): number {
  const zeile = stmt(db, 'SELECT COUNT(*) AS n FROM fonds_aufloesung').get() as { n: number };
  return Number(zeile.n);
}
