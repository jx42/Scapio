/**
 * Der gemeldete Bestand — die Gegenprobe zur Rekonstruktion.
 *
 * Diese Tabelle ist kein Zwischenstand, sondern eine Momentaufnahme: sie wird bei jedem
 * Lauf vollstaendig ersetzt. Was die Bank nicht mehr meldet, ist nicht mehr im Depot.
 * Aus ihr speist sich die Selbstkontrolle in `core/drift.ts`. [P-02]
 */

import type { DatabaseSync } from 'node:sqlite';
import type { KursE6, MengeE8 } from '../../core/dezimal.ts';
import type { Bestand } from '../../core/typen.ts';
import { platzhalter, spaltenliste, stmt } from './hilfen.ts';
import type { Bindung, Spalten } from './hilfen.ts';

type Zeile = { isin: string; name: string; menge_e8: bigint; kurs_e6: bigint; stand: string };

const SPALTEN = { isin: true, name: true, menge_e8: true, kurs_e6: true, stand: true } satisfies Spalten<Zeile>;
const SPALTENLISTE = spaltenliste(SPALTEN);

const zu = (z: Zeile): Bestand => ({
  isin: z.isin,
  name: z.name,
  mengeE8: z.menge_e8 as MengeE8,
  kursE6: z.kurs_e6 as KursE6,
  stand: z.stand,
});

/**
 * Ersetzt den gesamten Bestand. Der Aufrufer haelt die Transaktion —
 * zwischen Loeschen und Schreiben darf niemand lesen. [INV-09]
 */
export function ersetze(db: DatabaseSync, bestaende: readonly Bestand[]): number {
  stmt(db, 'DELETE FROM bestand').run();
  const s = stmt(db, `INSERT INTO bestand (${SPALTENLISTE}) VALUES (${platzhalter(SPALTEN)})`);
  for (const b of bestaende) {
    const bindung: Bindung<Zeile> = { isin: b.isin, name: b.name, menge_e8: b.mengeE8, kurs_e6: b.kursE6, stand: b.stand };
    s.run(bindung);
  }
  return bestaende.length;
}

export function alle(db: DatabaseSync): Bestand[] {
  const zeilen = stmt(db, `SELECT ${SPALTENLISTE} FROM bestand ORDER BY isin`, true).all() as Zeile[];
  return zeilen.map(zu);
}

export function fuerIsin(db: DatabaseSync, isin: string): Bestand | null {
  const zeile = stmt(db, `SELECT ${SPALTENLISTE} FROM bestand WHERE isin = ?`, true).get(isin) as Zeile | undefined;
  return zeile === undefined ? null : zu(zeile);
}

/** ISIN → Name, fuer die Anzeige. Der Name ist Fremdtext. [INV-06] */
export function namen(db: DatabaseSync): Map<string, string> {
  const zeilen = stmt(db, 'SELECT isin, name FROM bestand').all() as { isin: string; name: string }[];
  return new Map(zeilen.map((z) => [z.isin, z.name]));
}

export function stand(db: DatabaseSync): string | null {
  const zeile = stmt(db, 'SELECT MAX(stand) AS s FROM bestand').get() as { s: string | null } | undefined;
  return zeile?.s ?? null;
}

export function anzahl(db: DatabaseSync): number {
  const zeile = stmt(db, 'SELECT COUNT(*) AS n FROM bestand').get() as { n: number };
  return Number(zeile.n);
}
