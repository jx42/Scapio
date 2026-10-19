/**
 * Risikofreier Zins (€STR), ein Wert je Kalendertag.
 *
 * `zins_pro_jahr` ist REAL und darf es sein: er ist kein Geldbetrag, sondern eine
 * Verhaeltniszahl, die nur als Faktor in `core/risiko.ts` auftritt. [INV-02]
 */

import type { DatabaseSync } from 'node:sqlite';
import type { Tag } from '../../core/kalender.ts';
import { alsTag } from '../../core/kalender.ts';
import type { Zinsreihe } from '../../core/risiko.ts';
import { platzhalter, spaltenliste, stmt, ueberschreibe } from './hilfen.ts';
import type { Bindung, Spalten } from './hilfen.ts';

export type Zinswert = {
  /** YYYY-MM-DD */
  readonly tag: string;
  readonly zinsProJahr: number;
  readonly quelle: string;
};

type Zeile = { tag: string; zins_pro_jahr: number; quelle: string };

const SPALTEN = { tag: true, zins_pro_jahr: true, quelle: true } satisfies Spalten<Zeile>;

const EINFUEGEN = `INSERT INTO zins (${spaltenliste(SPALTEN)}) VALUES (${platzhalter(SPALTEN)})
  ON CONFLICT(tag) DO UPDATE SET ${ueberschreibe(SPALTEN, ['tag'])}`;

export function schreibeViele(db: DatabaseSync, werte: readonly Zinswert[]): number {
  const s = stmt(db, EINFUEGEN);
  for (const w of werte) {
    const bindung: Bindung<Zeile> = { tag: w.tag, zins_pro_jahr: w.zinsProJahr, quelle: w.quelle };
    s.run(bindung);
  }
  return werte.length;
}

export function alle(db: DatabaseSync): Zinswert[] {
  const zeilen = stmt(db, `SELECT ${spaltenliste(SPALTEN)} FROM zins ORDER BY tag`).all() as Zeile[];
  return zeilen.map((z) => ({ tag: z.tag, zinsProJahr: z.zins_pro_jahr, quelle: z.quelle }));
}

/** Die Form, die `core/risiko.ts` erwartet. */
export function alsKarte(db: DatabaseSync): Zinsreihe {
  const karte = new Map<Tag, number>();
  for (const w of alle(db)) karte.set(alsTag(w.tag), w.zinsProJahr);
  return karte;
}

export function letzterTag(db: DatabaseSync): string | null {
  const zeile = stmt(db, 'SELECT MAX(tag) AS t FROM zins').get() as { t: string | null } | undefined;
  return zeile?.t ?? null;
}

export function anzahl(db: DatabaseSync): number {
  const zeile = stmt(db, 'SELECT COUNT(*) AS n FROM zins').get() as { n: number };
  return Number(zeile.n);
}
