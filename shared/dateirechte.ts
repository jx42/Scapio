/**
 * Rechte im Datenverzeichnis: Verzeichnisse 0700, Dateien 0600, Schreiben atomar — eine
 * Stelle für Datenbank, Token, Sperre, Protokoll und Übernahme. Unter Windows wirken die
 * Bits nicht; dort gelten die geerbten ACLs von `%LOCALAPPDATA%` (docs/SICHERHEIT.md,
 * Restrisiko 2). [ADR-056]
 */

import { chmodSync, lstatSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { basename } from 'node:path';
import type { LaufFehlerCode } from './laufFehler.ts';

/** Nur der Dateiname in der Meldung: sie kann bis in die Oberfläche gelangen, ein Pfad nicht. */
export class FremdeDatei extends Error {
  readonly code = 'E_DATEI_FREMD' satisfies LaufFehlerCode;
  constructor(pfad: string, grund: string) {
    super(`${basename(pfad)} im Datenverzeichnis ${grund}. Siehe docs/RUNBOOK.md, E_DATEI_FREMD.`);
    this.name = 'FremdeDatei';
  }
}

export function verzeichnisAnlegen(pfad: string): void {
  mkdirSync(pfad, { recursive: true, mode: 0o700 });
  try {
    chmodSync(pfad, 0o700);
  } catch {
    // Fremder Eigentümer: `eigeneDatei` meldet das an der Datei, auf die es ankommt.
  }
}

export function nurFuerMich(datei: string): void {
  try {
    chmodSync(datei, 0o600);
  } catch {
    // Datei fehlt noch oder gehört jemand anderem — `eigeneDatei` entscheidet, ob das zählt.
  }
}

/**
 * Vor dem Öffnen einer Datei, die Geheimnisse oder Depotdaten hält: keine Verknüpfung, eine
 * gewöhnliche Datei, unter POSIX im Besitz dieses Benutzers; danach 0600. `false`, wenn sie
 * fehlt. Eine Verknüpfung könnte die Datenbank oder den Token an einen synchronisierten oder
 * fremden Ort umleiten, ohne dass `chmod` es merkte — `chmod` folgt ihr.
 */
export function eigeneDatei(pfad: string, uid: number | undefined = process.getuid?.()): boolean {
  let info;
  try {
    info = lstatSync(pfad);
  } catch (fehler) {
    if ((fehler as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw fehler;
  }
  if (info.isSymbolicLink()) throw new FremdeDatei(pfad, 'ist eine Verknüpfung');
  if (!info.isFile()) throw new FremdeDatei(pfad, 'ist keine gewöhnliche Datei');
  if (uid !== undefined && info.uid !== uid) throw new FremdeDatei(pfad, 'gehört einem anderen Benutzer');
  nurFuerMich(pfad);
  return true;
}

/**
 * Erst in eine temporäre Datei IM SELBEN Verzeichnis schreiben (0600 schon beim Anlegen),
 * dann per `renameSync` an die eigentliche Stelle — auf macOS und Windows atomar. `wx` mit
 * zufälligem Namen: eine vorhandene oder untergeschobene Temp-Datei wird nie beschrieben.
 */
export function atomarSchreiben(pfad: string, inhalt: string): void {
  const temp = `${pfad}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    writeFileSync(temp, inhalt, { mode: 0o600, flag: 'wx' });
    renameSync(temp, pfad);
  } catch (fehler) {
    rmSync(temp, { force: true });
    throw fehler;
  }
}
