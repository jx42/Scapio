/**
 * Verbraucherpreisindex, ein Wert je Monat.
 *
 * `index_wert` ist REAL und darf es sein: er ist kein Geldbetrag, sondern eine
 * Verhaeltniszahl, die nur als Faktor in `core/inflation.ts` auftritt — dort wird sie
 * vor der Multiplikation in einen Bruch aus Ganzzahlen zerlegt. [INV-02]
 */

import type { DatabaseSync } from 'node:sqlite';
import type { Vpi } from '../../core/inflation.ts';
import { stmt } from './hilfen.ts';

export type Vpiwert = {
  /** YYYY-MM */
  readonly monat: string;
  readonly indexWert: number;
  readonly quelle: string;
};

type Zeile = { monat: string; index_wert: number; quelle: string };

const EINFUEGEN = `INSERT INTO vpi (monat, index_wert, quelle) VALUES (?, ?, ?)
  ON CONFLICT(monat) DO UPDATE SET index_wert = excluded.index_wert, quelle = excluded.quelle`;

export function schreibeViele(db: DatabaseSync, werte: readonly Vpiwert[]): number {
  const s = stmt(db, EINFUEGEN);
  for (const w of werte) s.run(w.monat, w.indexWert, w.quelle);
  return werte.length;
}

export function alle(db: DatabaseSync): Vpiwert[] {
  const zeilen = stmt(db, 'SELECT monat, index_wert, quelle FROM vpi ORDER BY monat').all() as Zeile[];
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
