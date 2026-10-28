/**
 * `npm run check:kurz` — dieselbe Pruefung wie `npm run check`, aber sie sagt bei Erfolg
 * nur, dass sie gruen ist.
 *
 * `npm run check` schreibt rund 5.000 Zeichen in die Ausgabe, von denen bei einem gruenen
 * Lauf drei Zeilen zaehlen: eine Bestandsaufnahme je Testdatei, dazu die Banner, die npm
 * vor jedes Unterskript setzt. Fuer einen Menschen ist das Rauschen; fuer einen Agenten,
 * der die Pruefung mehrmals je Sitzung faehrt, ist es der groesste einzelne Posten im
 * Kontextverbrauch. Also: alles mitschreiben, nichts wegwerfen, aber nur das zeigen, was
 * eine Entscheidung traegt — bei Rot die Fehlerzeilen, sonst die Bilanz.
 *
 * Die vollstaendige Ausgabe landet immer in `.start/pruefung.log`, auch bei Gruen. Wer
 * mehr sehen will, liest die Datei oder faehrt `npm run check`.
 *
 * Keine Shell, kein `npm` als Unterprozess: npm ist unter Windows `npm.cmd` und liesse
 * sich ohne Shell nicht starten. Stattdessen werden dieselben drei Werkzeuge direkt
 * aufgerufen, wie `start/zeitzonen.ts` es mit vitest schon tut.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { PROJEKTWURZEL } from '../shared/konfiguration.ts';
import { werkzeugArgumente, type Werkzeug } from './werkzeuge.ts';

type Schritt = {
  /** Wie der Schritt in der Bilanz heisst — derselbe Name wie das npm-Skript. */
  readonly name: string;
  readonly werkzeug: Werkzeug;
  readonly argumente: readonly string[];
  /**
   * Woran man in der Ausgabe die Zeilen erkennt, die den Fehlschlag erklaeren. Fehlt das
   * Muster oder greift es nicht, zeigt der Bericht das Ende der Ausgabe.
   */
  readonly fehlerzeilen: RegExp;
};

/*
 * Dieselbe Kette wie das `check`-Skript in package.json, in derselben Reihenfolge.
 * `test/pruefung.test.ts` haelt beide deckungsgleich — sonst faellt beim naechsten
 * neuen Schritt genau einer der beiden Wege hinten runter.
 */
export const SCHRITTE: readonly Schritt[] = [
  { name: 'typecheck', werkzeug: 'tsc', argumente: ['--noEmit'], fehlerzeilen: /error TS\d+/ },
  {
    name: 'lint',
    werkzeug: 'eslint',
    argumente: ['.', '--max-warnings', '0'],
    fehlerzeilen: /\b(error|warning)\b/,
  },
  { name: 'test', werkzeug: 'vitest', argumente: ['run'], fehlerzeilen: /^\s*(FAIL|×|→)|Error:/ },
];

/** Vergleichsstand fuer `--geaendert`: was dieser Branch gegenueber `main` anfasst. */
const BASIS = 'origin/main';

/** Geaenderte und neue, nicht ignorierte Quelldateien gegenueber `basis`, ohne geloeschte. */
export function geaenderteDateien(basis: string = BASIS): string[] {
  const git = (...argumente: string[]): string[] =>
    execFileSync('git', argumente, { cwd: PROJEKTWURZEL, encoding: 'utf8' }).split('\n').filter(Boolean);
  const alle = new Set([
    ...git('diff', '--name-only', '--diff-filter=d', basis),
    ...git('ls-files', '--others', '--exclude-standard'),
  ]);
  return [...alle].filter((d) => /\.(ts|tsx|js|mjs)$/.test(d)).sort();
}

/*
 * `npm run check:geaendert` — fuer Zwischenschritte, nicht fuer die Uebergabe. tsc laeuft
 * ganz, weil eine Typaenderung beliebig weit traegt; eslint nur ueber die geaenderten
 * Dateien, vitest nur ueber die Tests, die von ihnen abhaengen.
 */
export function geaenderteSchritte(dateien: readonly string[], basis: string = BASIS): Schritt[] {
  const [typecheck, lint, test] = SCHRITTE as readonly [Schritt, Schritt, Schritt];
  return [
    typecheck,
    ...(dateien.length > 0 ? [{ ...lint, argumente: [...dateien, '--max-warnings', '0'] }] : []),
    { ...test, argumente: ['run', '--changed', basis, '--passWithNoTests'] },
  ];
}

const LOGPFAD = join(PROJEKTWURZEL, '.start', 'pruefung.log');

/** Die Bilanzzeilen am Ende eines vitest-Laufs, fuer die Erfolgsmeldung. */
function bilanz(ausgabe: string): string[] {
  return ausgabe
    .split('\n')
    .filter((z) => /^\s*(Test Files|Tests)\s+\d/.test(z))
    .map((z) => z.trim());
}

/** Hoechstens `hoechstens` Zeilen, die das Muster treffen — sonst das Ende der Ausgabe. */
function fehlerbericht(ausgabe: string, muster: RegExp, hoechstens = 40): string[] {
  const zeilen = ausgabe.split('\n');
  const treffer = zeilen.filter((z) => muster.test(z));
  const auswahl = treffer.length > 0 ? treffer : zeilen.filter((z) => z.trim() !== '').slice(-20);
  return auswahl.slice(0, hoechstens).map((z) => z.trimEnd());
}

export function haupt(schritte: readonly Schritt[] = SCHRITTE): void {
  const beginn = Date.now();
  const mitschrift: string[] = [];
  const erledigt: string[] = [];

  for (const schritt of schritte) {
    const lauf = spawnSync(process.execPath, werkzeugArgumente(schritt.werkzeug, ...schritt.argumente), {
      cwd: PROJEKTWURZEL,
      encoding: 'utf8',
      // Nicht 'inherit': die Ausgabe wird gesammelt, nicht durchgereicht — das ist der
      // ganze Zweck. stdout und stderr zusammen, weil vitest die Bilanz nach stderr legt.
      stdio: ['ignore', 'pipe', 'pipe'],
      /*
       * Ohne eigenes Limit bricht spawnSync bei 1 MB ab und toetet das Kind — vitest
       * meldet das dann als "Channel closed" aus dem Worker-Pool, was wie ein echter
       * Fehler aussieht. Die volle Ausgabe dieser Suite liegt bei rund 20 kB; 64 MB
       * sind Platz genug, auch wenn einmal jeder Test rot ist.
       */
      maxBuffer: 64 * 1024 * 1024,
      // NO_COLOR ist die Konvention, an die sich vitest, eslint und tsc halten.
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
    });

    const ausgabe = `${lauf.stdout ?? ''}${lauf.stderr ?? ''}`;
    mitschrift.push(`── ${schritt.name} ──\n${ausgabe}`);

    if (lauf.error !== undefined) {
      schreibeLog(mitschrift);
      process.stderr.write(`${schritt.name}: liess sich nicht starten — ${lauf.error.message}\n`);
      process.exitCode = 1;
      return;
    }

    if (lauf.status !== 0) {
      schreibeLog(mitschrift);
      process.stderr.write(`\n✗ ${schritt.name} ist rot.\n\n`);
      for (const zeile of fehlerbericht(ausgabe, schritt.fehlerzeilen)) {
        process.stderr.write(`  ${zeile}\n`);
      }
      process.stderr.write(`\nVollstaendige Ausgabe: ${LOGPFAD}\n`);
      process.exitCode = lauf.status ?? 1;
      return;
    }

    erledigt.push(schritt.name);
  }

  schreibeLog(mitschrift);
  const sekunden = ((Date.now() - beginn) / 1000).toFixed(1);
  const letzte = mitschrift.at(-1) ?? '';
  process.stdout.write(`✓ ${erledigt.join(', ')} — gruen in ${sekunden}s\n`);
  for (const zeile of bilanz(letzte)) process.stdout.write(`  ${zeile}\n`);
}

function schreibeLog(mitschrift: readonly string[]): void {
  mkdirSync(dirname(LOGPFAD), { recursive: true });
  writeFileSync(LOGPFAD, mitschrift.join('\n'), 'utf8');
}

if (import.meta.filename === resolve(process.argv[1] ?? '')) {
  haupt(process.argv.includes('--geaendert') ? geaenderteSchritte(geaenderteDateien()) : SCHRITTE);
}
