/**
 * Laufzustand und die Helfer, die Orchestrierung (`lauf.ts`) und Ernte (`ernte.ts`) beide
 * brauchen. Eigenes Modul, damit die beiden einander nicht importieren.
 */

import { appendFileSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';
import type { Cent } from '../core/dezimal.ts';
import type { Tag } from '../core/kalender.ts';
import type { Kurspunkt } from '../core/kursraster.ts';
import type { Bestand } from '../core/typen.ts';
import type { Aufloesung } from '../db/repository/fondsAufloesung.ts';
import type { LaufSchritt } from '../db/repository/lauf.ts';
import type { NeuerKurs } from '../db/repository/kurs.ts';
import type { Sparplan } from '../db/repository/sparplan.ts';
import type { NeueTx } from '../db/repository/transaktion.ts';
import type { Vpiwert } from '../db/repository/vpi.ts';
import type { Wertpapierart } from '../db/repository/wertpapierArt.ts';
import type { Zinswert } from '../db/repository/zins.ts';
import * as repo from '../db/repository/index.ts';
import { nurFuerMich, verzeichnisAnlegen } from '../shared/dateirechte.ts';
import type { Konfiguration } from '../shared/konfiguration.ts';
import { logPfad } from '../shared/konfiguration.ts';
import type { Hinweis } from '../shared/hinweise.ts';
import { istLaufFehlerCode, type LaufFehlerCode } from '../shared/laufFehler.ts';
import type { QuellenSchluessel } from '../shared/quellen.ts';
import type { EtfStand, Kontext, Schnappschuss } from './importieren.ts';
import type { Befunde } from './plausibilitaet.ts';

export type QuellenStatus = 'erfolg' | 'fehler' | 'übersprungen';

export type LaufErgebnis = {
  readonly laufId: number;
  readonly status: 'erfolg' | 'teilweise' | 'fehler';
  readonly quellen: Readonly<Record<string, QuellenStatus>>;
  readonly hinweise: readonly Hinweis[];
  readonly fehlerCode: string | null;
  readonly neuBerechneteTage: number;
};

export type LaufOptionen = {
  readonly db: DatabaseSync;
  readonly konfiguration: Konfiguration;
  readonly heute: Tag;
  readonly melde?: (quelle: string, status: QuellenStatus) => void;
};

/** Fehlercode einer beliebigen Ausnahme, ohne je ihre Meldung zu uebernehmen. */
function rohCodeVon(fehler: unknown): string {
  const c = (fehler as { code?: unknown }).code;
  return typeof c === 'string' && c.length > 0 ? c : 'E_UNBEKANNT';
}

/** Was in `lauf` landet: ein Code aus `shared/laufFehler.ts`, nie etwa ein `ENOENT` aus Node. */
export function codeVon(fehler: unknown): LaufFehlerCode {
  const c = rohCodeVon(fehler);
  return istLaufFehlerCode(c) ? c : 'E_UNBEKANNT';
}

/** Kurze, inhaltsfreie Beschreibung fuer das Protokoll. */
export function grundVon(fehler: unknown): string {
  const grund = `${(fehler as Error).name ?? 'Fehler'}/${rohCodeVon(fehler)}`;
  // Der JSON-RPC-Code ist eine Zahl aus dem geprueften Umschlag, kein Fremdtext — und ohne
  // ihn ist E_MCP_RPC im Protokoll nicht von einem anderen RPC-Fehler zu unterscheiden.
  const rpc = codeVon(fehler) === 'E_MCP_RPC' ? /JSON-RPC-Code (-?\d+)/.exec((fehler as Error).message) : null;
  return rpc === null ? grund : `${grund} (${rpc[1]!})`;
}

/**
 * Laufzustand, den die Schritte einander reichen. Ein Objekt statt einer Closure-Wolke:
 * jeder Schritt steht als eigene Funktion da und zeigt, was er liest und schreibt.
 * `null` heisst bei den Ernten: die Quelle ist gescheitert, der alte Stand bleibt. [P-08]
 */
export type Lauf = {
  readonly db: DatabaseSync;
  readonly konfiguration: Konfiguration;
  readonly heute: Tag;
  readonly jetzt: string;
  readonly laufId: number;
  readonly befunde: Befunde;
  readonly ctx: Kontext;
  readonly quellen: Record<string, QuellenStatus>;
  /**
   * Fehlercode je gescheiterter Quelle. Nur der Abschluss liest ihn — damit ein 401 mitten im
   * Lauf den Anmeldeknopf freischaltet, auch wenn der Lauf nur "teilweise" endet. [ADR-012]
   */
  readonly quellenFehler: Map<string, string>;
  readonly melde: LaufOptionen['melde'];
  readonly protokoll: (zeile: string) => void;
  readonly schnappschuesse: Schnappschuss[];
  readonly kurspunkte: Kurspunkt[];
  readonly etfStaende: EtfStand[];
  bestaende: readonly Bestand[] | null;
  cashCent: Cent | null;
  transaktionen: readonly NeueTx[] | null;
  sparplaene: readonly Sparplan[] | null;
  fondsAufloesungen: readonly Aufloesung[];
  arten: readonly Wertpapierart[];
  vpiWerte: Vpiwert[];
  zinsWerte: Zinswert[];
  ersterTransaktionsTag: Tag | null;
  gemeldeterGesamtwert: Cent | null;
  // Die zwei Zeitstempel der Summenprobe: wann gelten die eigenen Kurse, wann der
  // Gesamtwert der Bank. [ADR-015]
  kurseAus: string | null;
  gesamtAus: string | null;
  kurse: readonly NeuerKurs[];
  /** Erst nach erfolgreichem Import und Neuberechnung gesetzt; davor melden Abbrueche 0. */
  neuBerechneteTage: number;
};

export function setzeStatus(lauf: Lauf, quelle: string, status: QuellenStatus): void {
  lauf.quellen[quelle] = status;
  lauf.melde?.(quelle, status);
}

export function setzeSchritt(lauf: Lauf, schritt: LaufSchritt): void {
  repo.lauf.setzeSchritt(lauf.db, lauf.laufId, schritt);
}

/** Der Hinweis traegt den Code bis in die Oberflaeche — `quellenFehler` endet mit dem Lauf. */
export function setzeGescheitert(lauf: Lauf, quelle: QuellenSchluessel, fehler: unknown): void {
  const code = codeVon(fehler);
  lauf.quellenFehler.set(quelle, code);
  setzeStatus(lauf, quelle, 'fehler');
  lauf.befunde.hinweis('quelleGescheitert', { quelle, code });
}

export function beendeLauf(lauf: Lauf, status: LaufErgebnis['status'], fehlerCode: string | null): LaufErgebnis {
  const { laufId, quellen, neuBerechneteTage } = lauf;
  repo.lauf.beende(lauf.db, laufId, {
    beendet: new Date().toISOString(),
    status,
    quellen,
    hinweise: lauf.befunde.hinweise,
    fehlerCode,
    // Nie ein Fehlertext aus einer fremden Antwort — der Code genuegt, das Runbook
    // erklaert ihn.
    fehlerText: fehlerCode === null ? null : 'Siehe docs/RUNBOOK.md zum Code.',
  });
  lauf.protokoll(`Ende: ${status}${fehlerCode === null ? '' : ` (${fehlerCode})`}`);
  return { laufId, status, quellen, hinweise: lauf.befunde.hinweise, fehlerCode, neuBerechneteTage };
}

export function schreibeProtokoll(k: Konfiguration, zeile: string): void {
  try {
    verzeichnisAnlegen(k.datenpfad);
    appendFileSync(logPfad(k), `${new Date().toISOString()} ${zeile}\n`, { mode: 0o600 });
    // `mode` greift nur beim Anlegen; ein aelteres Protokoll behielte sonst seine Rechte.
    nurFuerMich(logPfad(k));
  } catch {
    // Ein nicht schreibbares Protokoll darf keinen Lauf beenden.
  }
}
