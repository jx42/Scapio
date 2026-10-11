/**
 * Kurse je ISIN und Tag.
 *
 * Ein Tag hat genau einen Kurs. Welcher gewinnt, entscheidet der Rang der Herkunft:
 * ein aus einer Transaktion abgeleiteter Kurs schlaegt jeden Chartpunkt, ein feines
 * Zeitfenster schlaegt ein grobes. [P-04] Der Rang steht in `core/kursraster.ts`; hier
 * steht er ein zweites Mal als CASE-Ausdruck, damit der Upsert ihn ohne Nachlesen
 * durchsetzen kann. Aendert sich die Reihenfolge dort, aendert sie sich hier mit.
 */

import type { DatabaseSync } from 'node:sqlite';
import type { KursE6 } from '../../core/dezimal.ts';
import { alsTag } from '../../core/kalender.ts';
import type { Tag } from '../../core/kalender.ts';
import type { Herkunft, Kurspunkt } from '../../core/kursraster.ts';
import { alsBoolean, alsZahl, platzhalter, spaltenliste, stmt, ueberschreibe } from './hilfen.ts';
import type { Bindung, Spalten } from './hilfen.ts';

type Zeile = { isin: string; tag: string; kurs_e6: bigint; herkunft: string; auffaellig: bigint };

const SPALTEN = { isin: true, tag: true, kurs_e6: true, herkunft: true, auffaellig: true } satisfies Spalten<Zeile>;
const SPALTENLISTE = spaltenliste(SPALTEN);

const zu = (z: Zeile): Kurspunkt => ({
  isin: z.isin,
  tag: alsTag(z.tag),
  kurs: z.kurs_e6 as KursE6,
  herkunft: z.herkunft as Herkunft,
});

/** Muss `RANG` aus `core/kursraster.ts` entsprechen. */
const RANG_SQL = `CASE $herkunft
  WHEN 'transaktion' THEN 4
  WHEN 'chart_1m'    THEN 3
  WHEN 'chart_3m'    THEN 2
  WHEN 'chart_1y'    THEN 1
  ELSE 0 END`;

const EINFUEGEN = `INSERT INTO kurs (${SPALTENLISTE})
  VALUES (${platzhalter(SPALTEN)})
  ON CONFLICT(isin, tag) DO UPDATE SET ${ueberschreibe(SPALTEN, ['isin', 'tag'])}
  WHERE ${RANG_SQL} >= CASE kurs.herkunft
    WHEN 'transaktion' THEN 4
    WHEN 'chart_1m'    THEN 3
    WHEN 'chart_3m'    THEN 2
    WHEN 'chart_1y'    THEN 1
    ELSE 0 END`;

export type NeuerKurs = Kurspunkt & { readonly auffaellig?: boolean };

export function schreibe(db: DatabaseSync, k: NeuerKurs): void {
  const bindung: Bindung<Zeile> = {
    isin: k.isin,
    tag: k.tag,
    kurs_e6: k.kurs,
    herkunft: k.herkunft,
    auffaellig: alsZahl(k.auffaellig ?? false),
  };
  stmt(db, EINFUEGEN).run(bindung);
}

export function schreibeViele(db: DatabaseSync, kurse: readonly NeuerKurs[]): number {
  for (const k of kurse) schreibe(db, k);
  return kurse.length;
}

export function alle(db: DatabaseSync): Kurspunkt[] {
  const zeilen = stmt(
    db,
    `SELECT ${SPALTENLISTE} FROM kurs ORDER BY isin, tag`,
    true,
  ).all() as Zeile[];
  return zeilen.map(zu);
}

export function fuerIsin(db: DatabaseSync, isin: string): Kurspunkt[] {
  const zeilen = stmt(
    db,
    `SELECT ${SPALTENLISTE} FROM kurs WHERE isin = ? ORDER BY tag`,
    true,
  ).all(isin) as Zeile[];
  return zeilen.map(zu);
}

export function letzterTag(db: DatabaseSync, isin: string): Tag | null {
  const zeile = stmt(db, 'SELECT MAX(tag) AS t FROM kurs WHERE isin = ?').get(isin) as
    | { t: string | null }
    | undefined;
  return zeile?.t == null ? null : alsTag(zeile.t);
}

export function isins(db: DatabaseSync): string[] {
  const zeilen = stmt(db, 'SELECT DISTINCT isin FROM kurs ORDER BY isin').all() as { isin: string }[];
  return zeilen.map((z) => z.isin);
}

/** Auffaellige Tage — Sprung ueber 30 %. Die Oberflaeche zeigt sie als Fussnote. [P-08] */
export function auffaellige(db: DatabaseSync): { isin: string; tag: Tag }[] {
  const zeilen = stmt(db, 'SELECT isin, tag FROM kurs WHERE auffaellig = 1 ORDER BY isin, tag').all() as {
    isin: string;
    tag: string;
  }[];
  return zeilen.map((z) => ({ isin: z.isin, tag: alsTag(z.tag) }));
}

export function markiereAuffaellig(db: DatabaseSync, isin: string, tag: Tag, auffaellig: boolean): void {
  stmt(db, 'UPDATE kurs SET auffaellig = ? WHERE isin = ? AND tag = ?').run(alsZahl(auffaellig), isin, tag);
}

export function istAuffaellig(db: DatabaseSync, isin: string, tag: Tag): boolean {
  const zeile = stmt(db, 'SELECT auffaellig FROM kurs WHERE isin = ? AND tag = ?', true).get(isin, tag) as
    | { auffaellig: bigint }
    | undefined;
  return zeile === undefined ? false : alsBoolean(zeile.auffaellig);
}

export function anzahl(db: DatabaseSync): number {
  const zeile = stmt(db, 'SELECT COUNT(*) AS n FROM kurs').get() as { n: number };
  return Number(zeile.n);
}
