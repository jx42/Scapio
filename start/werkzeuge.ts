/**
 * Wo die Einstiegsdateien der Bauwerkzeuge liegen — und warum nicht in `node_modules/.bin/`.
 *
 * Bisher startete `start/` Vite ueber `node_modules/.bin/vite`. Unter macOS und Linux ist
 * das eine ausfuehrbare Datei mit `#!/usr/bin/env node`; unter Windows legt npm dort
 * dagegen `vite.cmd` und `vite.ps1` an, und die Datei ohne Endung ist ein sh-Skript, das
 * `CreateProcess` nicht starten kann. Der uebliche Ausweg — `shell: true` — ist hier keiner:
 * er ist projektweit verboten [INV-01], und `test/invarianten/inv-01.test.ts` haelt das offen.
 *
 * Also wird das Werkzeug so gestartet, wie sein Shim es auch tut: mit dem Node, der gerade
 * laeuft (`process.execPath`), und der JavaScript-Datei, auf die das `bin`-Feld des Pakets
 * zeigt. Das ist auf allen drei Plattformen derselbe Aufruf, braucht keine Shell und
 * benutzt garantiert dieselbe Node-Version wie der aufrufende Prozess.
 */

import { join } from 'node:path';
import { PROJEKTWURZEL } from '../shared/konfiguration.ts';

/** Das `bin`-Feld des jeweiligen Pakets, als Pfadsegmente. */
const EINSTIEGE = {
  vite: ['vite', 'bin', 'vite.js'],
  vitest: ['vitest', 'vitest.mjs'],
  tsc: ['typescript', 'bin', 'tsc'],
  eslint: ['eslint', 'bin', 'eslint.js'],
} as const;

export type Werkzeug = keyof typeof EINSTIEGE;

/** Absoluter Pfad der Einstiegsdatei — das erste Argument fuer `process.execPath`. */
function werkzeugPfad(name: Werkzeug): string {
  return join(PROJEKTWURZEL, 'node_modules', ...EINSTIEGE[name]);
}

/**
 * Argumentliste fuer `execFile(process.execPath, …)` bzw. `spawn`. Ein Aufruf statt
 * zweier Zeilen, damit an der Aufrufstelle nicht wieder eine Variante entsteht.
 */
export function werkzeugArgumente(name: Werkzeug, ...argumente: readonly string[]): string[] {
  return [werkzeugPfad(name), ...argumente];
}
