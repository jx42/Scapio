/**
 * Rohantworten, unveraendert archiviert.
 *
 * Das Archiv ist der Grund, warum `npm run verify` moeglich ist: die gesamte Historie
 * laesst sich daraus neu rechnen und mit `depot_tag` vergleichen. [P-08]
 * Es wird geschrieben, gelesen und nie geloggt — es enthaelt Bestaende.
 */

import type { DatabaseSync } from 'node:sqlite';
import { stmt } from './hilfen.ts';

export type Schnappschuss = {
  readonly id: number;
  readonly quelle: string;
  readonly abgerufenAm: string;
  readonly payloadJson: string;
};

type Zeile = { id: number; quelle: string; abgerufen_am: string; payload_json: string };

const zu = (z: Zeile): Schnappschuss => ({
  id: Number(z.id),
  quelle: z.quelle,
  abgerufenAm: z.abgerufen_am,
  payloadJson: z.payload_json,
});

/** @returns die vergebene id. */
export function schreibe(db: DatabaseSync, quelle: string, abgerufenAm: string, payloadJson: string): number {
  const ergebnis = stmt(
    db,
    'INSERT INTO raw_snapshot (quelle, abgerufen_am, payload_json) VALUES (?, ?, ?)',
  ).run(quelle, abgerufenAm, payloadJson);
  return Number(ergebnis.lastInsertRowid);
}

export function letzter(db: DatabaseSync, quelle: string): Schnappschuss | null {
  const zeile = stmt(
    db,
    'SELECT id, quelle, abgerufen_am, payload_json FROM raw_snapshot WHERE quelle = ? ORDER BY abgerufen_am DESC, id DESC LIMIT 1',
  ).get(quelle) as Zeile | undefined;
  return zeile === undefined ? null : zu(zeile);
}

/** Der jeweils neueste Schnappschuss jeder Quelle — die Eingabe fuer `verify`. */
export function neuesteJeQuelle(db: DatabaseSync): Schnappschuss[] {
  const zeilen = stmt(
    db,
    `SELECT r.id, r.quelle, r.abgerufen_am, r.payload_json
       FROM raw_snapshot r
       JOIN (SELECT quelle, MAX(abgerufen_am) AS neu FROM raw_snapshot GROUP BY quelle) m
         ON m.quelle = r.quelle AND m.neu = r.abgerufen_am
      ORDER BY r.quelle, r.id DESC`,
  ).all() as Zeile[];

  const gesehen = new Set<string>();
  const ergebnis: Schnappschuss[] = [];
  for (const z of zeilen) {
    if (gesehen.has(z.quelle)) continue;
    gesehen.add(z.quelle);
    ergebnis.push(zu(z));
  }
  return ergebnis;
}

export function alleFuer(db: DatabaseSync, quelle: string): Schnappschuss[] {
  const zeilen = stmt(
    db,
    'SELECT id, quelle, abgerufen_am, payload_json FROM raw_snapshot WHERE quelle = ? ORDER BY abgerufen_am, id',
  ).all(quelle) as Zeile[];
  return zeilen.map(zu);
}

export function quellen(db: DatabaseSync): string[] {
  const zeilen = stmt(db, 'SELECT DISTINCT quelle FROM raw_snapshot ORDER BY quelle').all() as {
    quelle: string;
  }[];
  return zeilen.map((z) => z.quelle);
}

export function anzahl(db: DatabaseSync): number {
  const zeile = stmt(db, 'SELECT COUNT(*) AS n FROM raw_snapshot').get() as { n: number };
  return Number(zeile.n);
}

/**
 * Haelt das Archiv je Quelle auf `behalten` Eintraege begrenzt. Laeuft nach jedem
 * Ingest-Lauf automatisch mit — siehe `ingest/importieren.ts` — nicht nur von Hand:
 * ohne diese Grenze wuechse `raw_snapshot` unbegrenzt.
 */
export function aeltereEntfernen(db: DatabaseSync, quelle: string, behalten: number): number {
  const ergebnis = stmt(
    db,
    `DELETE FROM raw_snapshot
      WHERE quelle = ?
        AND id NOT IN (SELECT id FROM raw_snapshot WHERE quelle = ? ORDER BY abgerufen_am DESC, id DESC LIMIT ?)`,
  ).run(quelle, quelle, behalten);
  return Number(ergebnis.changes);
}
