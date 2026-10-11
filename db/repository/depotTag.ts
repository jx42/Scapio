/**
 * Die rekonstruierte Wertreihe, ein Eintrag je Kalendertag.
 *
 * Jede Zeile traegt `kern_version` und `eingabe_hash`. Beides zusammen ist die
 * Hochwassermarke: ein Tag muss nur dann neu gerechnet werden, wenn sich seine Eingabe
 * geaendert hat oder der Rechenkern ein anderer ist. [P-07] [INV-10]
 */

import type { DatabaseSync } from 'node:sqlite';
import type { Cent } from '../../core/dezimal.ts';
import { alsText } from '../../core/dezimal.ts';
import { alsTag } from '../../core/kalender.ts';
import type { Tag } from '../../core/kalender.ts';
import type { DepotTag, Isin } from '../../core/typen.ts';
import { alsBoolean, alsZahl, platzhalter, spaltenliste, stmt, ueberschreibe } from './hilfen.ts';
import type { Bindung, Spalten } from './hilfen.ts';

export type GespeicherterTag = DepotTag & {
  readonly kernVersion: number;
  readonly eingabeHash: string;
  readonly berechnetAm: string;
  /** Positionsaufteilung dieses Tages, leer solange der Cache noch nicht gefuellt ist. */
  readonly positionen: ReadonlyMap<Isin, Cent>;
};

type Zeile = {
  tag: string;
  wertpapiere_cent: bigint;
  cash_cent: bigint;
  gesamt_cent: bigint;
  netto_einzahlung_kum_cent: bigint;
  kern_version: bigint;
  eingabe_hash: string;
  berechnet_am: string;
  lueckenhaft: bigint;
  positionen_json: string;
};

const SPALTEN = {
  tag: true,
  wertpapiere_cent: true,
  cash_cent: true,
  gesamt_cent: true,
  netto_einzahlung_kum_cent: true,
  kern_version: true,
  eingabe_hash: true,
  berechnet_am: true,
  lueckenhaft: true,
  positionen_json: true,
} satisfies Spalten<Zeile>;
const SPALTENLISTE = spaltenliste(SPALTEN);

/** Cent-Betraege als Text — `JSON.stringify` verlustfrei fuer `bigint`, siehe `core/dezimal.ts`. */
function positionenAlsJson(positionen: ReadonlyMap<Isin, Cent>): string {
  const flach: Record<string, string> = {};
  for (const [isin, cent] of positionen) flach[isin] = alsText(cent);
  return JSON.stringify(flach);
}

function positionenAusJson(json: string): ReadonlyMap<Isin, Cent> {
  const flach = JSON.parse(json) as Record<string, string>;
  const karte = new Map<Isin, Cent>();
  for (const [isin, text] of Object.entries(flach)) karte.set(isin as Isin, BigInt(text) as Cent);
  return karte;
}

const zu = (z: Zeile): GespeicherterTag => ({
  tag: alsTag(z.tag),
  wertpapiereCent: z.wertpapiere_cent as Cent,
  cashCent: z.cash_cent as Cent,
  gesamtCent: z.gesamt_cent as Cent,
  nettoEinzahlungKumCent: z.netto_einzahlung_kum_cent as Cent,
  kernVersion: Number(z.kern_version),
  eingabeHash: z.eingabe_hash,
  berechnetAm: z.berechnet_am,
  lueckenhaft: alsBoolean(z.lueckenhaft),
  positionen: positionenAusJson(z.positionen_json),
});

const EINFUEGEN = `INSERT INTO depot_tag (${SPALTENLISTE}) VALUES (${platzhalter(SPALTEN)})
  ON CONFLICT(tag) DO UPDATE SET ${ueberschreibe(SPALTEN, ['tag'])}`;

export function schreibe(db: DatabaseSync, t: GespeicherterTag): void {
  const bindung: Bindung<Zeile> = {
    tag: t.tag,
    wertpapiere_cent: t.wertpapiereCent,
    cash_cent: t.cashCent,
    gesamt_cent: t.gesamtCent,
    netto_einzahlung_kum_cent: t.nettoEinzahlungKumCent,
    kern_version: t.kernVersion,
    eingabe_hash: t.eingabeHash,
    berechnet_am: t.berechnetAm,
    lueckenhaft: alsZahl(t.lueckenhaft),
    positionen_json: positionenAlsJson(t.positionen),
  };
  stmt(db, EINFUEGEN).run(bindung);
}

/**
 * Aktualisiert nur die Positionsaufteilung eines bereits vorhandenen Tages. Der
 * Summenvergleich in `ingest/neuberechnung.ts` uebergeht eine unveraenderte Zeile —
 * dieser Aufruf laeuft daneben, unbedingt, damit der Positionscache des letzten Tages
 * auch dann frisch ist, wenn seine Summenzeile schon vor diesem Cache entstanden ist.
 */
export function aktualisierePositionen(db: DatabaseSync, tag: Tag, positionen: ReadonlyMap<Isin, Cent>): void {
  stmt(db, 'UPDATE depot_tag SET positionen_json = ? WHERE tag = ?').run(positionenAlsJson(positionen), tag);
}

/** Aufrufer haelt die Transaktion. [INV-09] */
export function schreibeViele(db: DatabaseSync, tage: readonly GespeicherterTag[]): number {
  for (const t of tage) schreibe(db, t);
  return tage.length;
}

export function alle(db: DatabaseSync): GespeicherterTag[] {
  const zeilen = stmt(db, `SELECT ${SPALTENLISTE} FROM depot_tag ORDER BY tag`, true).all() as Zeile[];
  return zeilen.map(zu);
}

export function spanne(db: DatabaseSync, von: Tag, bis: Tag): GespeicherterTag[] {
  const zeilen = stmt(
    db,
    `SELECT ${SPALTENLISTE} FROM depot_tag WHERE tag >= ? AND tag <= ? ORDER BY tag`,
    true,
  ).all(von, bis) as Zeile[];
  return zeilen.map(zu);
}

export function letzter(db: DatabaseSync): GespeicherterTag | null {
  const zeile = stmt(db, `SELECT ${SPALTENLISTE} FROM depot_tag ORDER BY tag DESC LIMIT 1`, true).get() as
    | Zeile
    | undefined;
  return zeile === undefined ? null : zu(zeile);
}

export function fuerTag(db: DatabaseSync, tag: Tag): GespeicherterTag | null {
  const zeile = stmt(db, `SELECT ${SPALTENLISTE} FROM depot_tag WHERE tag = ?`, true).get(tag) as Zeile | undefined;
  return zeile === undefined ? null : zu(zeile);
}

/**
 * Letzter Tag, dessen Zeile noch mit der aktuellen Kernversion gerechnet wurde.
 * Alles danach — und alles mit aelterer Version — muss neu. [INV-10]
 */
export function letzterMitVersion(db: DatabaseSync, kernVersion: number): Tag | null {
  const zeile = stmt(db, 'SELECT MAX(tag) AS t FROM depot_tag WHERE kern_version = ?').get(kernVersion) as
    | { t: string | null }
    | undefined;
  return zeile?.t == null ? null : alsTag(zeile.t);
}

export function gespeicherteKernVersion(db: DatabaseSync): number | null {
  const zeile = stmt(db, 'SELECT MIN(kern_version) AS v FROM depot_tag', true).get() as
    | { v: bigint | null }
    | undefined;
  return zeile?.v == null ? null : Number(zeile.v);
}

/** Ab `von` alles verwerfen — der Anfang jeder Neuberechnung. */
export function loescheAb(db: DatabaseSync, von: Tag): number {
  return Number(stmt(db, 'DELETE FROM depot_tag WHERE tag >= ?').run(von).changes);
}

export function loescheAlles(db: DatabaseSync): number {
  return Number(stmt(db, 'DELETE FROM depot_tag').run().changes);
}

export function ersterTag(db: DatabaseSync): Tag | null {
  const zeile = stmt(db, 'SELECT MIN(tag) AS t FROM depot_tag').get() as { t: string | null } | undefined;
  return zeile?.t == null ? null : alsTag(zeile.t);
}

export function anzahl(db: DatabaseSync): number {
  const zeile = stmt(db, 'SELECT COUNT(*) AS n FROM depot_tag').get() as { n: number };
  return Number(zeile.n);
}

export function lueckenhafteTage(db: DatabaseSync): number {
  const zeile = stmt(db, 'SELECT COUNT(*) AS n FROM depot_tag WHERE lueckenhaft = 1').get() as { n: number };
  return Number(zeile.n);
}

/** Lueckenhafte Tage ab einem Stichtag, einschliesslich. */
export function lueckenhafteTageAb(db: DatabaseSync, ab: Tag): number {
  const zeile = stmt(db, 'SELECT COUNT(*) AS n FROM depot_tag WHERE lueckenhaft = 1 AND tag >= ?').get(ab) as {
    n: number;
  };
  return Number(zeile.n);
}
