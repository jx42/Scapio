/**
 * Bestandteile der ETFs aus den iShares-CSV-Dateien.
 *
 * Der Primaerschluessel enthaelt `stand`, damit ein neuer Abruf die alte Zusammensetzung
 * nicht ueberschreibt: fuer den Look-Through zaehlt der neueste Stand je Fonds, aber der
 * vorherige bleibt lesbar, falls ein Abruf halb misslingt.
 *
 * `name` ist Fremdtext aus einer CSV. Speichern, anzeigen — nie als Markup, nie in ein
 * `href`. [INV-06]
 */

import type { DatabaseSync } from 'node:sqlite';
import type { Bestandteil } from '../../core/lookthrough.ts';
import { platzhalter, spaltenliste, stmt, ueberschreibe } from './hilfen.ts';
import type { Bindung, Spalten } from './hilfen.ts';

export type GespeicherterBestandteil = Bestandteil & { readonly stand: string };

type Zeile = {
  fonds_isin: string;
  stand: string;
  unternehmen_isin: string;
  name: string;
  gewicht: number;
  sektor: string | null;
  land: string | null;
};

const SPALTEN = {
  fonds_isin: true,
  stand: true,
  unternehmen_isin: true,
  name: true,
  gewicht: true,
  sektor: true,
  land: true,
} satisfies Spalten<Zeile>;
const SPALTENLISTE = spaltenliste(SPALTEN);

const zu = (z: Zeile): GespeicherterBestandteil => ({
  fondsIsin: z.fonds_isin,
  stand: z.stand,
  unternehmenIsin: z.unternehmen_isin,
  name: z.name,
  gewicht: z.gewicht,
  sektor: z.sektor,
  land: z.land,
});

const EINFUEGEN = `INSERT INTO etf_bestandteil (${SPALTENLISTE}) VALUES (${platzhalter(SPALTEN)})
  ON CONFLICT(fonds_isin, stand, unternehmen_isin) DO UPDATE SET
    ${ueberschreibe(SPALTEN, ['fonds_isin', 'stand', 'unternehmen_isin'])}`;

/**
 * Ersetzt die Zusammensetzung eines Fonds fuer einen Stand.
 * Aufrufer haelt die Transaktion — ein halb geschriebener Fonds ergibt falsche
 * Gewichte, und falsche Gewichte sehen aus wie richtige. [INV-09]
 */
export function ersetzeFuerStand(
  db: DatabaseSync,
  fondsIsin: string,
  stand: string,
  teile: readonly Bestandteil[],
): number {
  stmt(db, 'DELETE FROM etf_bestandteil WHERE fonds_isin = ? AND stand = ?').run(fondsIsin, stand);
  const s = stmt(db, EINFUEGEN);
  for (const t of teile) {
    const bindung: Bindung<Zeile> = {
      fonds_isin: fondsIsin,
      stand,
      unternehmen_isin: t.unternehmenIsin,
      name: t.name,
      gewicht: t.gewicht,
      sektor: t.sektor,
      land: t.land,
    };
    s.run(bindung);
  }
  return teile.length;
}

export function neuesterStand(db: DatabaseSync, fondsIsin: string): string | null {
  const zeile = stmt(db, 'SELECT MAX(stand) AS s FROM etf_bestandteil WHERE fonds_isin = ?').get(fondsIsin) as
    | { s: string | null }
    | undefined;
  return zeile?.s ?? null;
}

/** Die jeweils neueste Zusammensetzung aller Fonds — die Eingabe fuer den Look-Through. */
export function aktuelle(db: DatabaseSync): GespeicherterBestandteil[] {
  const zeilen = stmt(
    db,
    `SELECT e.fonds_isin, e.stand, e.unternehmen_isin, e.name, e.gewicht, e.sektor, e.land
       FROM etf_bestandteil e
       JOIN (SELECT fonds_isin, MAX(stand) AS neu FROM etf_bestandteil GROUP BY fonds_isin) m
         ON m.fonds_isin = e.fonds_isin AND m.neu = e.stand
      ORDER BY e.fonds_isin, e.gewicht DESC`,
  ).all() as Zeile[];
  return zeilen.map(zu);
}

export function fuerFonds(db: DatabaseSync, fondsIsin: string, stand: string): GespeicherterBestandteil[] {
  const zeilen = stmt(
    db,
    `SELECT ${SPALTENLISTE} FROM etf_bestandteil WHERE fonds_isin = ? AND stand = ? ORDER BY gewicht DESC`,
  ).all(fondsIsin, stand) as Zeile[];
  return zeilen.map(zu);
}

export function fonds(db: DatabaseSync): string[] {
  const zeilen = stmt(db, 'SELECT DISTINCT fonds_isin FROM etf_bestandteil ORDER BY fonds_isin').all() as {
    fonds_isin: string;
  }[];
  return zeilen.map((z) => z.fonds_isin);
}

/** Alle Staende ausser den letzten `behalten` je Fonds entfernen. */
export function alteStaendeEntfernen(db: DatabaseSync, fondsIsin: string, behalten = 2): number {
  const ergebnis = stmt(
    db,
    `DELETE FROM etf_bestandteil
      WHERE fonds_isin = ?
        AND stand NOT IN (
          SELECT stand FROM (SELECT DISTINCT stand FROM etf_bestandteil WHERE fonds_isin = ?)
           ORDER BY stand DESC LIMIT ?)`,
  ).run(fondsIsin, fondsIsin, behalten);
  return Number(ergebnis.changes);
}

export function anzahl(db: DatabaseSync): number {
  const zeile = stmt(db, 'SELECT COUNT(*) AS n FROM etf_bestandteil').get() as { n: number };
  return Number(zeile.n);
}
