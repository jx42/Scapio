/**
 * `npm run update` — die neue Version holen und den Rechner in den Zustand bringen, in
 * dem ein normaler Start sie auch wirklich benutzt. [ADR-013]
 *
 * Fuenf Dinge gingen am handgeschriebenen Weg ("git pull und nochmal doppelklicken")
 * regelmaessig schief; jedes davon ist hier ein Schritt:
 *
 *  1. Das alte Dashboard laeuft noch. Der Port wird absichtlich nicht gewechselt
 *     (`start.ts`), also endete das Update im Abbruch "Port belegt" — nach dem Pull,
 *     also im halb aktualisierten Zustand.
 *  2. Kein Git-Checkout, sondern ein entpacktes ZIP. Dann gibt es nichts zu pullen, und
 *     ein Skript, das trotzdem etwas tut, tut das Falsche. Hier oeffnet es den
 *     Download-Link, sagt die restlichen Schritte und hoert auf. [ADR-037]
 *  3. Eine geaenderte `config.json` laesst `git pull` scheitern ("local changes would be
 *     overwritten"). Die Datei gehoert ins Repository — dort steht `erlaubteHosts`, das
 *     ist Teil der Sicherheitshaltung —, also wird die Aenderung weggelegt und danach
 *     zurueckgespielt, statt sie zu verlieren oder den Pull daran scheitern zu lassen.
 *  4. `dist/` bleibt stehen und sieht juenger aus als die neuen Quellen. Beim ZIP ist das
 *     der Normalfall (die entpackten Dateien tragen die Commit-Zeit, nicht die
 *     Download-Zeit), beim Pull der Ausnahmefall. `bauIstAktuell` sagt dann "aktuell",
 *     und der neue Server liefert die alte Oberflaeche aus. Deshalb wird `dist/` nach
 *     einem echten Pull geloescht — der naechste Start baut neu.
 *  5. Niemand weiss, ob nach dem Update noch etwas zu tun ist. Am Ende steht genau ein
 *     Satz, was jetzt kommt.
 *
 * Was dieses Skript ausdruecklich NICHT tut: Code aus dem Netz laden. Das macht `git`,
 * mit der Gegenstelle, die der Nutzer selbst geklont hat. Die Anwendung aktualisiert sich
 * auch nicht von selbst beim Start — dieser Befehl laeuft nur, wenn jemand ihn ausloest.
 * Begruendung in [ADR-013].
 *
 * Jeder Unterprozess laeuft ueber `execFile` mit Argument-Array, nie ueber eine Shell.
 */

import { execFile } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { oeffneImBrowser } from '../shared/browser.ts';
import { ladeKonfiguration, PROJEKTWURZEL } from '../shared/konfiguration.ts';
import { portBelegt } from './kinder.ts';

const ausfuehren = promisify(execFile);


/** Name des Stashs. Er taucht in `git stash list` auf, also traegt er einen Grund. */
const STASH_NAME = 'portfolio-update: eigene Aenderungen vor dem Pull';

type GitErgebnis = { readonly ok: boolean; readonly ausgabe: string };

/**
 * Nur das Zeilenende weg, nie der Anfang: `git status --porcelain` schreibt den Zustand
 * in die ersten beiden SPALTEN, und die erste davon ist bei einer nur im Arbeitsbaum
 * geaenderten Datei ein Leerzeichen. Ein `trim()` verschoebe jeden Pfad um ein Zeichen.
 */
function ohneZeilenende(text: string): string {
  return text.replace(/\s+$/, '');
}

/**
 * Wie `browser.ts` bei `open`/`rundll32.exe`: ein Programmname aus PATH ist ein
 * Vertrauensvorschuss zu viel fuer `execFile`. Anders als dort gibt es fuer `git` aber
 * keinen festen Ort je Plattform — deshalb wird der Systemlocator selbst an festem Ort
 * aufgerufen (`which`/`where.exe`), einmal pro Lauf, und das Ergebnis behalten.
 */
export function gitLocator(
  plattform: NodeJS.Platform = process.platform,
  umgebung: NodeJS.ProcessEnv = process.env,
): { readonly befehl: string; readonly argumente: readonly string[] } {
  if (plattform === 'win32') {
    const windows = umgebung['SystemRoot'];
    const wurzel = windows !== undefined && windows !== '' ? windows : 'C:\\Windows';
    // Bewusst kein `path.join`: das waehlt posix- oder win32-Regeln nach dem RECHNER,
    // auf dem der Code laeuft, nicht nach `plattform` — unter Tests auf macOS/Linux mit
    // `plattform: 'win32'` kaeme ein gemischter Pfad heraus.
    return { befehl: `${wurzel.replace(/[/\\]+$/, '')}\\System32\\where.exe`, argumente: ['git'] };
  }
  return { befehl: '/usr/bin/which', argumente: ['git'] };
}

/**
 * Erste Zeile der Locator-Ausgabe. `where.exe` trennt mit CRLF und nennt jede Fundstelle
 * im PATH — bei zwei Git-Installationen bliebe sonst ein `\r` am ersten Pfad haengen,
 * und `execFile` faende die Datei nicht.
 */
export function ersterTreffer(ausgabe: string): string | null {
  const erste = ausgabe.split(/\r?\n/)[0]?.trim();
  return erste !== undefined && erste !== '' ? erste : null;
}

let gitPfadCache: Promise<string> | undefined;

/**
 * Loest `git` einmal pro Prozess absolut auf. Schlaegt der Locator fehl — etwa weil
 * `git` gar nicht installiert ist —, bleibt der blosse Name; `git()` meldet den
 * Fehlschlag dann wie gehabt ueber sein Ergebnisobjekt statt hier abzubrechen.
 */
function gitPfad(): Promise<string> {
  gitPfadCache ??= (async () => {
    const { befehl, argumente } = gitLocator();
    try {
      const { stdout } = await ausfuehren(befehl, argumente, { cwd: PROJEKTWURZEL });
      return ersterTreffer(stdout) ?? 'git';
    } catch {
      return 'git';
    }
  })();
  return gitPfadCache;
}

/**
 * `git` mit Argument-Array im Ordner `wurzel`. Wirft nicht: der Aufrufer entscheidet, ob
 * ein Fehlschlag das Ende ist (Pull) oder nur eine Auskunft (Checkout-Pruefung).
 */
async function git(wurzel: string, ...argumente: readonly string[]): Promise<GitErgebnis> {
  try {
    const { stdout } = await ausfuehren(await gitPfad(), [...argumente], { cwd: wurzel });
    return { ok: true, ausgabe: ohneZeilenende(stdout) };
  } catch (fehler) {
    const f = fehler as { stderr?: string; stdout?: string; message?: string };
    return { ok: false, ausgabe: ohneZeilenende(f.stderr ?? f.stdout ?? f.message ?? '') };
  }
}

/**
 * Zeilen aus `git status --porcelain`. Format: zwei Statuszeichen, ein Leerzeichen, der
 * Pfad — bei einer Umbenennung `alt -> neu`. Getestet, weil eine falsch gelesene Zeile
 * hier bedeutet, dass eine Nutzeraenderung stillschweigend im Stash liegen bleibt.
 */
export function geaenderteDateien(porcelain: string): string[] {
  const dateien: string[] = [];
  for (const zeile of porcelain.split('\n')) {
    if (zeile.trim() === '') continue;
    const pfad = zeile.slice(3);
    const pfeil = pfad.indexOf(' -> ');
    dateien.push(pfeil === -1 ? pfad : pfad.slice(pfeil + 4));
  }
  return dateien;
}

function sage(text: string): void {
  process.stdout.write(`${text}\n`);
}

function scheitere(text: string): void {
  process.stderr.write(`${text}\n`);
  process.exitCode = 1;
}

/** Die Doppelklick-Dateien und die Warnung beim ersten Start — je Plattform die, die es dort gibt. */
export function einstiege(plattform: NodeJS.Platform = process.platform): {
  readonly start: string;
  readonly update: string;
  readonly warnung: string;
} {
  return plattform === 'win32'
    ? {
        start: 'Start.bat',
        update: 'Aktualisieren.bat',
        warnung: 'Windows zeigt dabei wieder\n     den SmartScreen-Hinweis — "Weitere Informationen", "Trotzdem ausfuehren".',
      }
    : {
        start: 'Start.command',
        update: 'Aktualisieren.command',
        warnung: 'macOS blockiert die Datei dabei wieder —\n     Freigabe wie bei der Installation, siehe README, "Warnung beim ersten Start".',
      };
}

/**
 * Fest im Code wie die MCP-Gegenstelle. Der Browser laedt das ZIP, nicht dieses Skript —
 * es oeffnet nur den Link, den sonst die README liefert. [ADR-013, ADR-037, ADR-047]
 */
export const ZIP_ADRESSE = 'https://github.com/jx42/Scapio/releases/latest/download/Scapio.zip';

export function zipHinweis(plattform: NodeJS.Platform = process.platform): string {
  const { start, update, warnung } = einstiege(plattform);
  return `Dieser Ordner ist kein Git-Checkout — die Anwendung wurde als ZIP heruntergeladen.
Der Browser laedt die neue Version herunter. Danach:

  1. Das ZIP entpacken.
  2. Im neuen Ordner ${start} doppelklicken. ${warnung}
  3. Diesen alten Ordner loeschen.

Depot-Daten, Anmeldung, eigene Fondsliste und Einstellungen liegen ausserhalb des
Ordners und bleiben.

Startet der Download nicht, diese Adresse im Browser oeffnen:
  ${ZIP_ADRESSE}

Ganz ohne Handarbeit geht es mit einem Git-Checkout:
  git clone https://github.com/jx42/Scapio.git
Danach genuegt fuer jedes weitere Update ein Doppelklick auf ${update}.`;
}

/**
 * Was nach einem erfolgreichen Update kommt. `--mit-neustart` setzen nur `Aktualisieren.*`:
 * die starten das Dashboard danach selbst, eine Aufforderung zum Doppelklick waere dort falsch.
 */
export function schlusssaetze(mitNeustart: boolean, plattform: NodeJS.Platform = process.platform): string[] {
  if (mitNeustart) return ['Neue Abhaengigkeiten und Schemaaenderungen erledigt der Neustart von selbst.'];
  return [
    `Jetzt ${einstiege(plattform).start} doppelklicken — oder "npm start".`,
    'Neue Abhaengigkeiten und Schemaaenderungen erledigt der Start von selbst.',
  ];
}

export async function haupt(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  const konfiguration = ladeKonfiguration();

  sage('1/4  Pruefe, ob das Dashboard noch laeuft …');
  if (await portBelegt(konfiguration.port)) {
    scheitere(
      `Auf Port ${String(konfiguration.port)} hoert bereits jemand — vermutlich das laufende Dashboard.\n` +
        'Bitte erst dessen Fenster schliessen und dann erneut aktualisieren.\n' +
        'Der Port wird absichtlich nicht gewechselt, siehe docs/RUNBOOK.md, Abschnitt "Port belegt".',
    );
    return;
  }

  sage('2/4  Pruefe die Installationsart …');
  const werkbaum = await git(PROJEKTWURZEL, 'rev-parse', '--is-inside-work-tree');
  if (!werkbaum.ok || werkbaum.ausgabe !== 'true') {
    scheitere(zipHinweis());
    oeffneImBrowser(ZIP_ADRESSE);
    return;
  }

  if (!(await holeNeueVersion(PROJEKTWURZEL))) return;

  for (const satz of schlusssaetze(argv.includes('--mit-neustart'))) sage(satz);
}

/**
 * Stash, Pull, Pop und `dist/` wegraeumen in einem Git-Checkout. `false`: gescheitert, der
 * Grund steht schon auf stderr. Eigene Funktion, damit der Test ein temporaeres Repository
 * statt dieses Ordners benutzen kann.
 */
export async function holeNeueVersion(wurzel: string): Promise<boolean> {
  const vorherKopf = await git(wurzel, 'rev-parse', '--short', 'HEAD');
  if (!vorherKopf.ok) {
    scheitere(`Der aktuelle Stand liess sich nicht lesen — git meldet:\n${vorherKopf.ausgabe}`);
    return false;
  }
  const vorher = vorherKopf.ausgabe;

  // Nur nachverfolgte Dateien. `dist/` ist ignoriert, taucht hier gar nicht erst auf
  // und darf auch nicht in den Stash wandern.
  const status = await git(wurzel, 'status', '--porcelain', '--untracked-files=no');
  if (!status.ok) {
    // Ohne Status ist offen, ob etwas weggelegt werden muss — ein Pull koennte eigene
    // Aenderungen ueberschreiben.
    scheitere(`Der Zustand des Ordners liess sich nicht pruefen — git meldet:\n${status.ausgabe}`);
    return false;
  }
  const eigene = geaenderteDateien(status.ausgabe);
  let gestasht = false;
  if (eigene.length > 0) {
    sage(`     Eigene Aenderungen gefunden: ${eigene.join(', ')}`);
    sage('     Sie werden weggelegt und nach dem Update zurueckgespielt.');
    const stash = await git(wurzel, 'stash', 'push', '--message', STASH_NAME);
    if (!stash.ok) {
      scheitere(`Die eigenen Aenderungen liessen sich nicht weglegen:\n${stash.ausgabe}`);
      return false;
    }
    gestasht = true;
  }

  sage('3/4  Hole die neue Version …');
  const pull = await git(wurzel, 'pull', '--ff-only');
  if (!pull.ok) {
    process.stderr.write(`Das Update ist gescheitert — git meldet:\n\n${pull.ausgabe}\n\n`);
    if (gestasht) {
      const zurueck = await git(wurzel, 'stash', 'pop');
      process.stderr.write(
        zurueck.ok
          ? 'Deine eigenen Aenderungen sind zurueckgespielt — der Ordner ist unveraendert.\n'
          : `Deine eigenen Aenderungen liegen weiterhin in "git stash":\n${zurueck.ausgabe}\n`,
      );
    }
    process.exitCode = 1;
    return false;
  }

  const nachherKopf = await git(wurzel, 'rev-parse', '--short', 'HEAD');
  const nachher = nachherKopf.ok ? nachherKopf.ausgabe : vorher;
  // Im Zweifel gilt der Stand als neu: ein unnoetiger Neubau kostet Sekunden, ein alter Bau
  // liefert die alte Oberflaeche aus.
  const neu = !nachherKopf.ok || vorher !== nachher;

  if (gestasht) {
    const zurueck = await git(wurzel, 'stash', 'pop');
    if (!zurueck.ok) {
      // Der Pull ist schon durch — ohne Wegraeumen startete der alte Bau.
      if (neu) rmSync(join(wurzel, 'dist'), { recursive: true, force: true });
      process.stderr.write(
        `Deine eigenen Aenderungen kollidieren mit der neuen Version:\n${zurueck.ausgabe}\n\n` +
          'Sie sind nicht verloren — sie liegen in "git stash" und lassen sich mit\n' +
          '  git stash pop\n' +
          'erneut einspielen, sobald der Konflikt geklaert ist.\n',
      );
      process.exitCode = 1;
      return false;
    }
  }

  if (neu) {
    sage('4/4  Raeume den alten Bau der Oberflaeche weg …');
    // Ohne das kann `bauIstAktuell` den alten Bau fuer aktuell halten — siehe Kopf.
    rmSync(join(wurzel, 'dist'), { recursive: true, force: true });
    const anzahl = (await git(wurzel, 'rev-list', '--count', `${vorher}..${nachher}`)).ausgabe;
    sage(`\nAktualisiert: ${vorher} → ${nachher} (${anzahl} Aenderung(en)).`);
  } else {
    sage('4/4  Der Bau der Oberflaeche bleibt, wie er ist — es kam nichts Neues.');
    sage(`\nSchon auf dem neuesten Stand (${vorher}). Nichts zu tun.`);
  }
  return true;
}

if (import.meta.filename === resolve(process.argv[1] ?? '')) await haupt();
