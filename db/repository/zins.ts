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
import { stmt } from './hilfen.ts';

export type Zinswert = {
  /** YYYY-MM-DD */
  readonly tag: string;
  readonly zinsProJahr: number;
  readonly quelle: string;
};

type Zeile = { tag: string; zins_pro_jahr: number; quelle: string };

const EINFUEGEN = `INSERT INTO zins (tag, zins_pro_jahr, quelle) VALUES (?, ?, ?)
  ON CONFLICT(tag) DO UPDATE SET zins_pro_jahr = excluded.zins_pro_jahr, quelle = excluded.quelle`;

export function schreibeViele(db: DatabaseSync, werte: readonly Zinswert[]): number {
  const s = stmt(db, EINFUEGEN);
  for (const w of werte) s.run(w.tag, w.zinsProJahr, w.quelle);
  return werte.length;
}

export function alle(db: DatabaseSync): Zinswert[] {
  const zeilen = stmt(db, 'SELECT tag, zins_pro_jahr, quelle FROM zins ORDER BY tag').all() as Zeile[];
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
