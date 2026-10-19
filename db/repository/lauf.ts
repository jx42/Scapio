/**
 * Protokoll der Ingest-Laeufe.
 *
 * `hinweise_json` haelt Plausibilitaetsbefunde als `Hinweis` (`hinweise.ts`) — NIE Inhalte.
 * Kein Betrag gehoert hier hinein, ein Wertpapiername nur beim Tagessprung: das Protokoll
 * wird angezeigt und bei der Fehlersuche kopiert, die MCP-Antwort dagegen nie geloggt.
 */

import type { DatabaseSync } from 'node:sqlite';
import type { Hinweis } from '../../shared/hinweise.ts';
import { spaltenliste, stmt } from './hilfen.ts';
import type { Bindung, Spalten } from './hilfen.ts';

export type LaufStatus = 'laufend' | 'erfolg' | 'teilweise' | 'fehler';
export type QuellenStatus = 'erfolg' | 'fehler' | 'übersprungen';

/**
 * Die Schritte eines Laufs, wie die Oberflaeche sie nennt — grober als die Quellen. Nur die
 * Abrufe: Import und Neuberechnung laufen synchron und halten den Server an, `/api/lauf`
 * antwortet erst wieder, wenn der Lauf zu Ende ist.
 */
export const LAUF_SCHRITTE = ['depot', 'kurse', 'fonds', 'inflation'] as const;
export type LaufSchritt = (typeof LAUF_SCHRITTE)[number];

function istLaufSchritt(wert: string | null): wert is LaufSchritt {
  return (LAUF_SCHRITTE as readonly (string | null)[]).includes(wert);
}

export type Lauf = {
  readonly id: number;
  readonly gestartet: string;
  readonly beendet: string | null;
  readonly status: LaufStatus;
  readonly fehlerCode: string | null;
  readonly fehlerText: string | null;
  readonly quellen: Readonly<Record<string, QuellenStatus>>;
  readonly hinweise: readonly Hinweis[];
  readonly schritt: LaufSchritt | null;
};

type Zeile = {
  id: bigint;
  gestartet: string;
  beendet: string | null;
  status: string;
  fehler_code: string | null;
  fehler_text: string | null;
  quellen_json: string;
  hinweise_json: string | null;
  schritt: string | null;
};

const SPALTEN = spaltenliste({
  id: true,
  gestartet: true,
  beendet: true,
  status: true,
  fehler_code: true,
  fehler_text: true,
  quellen_json: true,
  hinweise_json: true,
  schritt: true,
} satisfies Spalten<Zeile>);

function zu(z: Zeile): Lauf {
  return {
    id: Number(z.id),
    gestartet: z.gestartet,
    beendet: z.beendet,
    status: z.status as LaufStatus,
    fehlerCode: z.fehler_code,
    fehlerText: z.fehler_text,
    quellen: sicherLesen<Record<string, QuellenStatus>>(z.quellen_json, {}),
    hinweise: alsHinweise(sicherLesen<unknown>(z.hinweise_json, [])),
    schritt: istLaufSchritt(z.schritt) ? z.schritt : null,
  };
}

/** Eigenes JSON, trotzdem defensiv: eine kaputte Zeile darf die Anzeige nicht sprengen. */
function sicherLesen<T>(text: string | null, vorgabe: T): T {
  if (text === null) return vorgabe;
  try {
    return JSON.parse(text) as T;
  } catch {
    return vorgabe;
  }
}

/** Zeilen vor der Umstellung auf Arten halten fertige Saetze; sie bleiben als `text` lesbar. */
function alsHinweise(roh: unknown): Hinweis[] {
  if (!Array.isArray(roh)) return [];
  return roh.flatMap((h: unknown): Hinweis[] => {
    if (typeof h === 'string') return [{ art: 'text', werte: { text: h } }];
    if (typeof h === 'object' && h !== null && 'art' in h && typeof h.art === 'string' && 'werte' in h) {
      return [h as Hinweis];
    }
    return [];
  });
}

/** @returns die id des begonnenen Laufs. */
export function starte(db: DatabaseSync, gestartet: string): number {
  const ergebnis = stmt(
    db,
    "INSERT INTO lauf (gestartet, status, quellen_json) VALUES (?, 'laufend', '{}')",
  ).run(gestartet);
  return Number(ergebnis.lastInsertRowid);
}

/** Ausserhalb jeder Transaktion: der Import haelt seine, und `/api/lauf` soll den Schritt sofort sehen. */
export function setzeSchritt(db: DatabaseSync, id: number, schritt: LaufSchritt): void {
  stmt(db, 'UPDATE lauf SET schritt = ? WHERE id = ?').run(schritt, id);
}

export type Abschluss = {
  readonly beendet: string;
  readonly status: LaufStatus;
  readonly quellen: Readonly<Record<string, QuellenStatus>>;
  readonly hinweise?: readonly Hinweis[];
  readonly fehlerCode?: string | null;
  readonly fehlerText?: string | null;
};

export function beende(db: DatabaseSync, id: number, a: Abschluss): void {
  const bindung: Bindung<Omit<Zeile, 'gestartet' | 'schritt'>> = {
    id,
    beendet: a.beendet,
    status: a.status,
    fehler_code: a.fehlerCode ?? null,
    fehler_text: a.fehlerText ?? null,
    quellen_json: JSON.stringify(a.quellen),
    hinweise_json: JSON.stringify(a.hinweise ?? []),
  };
  stmt(
    db,
    `UPDATE lauf SET beendet = $beendet, status = $status, fehler_code = $fehler_code, fehler_text = $fehler_text,
       quellen_json = $quellen_json, hinweise_json = $hinweise_json, schritt = NULL WHERE id = $id`,
  ).run(bindung);
}

export function letzter(db: DatabaseSync): Lauf | null {
  const zeile = stmt(db, `SELECT ${SPALTEN} FROM lauf ORDER BY id DESC LIMIT 1`, true).get() as Zeile | undefined;
  return zeile === undefined ? null : zu(zeile);
}

/** Der letzte Lauf, der ueberhaupt etwas gebracht hat — der Stand, den die Kachel nennt. */
export function letzterErfolgreicher(db: DatabaseSync): Lauf | null {
  const zeile = stmt(
    db,
    `SELECT ${SPALTEN} FROM lauf WHERE status IN ('erfolg', 'teilweise') ORDER BY id DESC LIMIT 1`,
    true,
  ).get() as Zeile | undefined;
  return zeile === undefined ? null : zu(zeile);
}

export function letzte(db: DatabaseSync, anzahl = 20): Lauf[] {
  const zeilen = stmt(db, `SELECT ${SPALTEN} FROM lauf ORDER BY id DESC LIMIT ?`, true).all(anzahl) as Zeile[];
  return zeilen.map(zu);
}

/**
 * Laeufe, die als `laufend` haengen geblieben sind — nach einem Absturz.
 * Der naechste Start raeumt sie auf, damit die Anzeige nicht ewig "laeuft" sagt.
 */
export function raeumeHaengende(db: DatabaseSync, beendet: string): number {
  const ergebnis = stmt(
    db,
    `UPDATE lauf SET status = 'fehler', beendet = ?, fehler_code = 'E_ABGEBROCHEN',
       fehler_text = 'Der Lauf wurde nicht ordentlich beendet.', schritt = NULL
       WHERE status = 'laufend'`,
  ).run(beendet);
  return Number(ergebnis.changes);
}
