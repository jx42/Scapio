/**
 * Gemeinsames Handwerkszeug der Repositories.
 *
 * Alle Zugriffe ueber vorbereitete Statements. Keine
 * Zeichenkette wird zu SQL zusammengesetzt — auch keine Tabellennamen. Jedes SQL in
 * `db/repository/` ist deshalb ein Literal, und jeder Wert kommt als Bindung. Einzige
 * Ausnahme sind die Spaltenbausteine unten: sie entstehen beim Laden des Moduls aus
 * Namen, die im Code stehen, nie aus einem Wert zur Laufzeit.
 */

import type { DatabaseSync, StatementSync } from 'node:sqlite';

/**
 * Statement-Zwischenspeicher je Verbindung.
 *
 * Vorbereiten kostet; die Ingest-Schleife bereitet sonst pro Zeile neu vor. Der
 * Schluessel ist das SQL-Literal selbst — es gibt nur endlich viele davon, alle im Code.
 */
const zwischenspeicher = new WeakMap<DatabaseSync, Map<string, StatementSync>>();

export function stmt(db: DatabaseSync, sql: string, bigints = false): StatementSync {
  let fuerDb = zwischenspeicher.get(db);
  if (fuerDb === undefined) {
    fuerDb = new Map();
    zwischenspeicher.set(db, fuerDb);
  }

  const schluessel = bigints ? `B:${sql}` : sql;
  let vorbereitet = fuerDb.get(schluessel);
  if (vorbereitet === undefined) {
    vorbereitet = db.prepare(sql);
    if (bigints) vorbereitet.setReadBigInts(true);
    fuerDb.set(schluessel, vorbereitet);
  }
  return vorbereitet;
}

/**
 * Fuehrt `arbeit` in genau einer Transaktion aus. Wirft sie, wird zurueckgerollt —
 * ein Import ist ganz oder gar nicht. [INV-09]
 *
 * `BEGIN IMMEDIATE` statt `BEGIN`: der Schreiblock wird sofort genommen, nicht erst
 * beim ersten Schreiben. Sonst scheitert der zweite Schreiber mitten im Import.
 */
export function inTransaktion<T>(db: DatabaseSync, arbeit: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const ergebnis = arbeit();
    db.exec('COMMIT');
    return ergebnis;
  } catch (fehler) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // Ist die Transaktion bereits beendet, ist das Rollback ein Nachklang, kein Fehler.
    }
    throw fehler;
  }
}

/** SQLite kennt kein Boolean. 0/1 hin und zurueck, an genau einer Stelle. */
export const alsZahl = (b: boolean): number => (b ? 1 : 0);
export const alsBoolean = (z: number | bigint | null): boolean => Number(z ?? 0) !== 0;

/** Werte, die `node:sqlite` binden kann. */
export type Bindbar = string | number | bigint | null | Uint8Array;

/**
 * Spaltenliste eines Repositorys, vom Compiler an den Zeilentyp gebunden:
 * `const SPALTEN = { … } satisfies Spalten<Zeile>` scheitert, wenn eine Spalte fehlt oder
 * eine zu viel dasteht. Liste, Platzhalter und Bindung folgen aus derselben Quelle.
 */
export type Spalten<Z> = { readonly [K in keyof Z]-?: true };

/** Was ein Upsert bindet: je Spalte ein Wert, benannt wie die Spalte. */
export type Bindung<Z> = { readonly [K in keyof Z]: Bindbar };

export const spaltenliste = (spalten: object): string => Object.keys(spalten).join(', ');

export const platzhalter = (spalten: object): string =>
  Object.keys(spalten)
    .map((k) => `$${k}`)
    .join(', ');

/** `SET`-Zuweisungen fuer `ON CONFLICT … DO UPDATE`: alle Spalten ausser dem Konfliktschluessel. */
export const ueberschreibe = (spalten: object, schluessel: readonly string[]): string =>
  Object.keys(spalten)
    .filter((k) => !schluessel.includes(k))
    .map((k) => `${k} = excluded.${k}`)
    .join(', ');
