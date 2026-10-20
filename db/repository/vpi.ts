/**
 * Verbraucherpreisindex, ein Wert je Monat.
 *
 * `index_wert` ist REAL und darf es sein: er ist kein Geldbetrag, sondern eine
 * Verhaeltniszahl, die nur als Faktor in `core/inflation.ts` auftritt — dort wird sie
 * vor der Multiplikation in einen Bruch aus Ganzzahlen zerlegt. [INV-02]
 */

import type { DatabaseSync } from 'node:sqlite';
import type { Vpi } from '../../core/inflation.ts';
import { platzhalter, spaltenliste, stmt, ueberschreibe } from './hilfen.ts';
import type { Bindung, Spalten } from './hilfen.ts';

export type Vpiwert = {
  /** YYYY-MM */
  readonly monat: string;
  readonly indexWert: number;
  readonly quelle: string;
};

type Zeile = { monat: string; index_wert: number; quelle: string };

const SPALTEN = { monat: true, index_wert: true, quelle: true } satisfies Spalten<Zeile>;

const EINFUEGEN = `INSERT INTO vpi (${spaltenliste(SPALTEN)}) VALUES (${platzhalter(SPALTEN)})
  ON CONFLICT(monat) DO UPDATE SET ${ueberschreibe(SPALTEN, ['monat'])}`;

export function schreibeViele(db: DatabaseSync, werte: readonly Vpiwert[]): number {
  const s = stmt(db, EINFUEGEN);
  for (const w of werte) {
    const bindung: Bindung<Zeile> = { monat: w.monat, index_wert: w.indexWert, quelle: w.quelle };
    s.run(bindung);
  }
  return werte.length;
}

export function alle(db: DatabaseSync): Vpiwert[] {
  const zeilen = stmt(db, `SELECT ${spaltenliste(SPALTEN)} FROM vpi ORDER BY monat`).all() as Zeile[];
  return zeilen.map((z) => ({ monat: z.monat, indexWert: z.index_wert, quelle: z.quelle }));
}

/** Die Form, die `core/inflation.ts` erwartet. */
export function alsKarte(db: DatabaseSync): Vpi {
  const karte = new Map<string, number>();
  for (const w of alle(db)) karte.set(w.monat, w.indexWert);
  return karte;
}

export function letzterMonat(db: DatabaseSync): string | null {
  const zeile = stmt(db, 'SELECT MAX(monat) AS m FROM vpi').get() as { m: string | null } | undefined;
  return zeile?.m ?? null;
}

export function anzahl(db: DatabaseSync): number {
  const zeile = stmt(db, 'SELECT COUNT(*) AS n FROM vpi').get() as { n: number };
  return Number(zeile.n);
}
