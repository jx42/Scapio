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
 *
 * `npm run kern:version` (`--erhoehen`) erhoeht `KERN_VERSION` und schreibt den Abdruck im
 * selben Schritt — die Entscheidung bleibt der Aufruf, nur der vergessliche zweite Schritt
 * faellt weg. Erhoeht wird hoechstens einmal je Branch gegenueber `origin/main`, also darf
 * man es nach jeder weiteren Kernaenderung erneut aufrufen.
 */

import { execFileSync } from 'node:child_process';
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

function schreibeAbdruck(kernVersion: number): Abdruckdatei {
  const datei: Abdruckdatei = { kernVersion, abdruck: abdruckVonCore() };
  writeFileSync(ABDRUCK_DATEI, `${JSON.stringify(datei, null, 2)}\n`, { mode: 0o644 });
  return datei;
}

const VERSION_DATEI = join(WURZEL, 'core', 'version.ts');
const VERSION_ZEILE = /^export const KERN_VERSION = (\d+);$/m;

/** Vergleichsstand fuer `--erhoehen`: je Branch genau eine Erhoehung gegenueber `main`. */
const BASIS = 'origin/main';

export function leseKernVersion(quelle: string): number {
  const treffer = VERSION_ZEILE.exec(quelle);
  if (treffer === null) throw new Error('core/version.ts: Zeile `export const KERN_VERSION = <n>;` fehlt');
  return Number(treffer[1]);
}

export function setzeKernVersion(quelle: string, version: number): string {
  leseKernVersion(quelle);
  return quelle.replace(VERSION_ZEILE, `export const KERN_VERSION = ${String(version)};`);
}

/**
 * Liegt der Branch schon ueber `main`, bleibt seine Version — ein zweiter Aufruf zaehlt
 * nicht doppelt. Hat `main` inzwischen selbst erhoeht, eins darueber. Ohne Basis (kein
 * Git, kein `origin/main`) bleibt nur blind um eins.
 */
export function zielVersion(aktuell: number, basis: number | undefined): number {
  return basis === undefined ? aktuell + 1 : Math.max(aktuell, basis + 1);
}

function versionAufBasis(): number | undefined {
  try {
    const quelle = execFileSync('git', ['show', `${BASIS}:core/version.ts`], {
      cwd: WURZEL,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return leseKernVersion(quelle);
  } catch {
    return undefined;
  }
}

// Als Skript aufgerufen — nicht beim Import aus dem Test.
if (import.meta.filename === resolve(process.argv[1] ?? '')) {
  let version = KERN_VERSION;
  if (process.argv.includes('--erhoehen')) {
    const basis = versionAufBasis();
    version = zielVersion(KERN_VERSION, basis);
    if (basis === undefined) process.stdout.write(`${BASIS} nicht lesbar — KERN_VERSION blind um eins erhoeht.\n`);
    else if (version === KERN_VERSION) process.stdout.write(`KERN_VERSION ist gegenueber ${BASIS} (${String(basis)}) schon erhoeht.\n`);
    if (version !== KERN_VERSION) writeFileSync(VERSION_DATEI, setzeKernVersion(readFileSync(VERSION_DATEI, 'utf8'), version));
  }
  const { kernVersion, abdruck } = schreibeAbdruck(version);
  process.stdout.write(`core/.abdruck.json: Kernversion ${String(kernVersion)}, ${abdruck.slice(0, 16)}…\n`);
}
