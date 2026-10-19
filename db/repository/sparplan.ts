/**
 * Sparplaene. Nur gelesen und angezeigt — diese Anwendung legt keinen an und
 * entfernt keinen. Sie ist ein Beobachter, kein Akteur. [INV-01]
 *
 * Wie `bestand` eine Momentaufnahme: bei jedem Lauf vollstaendig ersetzt.
 */

import type { DatabaseSync } from 'node:sqlite';
import type { Cent } from '../../core/dezimal.ts';
import { platzhalter, spaltenliste, stmt } from './hilfen.ts';
import type { Bindung, Spalten } from './hilfen.ts';

export type Sparplan = {
  readonly isin: string;
  /** Fremdtext. [INV-06] */
  readonly name: string;
  readonly betragCent: Cent;
  readonly frequenz: string;
  readonly tagImMonat: number | null;
  /** YYYY-MM-DD oder null, wenn die Bank keinen Termin nennt. */
  readonly naechsteAusfuehrung: string | null;
  readonly stand: string;
};

type Zeile = {
  isin: string;
  name: string;
  betrag_cent: bigint;
  frequenz: string;
  tag_im_monat: bigint | null;
  naechste_ausfuehrung: string | null;
  stand: string;
};

const SPALTEN = {
  isin: true,
  name: true,
  betrag_cent: true,
  frequenz: true,
  tag_im_monat: true,
  naechste_ausfuehrung: true,
  stand: true,
} satisfies Spalten<Zeile>;
const SPALTENLISTE = spaltenliste(SPALTEN);

const zu = (z: Zeile): Sparplan => ({
  isin: z.isin,
  name: z.name,
  betragCent: z.betrag_cent as Cent,
  frequenz: z.frequenz,
  tagImMonat: z.tag_im_monat === null ? null : Number(z.tag_im_monat),
  naechsteAusfuehrung: z.naechste_ausfuehrung,
  stand: z.stand,
});

/** Aufrufer haelt die Transaktion. [INV-09] */
export function ersetze(db: DatabaseSync, plaene: readonly Sparplan[]): number {
  stmt(db, 'DELETE FROM sparplan').run();
  const s = stmt(db, `INSERT INTO sparplan (${SPALTENLISTE}) VALUES (${platzhalter(SPALTEN)})`);
  for (const p of plaene) {
    const bindung: Bindung<Zeile> = {
      isin: p.isin,
      name: p.name,
      betrag_cent: p.betragCent,
      frequenz: p.frequenz,
      tag_im_monat: p.tagImMonat,
      naechste_ausfuehrung: p.naechsteAusfuehrung,
      stand: p.stand,
    };
    s.run(bindung);
  }
  return plaene.length;
}

export function alle(db: DatabaseSync): Sparplan[] {
  const zeilen = stmt(db, `SELECT ${SPALTENLISTE} FROM sparplan ORDER BY isin`, true).all() as Zeile[];
  return zeilen.map(zu);
}

/** Summe der monatlichen Raten — die geplante Sparrate, nicht die tatsaechliche. */
export function monatsSumme(db: DatabaseSync): Cent {
  let summe = 0n;
  for (const p of alle(db)) {
    const f = p.frequenz.toUpperCase();
    if (f === 'MONTHLY' || f === 'MONATLICH') summe += p.betragCent;
    else if (f === 'WEEKLY' || f === 'WOECHENTLICH') summe += (p.betragCent * 52n) / 12n;
    else if (f === 'QUARTERLY' || f === 'QUARTALSWEISE') summe += p.betragCent / 3n;
  }
  return summe as Cent;
}

export function anzahl(db: DatabaseSync): number {
  const zeile = stmt(db, 'SELECT COUNT(*) AS n FROM sparplan').get() as { n: number };
  return Number(zeile.n);
}
