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
  {
    name: 'test:abdeckung',
    werkzeug: 'vitest',
    argumente: ['run', '--coverage'],
    fehlerzeilen: /^\s*(FAIL|×|→)|Error:|^ERROR: Coverage/,
  },
];

/** Vergleichsstand fuer `--geaendert`: was dieser Branch gegenueber `main` anfasst. */
const BASIS = 'origin/main';

/** Geaenderte und neue, nicht ignorierte Dateien gegenueber `basis`, ohne geloeschte. */
export function geaenderteDateien(basis: string = BASIS): string[] {
  const git = (...argumente: string[]): string[] =>
    execFileSync('git', argumente, { cwd: PROJEKTWURZEL, encoding: 'utf8' }).split('\n').filter(Boolean);
  const alle = new Set([
    ...git('diff', '--name-only', '--diff-filter=d', basis),
    ...git('ls-files', '--others', '--exclude-standard'),
  ]);
  return [...alle].sort();
}

/*
 * Tests, die ihre Eingabe per `readFileSync`/`readdirSync` lesen: `vitest --changed` folgt
 * nur dem Modulgraphen und sieht diese Abhaengigkeit nicht. Die Invarianten und der
 * Kontrasttest lesen fast jeden Quellordner und laufen deshalb bei jeder Aenderung (0,6 s).
 * Ein neuer Test dieser Art gehoert hier eingetragen.
 */
export const ZUSATZTESTS: readonly { readonly pfad: RegExp; readonly tests: readonly string[] }[] = [
  { pfad: /./, tests: ['test/invarianten/'] },
  { pfad: /^src\/styles\/theme\.css$/, tests: ['test/ui/farben.test.ts', 'test/ui/VerlaufVorschau.test.tsx'] },
  { pfad: /^db\/migrationen\//, tests: ['test/db/'] },
  { pfad: /^test\/fixtures\//, tests: ['test/ingest/', 'test/db/', 'test/ui/'] },
  { pfad: /\.(command|bat)$|^package\.json$|^start\/nodeVersion\.mjs$/, tests: ['test/start/mindestNode.test.ts'] },
  { pfad: /^package\.json$/, tests: ['test/pruefung.test.ts'] },
  { pfad: /^tsconfig\.json$/, tests: ['test/pruefschwellen.test.ts'] },
  { pfad: /^\.claude\/settings\.json$/, tests: ['test/agentensperre.test.ts'] },
  { pfad: /^src\/App\.tsx$/, tests: ['test/drittlizenzen.test.ts'] },
  { pfad: /^docs\/RUNBOOK\.md$/, tests: ['test/laufFehler.test.ts'] },
  { pfad: /^docs\/DATENMODELL\.md$|^ingest\/quellen\//, tests: ['test/ingest/quellenNamen.test.ts'] },
  { pfad: /^docs\/einstellungen\.example\.json$|^(ingest|db|core)\//, tests: ['test/konfiguration.test.ts'] },
];

/** Die Zusatztests fuer `dateien`, ohne Doppelte, in der Reihenfolge der Tabelle. */
export function zusatztests(dateien: readonly string[]): string[] {
  return [...new Set(ZUSATZTESTS.filter((z) => dateien.some((d) => z.pfad.test(d))).flatMap((z) => z.tests))];
}

/*
 * `npm run check:geaendert` — fuer Zwischenschritte, nicht fuer die Uebergabe. tsc laeuft
 * ganz, weil eine Typaenderung beliebig weit traegt; eslint nur ueber die geaenderten
 * Quelldateien, vitest ueber die Tests, die von ihnen abhaengen, plus `ZUSATZTESTS`.
 * Zwei vitest-Laeufe, weil `--changed` zusammen mit Dateifiltern die Schnittmenge bildet.
 * Ohne `--coverage`: ein Teillauf laege immer unter den Schwellen je Ordner.
 */
export function geaenderteSchritte(dateien: readonly string[], basis: string = BASIS): Schritt[] {
  const [typecheck, lint, test] = SCHRITTE as readonly [Schritt, Schritt, Schritt];
  const quellen = dateien.filter((d) => /\.(ts|tsx|js|mjs)$/.test(d));
  const zusatz = zusatztests(dateien);
  return [
    typecheck,
    ...(quellen.length > 0 ? [{ ...lint, argumente: [...quellen, '--max-warnings', '0'] }] : []),
    { ...test, name: 'test', argumente: ['run', '--changed', basis, '--passWithNoTests'] },
    ...(zusatz.length > 0 ? [{ ...test, name: 'test:zusatz', argumente: ['run', ...zusatz] }] : []),
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
  const bilanzen: string[] = [];

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
    if (schritt.werkzeug === 'vitest') bilanzen.push(...bilanz(ausgabe).map((z) => `${schritt.name}: ${z}`));
  }

  schreibeLog(mitschrift);
  const sekunden = ((Date.now() - beginn) / 1000).toFixed(1);
  process.stdout.write(`✓ ${erledigt.join(', ')} — gruen in ${sekunden}s\n`);
  for (const zeile of bilanzen) process.stdout.write(`  ${zeile}\n`);
}

function schreibeLog(mitschrift: readonly string[]): void {
  mkdirSync(dirname(LOGPFAD), { recursive: true });
  writeFileSync(LOGPFAD, mitschrift.join('\n'), 'utf8');
}

if (import.meta.filename === resolve(process.argv[1] ?? '')) {
  haupt(process.argv.includes('--geaendert') ? geaenderteSchritte(geaenderteDateien()) : SCHRITTE);
}
