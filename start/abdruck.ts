/**
 * Der Abdruck ueber `core/` und das Skript, das ihn festhaelt. [INV-10]
 *
 * `test/invarianten/inv-10.test.ts` rechnet den Abdruck neu und vergleicht ihn mit
 * `core/.abdruck.json`. Weichen sie voneinander ab, hat sich der Rechenkern geaendert,
 * ohne dass `KERN_VERSION` mitgezogen wurde — und in der Datenbank stuenden sonst
 * Zeilen aus zwei Rechenstaenden nebeneinander, ohne dass man es einer Zahl ansieht.
 *
 * `npm run abdruck` schreibt die Datei neu. Aufzurufen, NACHDEM `KERN_VERSION` erhoeht
 * wurde: das Skript nimmt die Version, wie sie dasteht, und fragt nicht nach. Es soll
 * den Abdruck festhalten, nicht die Entscheidung treffen.
 */

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { KERN_VERSION } from '../core/version.ts';

const WURZEL = fileURLToPath(new URL('../', import.meta.url)).replace(/\/$/, '');
export const ABDRUCK_DATEI = join(WURZEL, 'core', '.abdruck.json');

export type Abdruckdatei = {
  readonly kernVersion: number;
  readonly abdruck: string;
};

/**
 * Abdruck ueber `core/`: Pfad und Inhalt jeder Quelldatei, nach Pfad sortiert.
 *
 * Bewusst ueber den ROHEN Inhalt, nicht ueber ein geparstes Programm: auch eine
 * geaenderte Kommentarzeile hebt den Abdruck. Das ist eine Unbequemlichkeit und keine
 * Ungenauigkeit — lieber eine Version zu viel erhoeht als eine zu wenig. Die eine
 * Richtung kostet Sekunden Rechenzeit, die andere kostet falsche Zahlen.
 *
 * `version.ts` bleibt draussen: sonst aenderte jede Versionserhoehung genau den
 * Abdruck, den sie bestaetigen soll.
 */
export function abdruckVonCore(): string {
  const verzeichnis = join(WURZEL, 'core');
  const namen = readdirSync(verzeichnis)
    .filter((n) => n.endsWith('.ts') && n !== 'version.ts')
    .sort();

  const h = createHash('sha256');
  for (const name of namen) {
    h.update(name);
    h.update('\0');
    h.update(readFileSync(join(verzeichnis, name), 'utf8'));
    h.update('\0');
  }
  return h.digest('hex');
}

function schreibeAbdruck(): Abdruckdatei {
  const datei: Abdruckdatei = { kernVersion: KERN_VERSION, abdruck: abdruckVonCore() };
  writeFileSync(ABDRUCK_DATEI, `${JSON.stringify(datei, null, 2)}\n`, { mode: 0o644 });
  return datei;
}

// Als Skript aufgerufen — nicht beim Import aus dem Test.
if (import.meta.filename === resolve(process.argv[1] ?? '')) {
  const { kernVersion, abdruck } = schreibeAbdruck();
  process.stdout.write(`core/.abdruck.json: Kernversion ${String(kernVersion)}, ${abdruck.slice(0, 16)}…\n`);
}
