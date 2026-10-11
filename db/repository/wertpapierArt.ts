/**
 * Wertpapierart je ISIN, aus `get_security_quote`. Siehe Migration 006.
 */

import type { DatabaseSync } from 'node:sqlite';
import { platzhalter, spaltenliste, stmt, ueberschreibe } from './hilfen.ts';
import type { Bindung, Spalten } from './hilfen.ts';

export type Wertpapierart = {
  readonly isin: string;
  /** Fremdtext-nah: nur Grossbuchstaben und Ziffern erwartet, aber ungeprueft. Nie als Markup rendern. [INV-06] */
  readonly art: string;
  readonly geprueftAm: string;
};

type Zeile = { isin: string; art: string; geprueft_am: string };

const SPALTEN = { isin: true, art: true, geprueft_am: true } satisfies Spalten<Zeile>;
const SPALTENLISTE = spaltenliste(SPALTEN);

const EINFUEGEN = `INSERT INTO wertpapier_art (${SPALTENLISTE}) VALUES (${platzhalter(SPALTEN)})
  ON CONFLICT(isin) DO UPDATE SET ${ueberschreibe(SPALTEN, ['isin'])}`;

/** Aufrufer haelt die Transaktion. [INV-09] */
export function setze(db: DatabaseSync, a: Wertpapierart): void {
  const bindung: Bindung<Zeile> = { isin: a.isin, art: a.art, geprueft_am: a.geprueftAm };
  stmt(db, EINFUEGEN).run(bindung);
}

/** ISIN → Art. */
export function alle(db: DatabaseSync): Map<string, string> {
  const zeilen = stmt(db, 'SELECT isin, art FROM wertpapier_art').all() as { isin: string; art: string }[];
  return new Map(zeilen.map((z) => [z.isin, z.art]));
}
