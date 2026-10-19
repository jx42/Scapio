/**
 * `npm start` — der normale Weg: bauen (nur wenn noetig), Datenbank oeffnen, notfalls
 * einmal ingestieren, servieren, Browser oeffnen. [P-11]
 *
 * In dieser Reihenfolge, und aus Gruenden: Erst servieren und den Browser oeffnen, dann
 * bauen — waehrend des Baus zeigt der Server "Scapio wird gebaut …", und wer gerade aus
 * der Anmeldung kommt, steht nicht vor einem Fenster, das nichts tut [ADR-039]. Der erste Ingest laeuft NUR, wenn die Datenbank noch leer ist —
 * sonst wuerde jeder Start Daten vom Broker holen, und die Anwendung waere kein
 * Beobachter mehr, sondern ein Hintergrundprozess mit Startknopf.
 *
 * KEIN `tsc --noEmit` mehr an dieser Stelle: der Typecheck gehoert in `npm run check`
 * und in die CI. Beim Start eines Nutzers, der keine Zeile Code angefasst hat, kann er
 * nichts finden — er kostet nur Sekunden vor der ersten Zahl. Und `vite build` laeuft
 * nur, wenn `dist/` aelter ist als eine Quelldatei (siehe `bauIstAktuell`).
 *
 * Der Port steht in der Konfiguration und wird NICHT gesucht: ein wanderndes Dashboard
 * ist ein Lesezeichen, das nicht mehr stimmt, und eine Origin-Regel, die nicht mehr
 * greift. Ist er belegt, sagt das Programm das und hoert auf.
 *
 * Jeder Unterprozess laeuft ueber `execFile`/`spawn` mit Argument-Array, nie ueber eine
 * Shell: sonst waere jeder Pfad mit Leerzeichen ein Kommando.
 */

import { execFile } from 'node:child_process';
import { existsSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import type { DatabaseSync } from 'node:sqlite';
import type { Tag } from '../core/kalender.ts';
import { tagAus } from '../core/kalender.ts';
import { KERN_VERSION } from '../core/version.ts';
import { ladeKonfiguration, PROJEKTWURZEL, sicherungsPfad } from '../shared/konfiguration.ts';
import type { Konfiguration } from '../shared/konfiguration.ts';
import { oeffneImBrowser } from '../shared/browser.ts';
import { uebernimmEigeneDateien } from './uebernahme.ts';
import { werkzeugArgumente } from './werkzeuge.ts';
import { oeffneDatenbank, sichereWennFaellig } from '../db/verbindung.ts';
import * as repository from '../db/repository/index.ts';
import { starteServer } from '../server/server.ts';
import { Sperre } from '../server/sperre.ts';
import { portBelegt } from './kinder.ts';

const ausfuehren = promisify(execFile);

/** `node:sqlite` gibt es erst ab Node 24 in brauchbarer Form. */

export type Schalter = {
  readonly bauen: boolean;
  readonly browser: boolean;
  readonly ingest: boolean;
  /** Nur von `start/dev.ts` gesetzt — haengt das Neulade-Skript in die Seite. */
  readonly neuladen: boolean;
};

function leseSchalter(argv: readonly string[]): Schalter {
  return {
    bauen: !argv.includes('--ohne-bau'),
    browser: !argv.includes('--ohne-browser'),
    ingest: !argv.includes('--ohne-ingest'),
    neuladen: argv.includes('--neuladen'),
  };
}

/**
 * Alles, woraus `dist/` entsteht. Aendert sich keine dieser Stellen, ist ein erneuter
 * Bau reine Wartezeit. `package-lock.json` steht mit in der Liste, weil ein
 * Abhaengigkeits-Wechsel den Bau genauso veraendert wie eine Zeile in `src/`.
 */
const BAU_QUELLEN: readonly string[] = [
  'src',
  'shared',
  'index.html',
  'vite.config.ts',
  'tsconfig.json',
  'package.json',
  'package-lock.json',
];

/** Juengste Aenderungszeit unterhalb eines Pfades. Fehlt er, zaehlt er als uralt. */
function juengsteAenderung(pfad: string): number {
  let angabe;
  try {
    angabe = statSync(pfad);
  } catch {
    return 0;
  }
  if (!angabe.isDirectory()) return angabe.mtimeMs;

  let juengste = angabe.mtimeMs;
  for (const eintrag of readdirSync(pfad, { withFileTypes: true })) {
    juengste = Math.max(juengste, juengsteAenderung(join(pfad, eintrag.name)));
  }
  return juengste;
}

/** Juengste Aenderungszeit ueber alle Bauquellen — der Vergleichswert fuer den Bau. */
function juengsteQuelle(): number {
  return Math.max(...BAU_QUELLEN.map((quelle) => juengsteAenderung(join(PROJEKTWURZEL, quelle))));
}

/**
 * Ist der Bau in `dist/` neuer als jede Quelle, gibt es nichts zu tun. Der Vergleich
 * geht gegen `dist/index.html`, weil Vite die Datei bei JEDEM Bau neu schreibt — die
 * inhaltsadressierten Dateien unter `dist/assets/` behalten dagegen ihre Zeit, wenn
 * sich ihr Inhalt nicht geaendert hat.
 *
 * Gleichstand zaehlt als NICHT aktuell (`<`, nicht `<=`). Dateisysteme loesen die
 * Aenderungszeit unterschiedlich fein auf — ein FAT32- oder exFAT-Datentraeger unter
 * Windows auf zwei Sekunden genau —, und dort fallen eine Quelle und der Bau, die
 * kurz nacheinander entstanden sind, regelmaessig auf denselben Zeitstempel. Von den
 * beiden moeglichen Irrtuemern ist einer harmlos und einer teuer: ein ueberfluessiger
 * Bau kostet Sekunden, ein ausgelassener liefert die alte Oberflaeche zu den neuen
 * Zahlen aus — genau der Fehlschlag, den `start/update.ts` mit dem Loeschen von `dist/`
 * abraeumt. Der Quellenstand ist ein Parameter, damit ein Test genau diesen Gleichstand
 * herstellen kann, ohne an den echten Quelldateien zu drehen.
 */
export function bauIstAktuell(
  distPfad = join(PROJEKTWURZEL, 'dist'),
  quellenStand = juengsteQuelle(),
): boolean {
  const index = join(distPfad, 'index.html');
  if (!existsSync(index)) return false;
  return quellenStand < statSync(index).mtimeMs;
}

/**
 * Gebaut wird neben `dist/` und erst danach umbenannt: der Server laeuft schon, und Vite
 * schreibt seine Dateien in keiner festen Reihenfolge. Direkt nach `dist/` gebaut, saehe der
 * Server eine `index.html`, deren Assets noch fehlen [ADR-039].
 */
async function baue(distPfad: string): Promise<void> {
  const bauPfad = join(PROJEKTWURZEL, '.start', 'bau');
  process.stdout.write('🔨  Baue die Benutzeroberflaeche …\n');
  await ausfuehren(process.execPath, werkzeugArgumente('vite', 'build', '--outDir', bauPfad, '--emptyOutDir'), {
    cwd: PROJEKTWURZEL,
  });
  rmSync(distPfad, { recursive: true, force: true });
  await benenneUm(bauPfad, distPfad);
  process.stdout.write('✅  Oberflaeche gebaut.\n');
}

/**
 * `renameSync` mit kurzem Backoff bei EPERM/EBUSY: unter Windows haelt ein Virenscanner oder
 * die Suchindizierung die frisch geschriebenen Dateien oft noch einige hundert Millisekunden.
 */
export async function benenneUm(
  von: string,
  nach: string,
  umbenennen: (von: string, nach: string) => void = renameSync,
  wartezeitenMs: readonly number[] = [100, 250, 500, 1000, 2000],
): Promise<void> {
  for (let versuch = 0; ; versuch += 1) {
    try {
      umbenennen(von, nach);
      return;
    } catch (fehler) {
      const code = (fehler as NodeJS.ErrnoException).code;
      const warte = wartezeitenMs[versuch];
      if ((code !== 'EPERM' && code !== 'EBUSY') || warte === undefined) throw fehler;
      await new Promise((weiter) => setTimeout(weiter, warte));
    }
  }
}

/**
 * Woechentliche Sicherung [ADR-045]. Eine leere Datenbank hat nichts zu sichern, und ein
 * Fehlschlag haelt den Start nicht auf — die Sicherung ist Vorsorge, keine Vorbedingung.
 */
async function sichereBeimStart(db: DatabaseSync, konfiguration: Konfiguration): Promise<void> {
  if (repository.transaktion.anzahl(db) === 0) return;
  try {
    const ziel = await sichereWennFaellig(db, sicherungsPfad(konfiguration));
    if (ziel !== null) process.stdout.write('💾  Woechentliche Sicherung der Datenbank angelegt.\n');
  } catch (fehler) {
    process.stdout.write(`❗  Die woechentliche Sicherung ist gescheitert: ${(fehler as Error).message}\n`);
  }
}

/**
 * Sind die gespeicherten Tage nach einer Rechnung entstanden, die es nicht mehr gibt?
 * `gespeicherteKernVersion` liefert die KLEINSTE Version in `depot_tag` — eine einzige
 * alte Zeile genuegt, denn gemischte Versionen sind genau das, was [INV-10] verhindern
 * soll. Leere Datenbank: nichts zu rechnen, der erste Lauf macht es ohnehin.
 */
export function brauchtNeuberechnung(gespeichert: number | null): boolean {
  return gespeichert !== null && gespeichert < KERN_VERSION;
}

/**
 * Nach einem Update kann `KERN_VERSION` gesprungen sein. Die Neuberechnung liest dann
 * ausschliesslich die Datenbank — kein MCP-Aufruf, kein Netz [INV-01] — und gehoert
 * VOR den Serverstart, nicht in den naechsten Lauf: sonst zeigte das Dashboard nach
 * jedem Update am Rechenkern so lange alte Zahlen, bis jemand von sich aus
 * "Aktualisieren" drueckt. Niemand weiss, dass er das muesste.
 *
 * Scheitert sie, startet der Server trotzdem: alte Zahlen mit sichtbarem Hinweis sind
 * besser als gar keine Anwendung.
 */
async function rechneNachUpdateNeu(db: DatabaseSync, sperre: Sperre): Promise<void> {
  const gespeichert = repository.depotTag.gespeicherteKernVersion(db);
  if (!brauchtNeuberechnung(gespeichert)) return;

  let modul: { berechneNeu: (db: DatabaseSync, heute: Tag) => { neuBerechneteTage: number } };
  try {
    modul = (await import('../ingest/neuberechnung.ts')) as unknown as typeof modul;
  } catch {
    return;
  }

  process.stdout.write(
    `🧮  Der Rechenkern ist neuer als die gespeicherte Historie (${String(gespeichert)} → ${String(KERN_VERSION)}) — rechne sie neu …\n`,
  );

  try {
    sperre.nimm('start');
  } catch {
    // Ein anderer Prozess rechnet gerade ohnehin; seine Neuberechnung erledigt dasselbe.
    process.stdout.write('⏳  Ein Lauf ist bereits unterwegs — er uebernimmt die Neuberechnung.\n');
    return;
  }
  try {
    // Wie beim ersten Ingest: der Kalendertag wird HIER aus der Uhr gelesen und
    // weitergereicht. [INV-03, INV-04]
    const ergebnis = modul.berechneNeu(db, tagAus(new Date().toISOString()));
    process.stdout.write(`✅  ${String(ergebnis.neuBerechneteTage)} Tag(e) neu berechnet.\n`);
  } catch (fehler) {
    process.stdout.write(`❗  Die Neuberechnung ist gescheitert: ${(fehler as Error).message}\n`);
    process.stdout.write('    Der Server startet trotzdem. Siehe docs/RUNBOOK.md.\n');
  } finally {
    sperre.gibFrei();
  }
}

/** Nur beim allerersten Start: ohne Transaktionen gibt es nichts zu zeigen. */
async function ersterIngest(db: DatabaseSync, konfiguration: Konfiguration, sperre: Sperre): Promise<void> {
  process.stdout.write('📥  Die Datenbank ist leer — hole die Daten einmalig …\n');
  let modul: {
    fuehreLaufAus: (optionen: {
      db: DatabaseSync;
      konfiguration: Konfiguration;
      heute: Tag;
    }) => Promise<unknown>;
  };
  try {
    modul = (await import('../ingest/lauf.ts')) as unknown as typeof modul;
  } catch {
    process.stdout.write('❗  Der Ingest steht nicht bereit — der Server startet mit leerer Anzeige.\n');
    return;
  }

  try {
    sperre.nimm('start');
  } catch {
    // Der Server lauscht schon; ein anderer Lauf holt die Daten gerade selbst.
    process.stdout.write('⏳  Ein anderer Lauf holt gerade die Daten — der Server startet ohne eigenen ersten Lauf.\n');
    return;
  }
  try {
    // Der heutige Kalendertag wird HIER einmal aus der Uhr gelesen und als Parameter
    // weitergereicht — der Ingest und der Rechenkern lesen keine Uhr. [INV-03, INV-04]
    await modul.fuehreLaufAus({ db, konfiguration, heute: tagAus(new Date().toISOString()) });
  } catch (fehler) {
    process.stdout.write(`❗  Der erste Lauf ist gescheitert: ${(fehler as Error).message}\n`);
    process.stdout.write('    Der Server startet trotzdem. Siehe docs/RUNBOOK.md.\n');
  } finally {
    sperre.gibFrei();
  }
}

/** Dieselbe Meldung fuer beide Stellen, an denen ein belegter Port den Start beendet:
 *  den fruehen Schnelltest hier und den `EADDRINUSE`-Fang um `starteServer()`. */
function meldePortBelegt(port: number): void {
  process.stderr.write(
    `🔌  Port ${port} ist belegt. Entweder laeuft das Dashboard schon,\n` +
      'oder ein anderes Programm hoert dort. Der Port wird absichtlich nicht gewechselt.\n' +
      'Was zu tun ist, steht in docs/RUNBOOK.md, Abschnitt "Port belegt".\n',
  );
}

/** Was `beenden` beim Signal freigeben muss — waechst mit dem Start, beginnt leer. */
export type BeendenZustand = {
  db: DatabaseSync | null;
  /** Die Sperre, die dieser Prozess gerade halten koennte (Aufraeumer, spaeter die des Servers). */
  sperre: Pick<Sperre, 'belegt' | 'gibFrei'> | null;
  server: { readonly schliesse: () => Promise<void> } | null;
  /** Gesetzt, sobald das Beenden begonnen hat — `haupt` soll dann nichts Neues mehr anfangen. */
  beendet: boolean;
};

export type BeendenOptionen = {
  /** Wie lange auf einen laufenden Ingest gewartet wird, bevor hart beendet wird. */
  readonly fristMs?: number;
  readonly abfrageMs?: number;
  readonly ende?: (code: number) => void;
  readonly ausgabe?: (zeile: string) => void;
};

/**
 * Handler fuer SIGINT/SIGTERM. Ein laufender Ingest steckt zwischen zwei `await`s; ihm die
 * Datenbank unter den Haenden zu schliessen liesse die `lauf`-Zeile auf "laufend" stehen und
 * den Prozess trotzdem mit 0 enden. Deshalb: Server zu (keine neuen Anfragen), auf die
 * Freigabe der eigenen Sperre warten, dann erst die Datenbank. Nach Ablauf der Frist wird
 * hart beendet, mit Exit-Code 1 — ein zweites Signal beendet sofort.
 */
export function erzeugeBeenden(zustand: BeendenZustand, optionen: BeendenOptionen = {}): () => void {
  const fristMs = optionen.fristMs ?? 120_000;
  const abfrageMs = optionen.abfrageMs ?? 100;
  const ende = optionen.ende ?? ((code: number): void => process.exit(code));
  const ausgabe = optionen.ausgabe ?? ((zeile: string): void => void process.stdout.write(`${zeile}\n`));
  let beendetSchon = false;

  const ablauf = async (): Promise<void> => {
    try {
      await zustand.server?.schliesse();
    } catch {
      // Ein Fehler beim Schliessen darf die Freigabe der Sperre nicht verhindern.
    }

    let abgebrochen = false;
    const sperre = zustand.sperre;
    if (sperre?.belegt() != null) {
      ausgabe('⏳  Ein Lauf ist unterwegs — warte auf sein Ende (Strg+C erneut beendet sofort) …');
      const bis = Date.now() + fristMs;
      while (sperre.belegt() !== null && Date.now() < bis) {
        await new Promise<void>((weiter) => setTimeout(weiter, abfrageMs));
      }
      abgebrochen = sperre.belegt() !== null;
      if (abgebrochen) ausgabe('❗  Der Lauf wurde abgebrochen. Siehe docs/RUNBOOK.md.');
    }

    sperre?.gibFrei();
    zustand.db?.close();
    ende(abgebrochen ? 1 : 0);
  };

  return (): void => {
    if (beendetSchon) {
      ende(1);
      return;
    }
    beendetSchon = true;
    zustand.beendet = true;
    void ablauf();
  };
}

export async function haupt(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  const schalter = leseSchalter(argv);

  const konfiguration = ladeKonfiguration();

  // Als Erstes: der erste Ingest ist der laengste Vorgang der Anwendung, und ein Strg+C
  // darin darf Sperre und Lauf nicht liegen lassen. Der Zustand waechst mit dem Start.
  const zustand: BeendenZustand = { db: null, sperre: null, server: null, beendet: false };
  const beenden = erzeugeBeenden(zustand);
  process.on('SIGINT', beenden);
  process.on('SIGTERM', beenden);
  const meldeAb = (): void => {
    process.off('SIGINT', beenden);
    process.off('SIGTERM', beenden);
  };

  // Fruehester moeglicher Test: laeuft schon jemand auf dem Port, sollen weder Bau noch
  // Datenbankoeffnung (mit ihrer Migration) noch die Sperr-/Lauf-Aufraeumung angefasst
  // werden — sonst griffe eine "Aufraeumung" in eine bereits laufende, legitime Instanz
  // ein. Der spaetere `EADDRINUSE`-Fang um `starteServer()` bleibt die eigentliche
  // Absicherung; hier geht es nur um den haeufigen Fall, schnell und folgenlos.
  if (await portBelegt(konfiguration.port)) {
    meldePortBelegt(konfiguration.port);
    process.exitCode = 1;
    meldeAb();
    return;
  }

  for (const satz of uebernimmEigeneDateien(konfiguration)) process.stdout.write(`${satz}\n`);

  const distPfad = join(PROJEKTWURZEL, 'dist');
  const bauNoetig = schalter.bauen && !bauIstAktuell(distPfad);
  // Weg damit, bevor der Server startet: sonst lieferte er bis zum Ende des Baus die alte
  // Oberflaeche gegen die neue API aus.
  if (bauNoetig) rmSync(distPfad, { recursive: true, force: true });
  else if (schalter.bauen) process.stdout.write('✅  Die Oberflaeche ist aktuell — nichts zu bauen.\n');

  const db = await oeffneDatenbank({ konfiguration });
  zustand.db = db;

  // Eine liegengebliebene Sperrdatei aus einem abgestuerzten Lauf darf die Anwendung
  // nicht dauerhaft blockieren. Der Port ist gerade als frei bestaetigt worden, also
  // haelt keine lebende Instanz diese Sperre mehr — eine gefundene Datei ist wirklich
  // verwaist.
  const aufraeumer = new Sperre(konfiguration.datenpfad);
  zustand.sperre = aufraeumer;
  if (aufraeumer.raeumeVerwaiste()) {
    process.stdout.write('🧹  Eine liegengebliebene Sperrdatei wurde entfernt.\n');
  }
  const haengende = repository.lauf.raeumeHaengende(db, new Date().toISOString());
  if (haengende > 0) process.stdout.write(`🧹  ${haengende} unterbrochene(r) Lauf wurde(n) als gescheitert vermerkt.\n`);

  await sichereBeimStart(db, konfiguration);

  await rechneNachUpdateNeu(db, aufraeumer);

  let laufend;
  try {
    laufend = await starteServer({ db, konfiguration, neuladen: schalter.neuladen });
  } catch (fehler) {
    if ((fehler as NodeJS.ErrnoException).code === 'EADDRINUSE') {
      meldePortBelegt(konfiguration.port);
      process.exitCode = 1;
      db.close();
      meldeAb();
      return;
    }
    throw fehler;
  }
  zustand.server = laufend;
  zustand.sperre = laufend.sperre;

  process.stdout.write(`✅  Scapio laeuft auf ${laufend.adresse}\n`);
  if (schalter.browser) oeffneImBrowser(laufend.adresse);

  // Bau und erster Ingest laufen nebeneinander: der eine rechnet, der andere wartet aufs Netz.
  // `ersterIngest` faengt seine Fehler selbst und wirft nie.
  const ingest =
    schalter.ingest && repository.transaktion.anzahl(db) === 0
      ? ersterIngest(db, konfiguration, laufend.sperre)
      : Promise.resolve();

  if (bauNoetig) {
    try {
      await baue(distPfad);
    } catch (fehler) {
      // Ohne Oberflaeche zeigte der Server nur endlos "wird gebaut" — dann lieber ganz aufhoeren,
      // damit das Startfenster den Fehler stehen laesst.
      await ingest;
      await laufend.schliesse();
      db.close();
      meldeAb();
      throw fehler;
    }
  }
  await ingest;
}

// Nur ausfuehren, wenn diese Datei der Einstiegspunkt ist — nicht beim Importieren.
if (import.meta.filename === resolve(process.argv[1] ?? '')) {
  try {
    await haupt();
  } catch (fehler) {
    // Ohne diesen Fang wuerde jeder nicht abgefangene Fehler — z. B. eine Datenbank,
    // die neuer ist als die bekannten Migrationen — als roher Stacktrace enden. Die
    // Nutzerin sieht stattdessen einen Satz und weiss, wo sie weiterlesen kann.
    process.stderr.write(
      `❌  Der Start ist gescheitert: ${(fehler as Error).message}\nSiehe docs/RUNBOOK.md.\n`,
    );
    process.exitCode = 1;
  }
}
