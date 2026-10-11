/**
 * Dateirechte im Test — und die eine Stelle, an der Windows nicht mitspielt.
 *
 * `0700`/`0600` sind POSIX-Bits. Windows kennt sie nicht: NTFS regelt den Zugriff ueber
 * ACLs, und `fs.stat` liefert dort einen erfundenen Modus (0666, bei gesetztem
 * Schreibschutz 0444) — unabhaengig davon, wer die Datei tatsaechlich lesen darf. Eine
 * Zusicherung auf `0600` waere dort nicht streng, sondern falsch: sie pruefte einen Wert,
 * den das Betriebssystem nie vergibt.
 *
 * Deshalb: auf POSIX zusichern, auf Windows uebergehen. Dass der Schutz von Datenbank und
 * Token unter Windows damit an den geerbten Ordnerrechten haengt und nicht an einer eigenen
 * Zusicherung, ist eine bekannte und benannte Luecke — siehe docs/SICHERHEIT.md,
 * "Dateirechte", und [ADR-005]. Sie wird hier nicht mit `icacls` uebertuencht: das waere
 * ein weiterer Kindprozess in einem Programm, das ihre Zahl bewusst klein haelt.
 */

import { statSync } from 'node:fs';
import { expect } from 'vitest';

/** Setzt diese Plattform die POSIX-Rechtebits ueberhaupt um? */
export const POSIX_RECHTE = process.platform !== 'win32';

/** Sichert `modus` zu — auf Windows ein no-op, mit der Begruendung im Kopf dieser Datei. */
export function erwarteRechte(pfad: string, modus: number): void {
  if (!POSIX_RECHTE) return;
  expect(statSync(pfad).mode & 0o777).toBe(modus);
}
