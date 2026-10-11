/**
 * Transaktionen. Die Wahrheit, aus der die gesamte Historie rekonstruiert wird.
 *
 * Der Import ist idempotent [INV-09]: die Bank-ID ist der Primaerschluessel, ein
 * zweiter Lauf schreibt dieselbe Zeile noch einmal und aendert nichts. Geldbetraege
 * kommen als `bigint` heraus, nie als Fliesskommazahl. [INV-02]
 */

import type { DatabaseSync } from 'node:sqlite';
import type { Cent, MengeE8 } from '../../core/dezimal.ts';
import { alsTag } from '../../core/kalender.ts';
import type { Tag } from '../../core/kalender.ts';
import type { Art, Status, Tx } from '../../core/typen.ts';
import { alsBoolean, alsZahl, platzhalter, spaltenliste, stmt, ueberschreibe } from './hilfen.ts';
import type { Bindung, Spalten } from './hilfen.ts';

export type NeueTx = Tx & { readonly gesehenAm: string };

type Zeile = {
  id: string;
  ts: string;
  tag: string;
  art: string;
  typ: string;
  isin: string | null;
  bezug_isin: string | null;
  menge_e8: bigint | null;
  betrag_cent: bigint;
  beschreibung: string | null;
  status: string;
  ist_extern: bigint;
  storniert: bigint;
  gesehen_am: string;
};

const SPALTEN = {
  id: true,
  ts: true,
  tag: true,
  art: true,
  typ: true,
  isin: true,
  bezug_isin: true,
  menge_e8: true,
  betrag_cent: true,
  beschreibung: true,
  status: true,
  ist_extern: true,
  storniert: true,
  gesehen_am: true,
} satisfies Spalten<Zeile>;
const SPALTENLISTE = spaltenliste(SPALTEN);

function zu(z: Zeile): Tx {
  return {
    id: z.id,
    ts: z.ts,
    tag: alsTag(z.tag),
    art: z.art as Art,
    typ: z.typ,
    isin: z.isin,
    bezugIsin: z.bezug_isin,
    mengeE8: z.menge_e8 === null ? null : (z.menge_e8 as MengeE8),
    betragCent: z.betrag_cent as Cent,
    beschreibung: z.beschreibung,
    status: z.status as Status,
    istExtern: alsBoolean(z.ist_extern),
    storniert: alsBoolean(z.storniert),
  };
}

const EINFUEGEN = `INSERT INTO transaktion (${SPALTENLISTE}) VALUES (${platzhalter(SPALTEN)})
  ON CONFLICT(id) DO UPDATE SET ${ueberschreibe(SPALTEN, ['id'])}`;

export function schreibe(db: DatabaseSync, tx: NeueTx): void {
  const bindung: Bindung<Zeile> = {
    id: tx.id,
    ts: tx.ts,
    tag: tx.tag,
    art: tx.art,
    typ: tx.typ,
    isin: tx.isin,
    bezug_isin: tx.bezugIsin,
    menge_e8: tx.mengeE8,
    betrag_cent: tx.betragCent,
    beschreibung: tx.beschreibung,
    status: tx.status,
    ist_extern: alsZahl(tx.istExtern),
    storniert: alsZahl(tx.storniert),
    gesehen_am: tx.gesehenAm,
  };
  stmt(db, EINFUEGEN).run(bindung);
}

/** Aufrufer sorgt fuer die Transaktion — ein Import umfasst mehrere Tabellen. */
export function schreibeViele(db: DatabaseSync, txs: readonly NeueTx[]): number {
  for (const tx of txs) schreibe(db, tx);
  return txs.length;
}

export function alle(db: DatabaseSync): Tx[] {
  const zeilen = stmt(db, `SELECT ${SPALTENLISTE} FROM transaktion ORDER BY tag, ts, id`, true).all() as Zeile[];
  return zeilen.map(zu);
}

export function abTag(db: DatabaseSync, von: Tag): Tx[] {
  const zeilen = stmt(
    db,
    `SELECT ${SPALTENLISTE} FROM transaktion WHERE tag >= ? ORDER BY tag, ts, id`,
    true,
  ).all(von) as Zeile[];
  return zeilen.map(zu);
}

export function fuerIsin(db: DatabaseSync, isin: string): Tx[] {
  const zeilen = stmt(
    db,
    `SELECT ${SPALTENLISTE} FROM transaktion WHERE isin = ? ORDER BY tag, ts, id`,
    true,
  ).all(isin) as Zeile[];
  return zeilen.map(zu);
}

export function ersterTag(db: DatabaseSync): Tag | null {
  const zeile = stmt(
    db,
    "SELECT MIN(tag) AS t FROM transaktion WHERE storniert = 0 AND status = 'EXECUTED'",
  ).get() as { t: string | null } | undefined;
  return zeile?.t == null ? null : alsTag(zeile.t);
}

/**
 * Aeltester Tag, an dem sich seit `seit` etwas geaendert hat — die Eingabe fuer die
 * Hochwassermarke. Aeltere Tage muessen dann nicht neu gerechnet werden. [P-07]
 */
export function aeltesteAenderungSeit(db: DatabaseSync, seit: string): Tag | null {
  const zeile = stmt(db, 'SELECT MIN(tag) AS t FROM transaktion WHERE gesehen_am > ?').get(seit) as
    | { t: string | null }
    | undefined;
  return zeile?.t == null ? null : alsTag(zeile.t);
}

/**
 * IDs, die die Bank nicht mehr liefert, gelten als storniert.
 * Geloescht wird nichts — eine verschwundene Transaktion ist ein Befund, kein Nichts.
 */
export function markiereStorniert(db: DatabaseSync, ids: readonly string[]): number {
  const s = stmt(db, 'UPDATE transaktion SET storniert = 1 WHERE id = ? AND storniert = 0');
  let geaendert = 0;
  for (const id of ids) geaendert += Number(s.run(id).changes);
  return geaendert;
}

export function anzahl(db: DatabaseSync): number {
  const zeile = stmt(db, 'SELECT COUNT(*) AS n FROM transaktion').get() as { n: number };
  return Number(zeile.n);
}

/** Typen, die der Rechenkern nicht kennt — der Lauf vermerkt sie als Hinweis. */
export function typen(db: DatabaseSync): { typ: string; anzahl: number }[] {
  const zeilen = stmt(db, 'SELECT typ, COUNT(*) AS n FROM transaktion GROUP BY typ ORDER BY typ').all() as {
    typ: string;
    n: number;
  }[];
  return zeilen.map((z) => ({ typ: z.typ, anzahl: Number(z.n) }));
}
