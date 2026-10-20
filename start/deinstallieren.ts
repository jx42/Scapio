/**
 * `npm run deinstallieren` — das Datenverzeichnis loeschen und sagen, was danach von Hand
 * bleibt. [ADR-049]
 *
 * Bewusst NICHT hier:
 *  - den Projektordner loeschen. Unter Windows haelt `cmd` die laufende `.bat` offen, und
 *    ein Skript, das seinen eigenen Ordner wegraeumt, endet dort halb. Den Ordner loescht
 *    der Nutzer, nachdem das Fenster zu ist.
 *  - den MCP-Zugriff bei Scalable entziehen. Das waere ein Aufruf bei der Bank, der etwas
 *    aendert; die Anwendung ist Beobachter. [INV-01]
 *
 * Geloescht wird nur ein Ordner, der nach Scapio aussieht: `config.json` kann
 * `datenverzeichnis` ueberallhin zeigen lassen, und ein `rm -rf` auf einen verbogenen Pfad
 * ist nicht rueckgaengig zu machen.
 */

import { existsSync, lstatSync, readdirSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import {
  dbPfad,
  einstellungenPfad,
  fondsPfad,
  ladeKonfiguration,
  logPfad,
  mcpPfad,
  PROJEKTWURZEL,
  seedPfad,
  sicherungsPfad,
  type Konfiguration,
} from '../shared/konfiguration.ts';
import { SPERRDATEI } from '../server/sperre.ts';
import { oeffneDatenbank, schemaVersion, sichern } from '../db/verbindung.ts';
import { portBelegt } from './kinder.ts';

export const BESTAETIGUNG = 'ENTFERNEN';

/**
 * Im Benutzerverzeichnis selbst, nicht auf dem Schreibtisch: Schreibtisch und Dokumente
 * gleichen macOS (iCloud) und Windows (OneDrive) oft mit der Cloud ab — dorthin gehoert
 * die Datenbank so wenig wie in den Projektordner. [ADR-005]
 */
const abschiedsOrdner = (): string => join(homedir(), 'Scapio-Sicherung');

/** Was Scapio selbst ins Datenverzeichnis legt, plus was das Betriebssystem dazulegt. */
export function bekannteEintraege(k: Konfiguration): ReadonlySet<string> {
  const db = basename(dbPfad(k));
  return new Set([
    db,
    `${db}-wal`,
    `${db}-shm`,
    `${db}-journal`,
    ...[sicherungsPfad, mcpPfad, logPfad, einstellungenPfad, fondsPfad, seedPfad].map((f) => basename(f(k))),
    SPERRDATEI,
    '.DS_Store',
    'Thumbs.db',
    'desktop.ini',
  ]);
}

export type Eintrag = { readonly name: string; readonly bytes: number; readonly ordner: boolean };

export type Befund =
  | { readonly art: 'fehlt' }
  | { readonly art: 'kein-ordner' }
  | { readonly art: 'fremd'; readonly eintraege: readonly string[] }
  | { readonly art: 'ok'; readonly eintraege: readonly Eintrag[] };

function groesse(pfad: string): number {
  const info = lstatSync(pfad);
  if (!info.isDirectory()) return info.size;
  return readdirSync(pfad).reduce((summe, name) => summe + groesse(join(pfad, name)), 0);
}

/**
 * `fremd` schon bei einem einzigen unbekannten Eintrag: lieber einmal zu viel von Hand
 * loeschen lassen als einen Ordner, in dem auch etwas anderes liegt. Ein leerer Ordner
 * ist `ok` — er ist mit Sicherheit der eigene Rest.
 */
export function pruefeDatenordner(pfad: string, bekannte: ReadonlySet<string>): Befund {
  if (!existsSync(pfad)) return { art: 'fehlt' };
  const info = lstatSync(pfad);
  if (!info.isDirectory() || info.isSymbolicLink()) return { art: 'kein-ordner' };

  const namen = readdirSync(pfad).sort();
  const fremde = namen.filter((n) => !bekannte.has(n));
  if (fremde.length > 0) return { art: 'fremd', eintraege: fremde };

  return {
    art: 'ok',
    eintraege: namen.map((name) => {
      const voll = join(pfad, name);
      return { name, bytes: groesse(voll), ordner: lstatSync(voll).isDirectory() };
    }),
  };
}

function lesbareGroesse(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function restschritte(plattform: NodeJS.Platform = process.platform): string {
  const fenster = plattform === 'win32' ? 'die Eingabeaufforderung' : 'das Terminal';
  const node =
    plattform === 'win32'
      ? 'Optional Node.js entfernen, wenn es nur fuer Scapio da war: Einstellungen -> Apps.'
      : 'Node.js darf bleiben — es laeuft nicht im Hintergrund.';
  return `Was noch bleibt:

  1. Dieses Fenster schliessen und den Scapio-Ordner loeschen:
       ${PROJEKTWURZEL}
     (Erst wenn ${fenster} zu ist — vorher haelt es den Ordner fest.)
  2. Im Scalable-Konto den MCP-Zugriff fuer Scapio deaktivieren. Das kann nur die Bank,
     nicht dieses Skript.
  3. ${node}`;
}

export type Umgebung = {
  readonly konfiguration: Konfiguration;
  readonly frage: (text: string) => Promise<string>;
  readonly sage: (text: string) => void;
  readonly scheitere: (text: string) => void;
  /** Nur fuer Tests: wohin die Sicherung vor dem Loeschen geht. */
  readonly sicherungsZiel?: string;
};

/** `true`: das Datenverzeichnis ist weg (oder war nie da). */
export async function deinstalliere({
  konfiguration: k,
  frage,
  sage,
  scheitere,
  sicherungsZiel = abschiedsOrdner(),
}: Umgebung): Promise<boolean> {
  sage('1/4  Pruefe, ob Scapio noch laeuft …');
  if (await portBelegt(k.port)) {
    scheitere(
      `Auf Port ${String(k.port)} hoert noch jemand — vermutlich das laufende Dashboard.\n` +
        'Bitte erst dessen Fenster schliessen und dann erneut deinstallieren.',
    );
    return false;
  }

  sage('2/4  Pruefe den Datenordner …');
  const pfad = k.datenpfad;
  const befund = pruefeDatenordner(pfad, bekannteEintraege(k));
  switch (befund.art) {
    case 'fehlt':
      sage(`\nUnter ${pfad} liegt nichts — es gibt keine Daten zu loeschen.`);
      return true;
    case 'kein-ordner':
      scheitere(
        `${pfad} ist kein gewoehnlicher Ordner (vielleicht eine Verknuepfung).\n` +
          'Dieses Skript loescht dort nichts. Bitte von Hand pruefen und loeschen.',
      );
      return false;
    case 'fremd':
      scheitere(
        `In ${pfad} liegt etwas, das nicht von Scapio stammt:\n` +
          befund.eintraege.map((n) => `  ${n}`).join('\n') +
          '\n\nDieses Skript loescht deshalb nichts. Bitte den Ordner von Hand pruefen und loeschen.',
      );
      return false;
    case 'ok':
      break;
  }

  sage(`\nDatenordner: ${pfad}`);
  for (const e of befund.eintraege) {
    sage(`  ${e.ordner ? `${e.name}/` : e.name}  ${lesbareGroesse(e.bytes)}`);
  }

  sage('\n3/4  Sicherung …');
  if (existsSync(dbPfad(k))) {
    const ziel = sicherungsZiel;
    const antwort = await frage(`Vorher eine Sicherung der Datenbank nach ${ziel} legen? [j/N] `);
    if (/^j(a)?$/i.test(antwort.trim())) {
      try {
        const db = await oeffneDatenbank({ konfiguration: k, migrieren: false });
        try {
          sage(`     Gesichert nach ${await sichern(db, ziel, schemaVersion(db))}`);
          sage('     Sie enthaelt die Depotdaten, aber keine Anmeldung bei Scalable.');
        } finally {
          db.close();
        }
      } catch (fehler) {
        scheitere(
          `Die Sicherung ist gescheitert: ${(fehler as Error).message}\n` +
            'Es wurde nichts geloescht. Ohne Sicherung erneut starten oder "npm run backup" versuchen.',
        );
        return false;
      }
    } else {
      sage('     Keine Sicherung.');
    }
  } else {
    sage('     Keine Datenbank vorhanden — nichts zu sichern.');
  }

  sage('\n4/4  Loeschen');
  sage('Datenbank, Sicherungen, Anmeldung, Einstellungen und eigene Fondsliste werden');
  sage('endgueltig geloescht. Rueckgaengig machen laesst sich das nicht.');
  const bestaetigung = await frage(`Zum Bestaetigen ${BESTAETIGUNG} eintippen: `);
  if (bestaetigung.trim() !== BESTAETIGUNG) {
    sage('\nAbgebrochen — es wurde nichts geloescht.');
    return false;
  }

  try {
    // `maxRetries`: Windows gibt eine eben geschlossene Datei mitunter erst Millisekunden
    // spaeter frei (Virenscanner, Indexdienst).
    rmSync(pfad, { recursive: true, maxRetries: 5, retryDelay: 200 });
  } catch (fehler) {
    scheitere(
      `Der Datenordner liess sich nicht vollstaendig loeschen: ${(fehler as Error).message}\n` +
        'Vermutlich haelt ein anderes Programm noch eine Datei offen. Es schliessen und erneut\n' +
        'deinstallieren — oder den Ordner von Hand loeschen.',
    );
    return false;
  }
  sage(`\nGeloescht: ${pfad}`);
  return true;
}

export async function haupt(): Promise<void> {
  // Ohne Terminal gibt es niemanden, der ENTFERNEN tippt — und ein Weg, der ohne Tippen
  // loescht, soll es nicht geben.
  if (!process.stdin.isTTY) {
    process.stderr.write('Die Deinstallation fragt nach und laeuft deshalb nur in einem Terminal.\n');
    process.exitCode = 1;
    return;
  }
  const zeilen = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const fertig = await deinstalliere({
      konfiguration: ladeKonfiguration(),
      frage: (text) => zeilen.question(text),
      sage: (text) => process.stdout.write(`${text}\n`),
      scheitere: (text) => {
        process.stderr.write(`${text}\n`);
      },
    });
    if (fertig) process.stdout.write(`\n${restschritte()}\n`);
    else process.exitCode = 1;
  } finally {
    zeilen.close();
  }
}

if (import.meta.filename === resolve(process.argv[1] ?? '')) {
  try {
    await haupt();
  } catch (fehler) {
    process.stderr.write(`Die Deinstallation ist gescheitert: ${(fehler as Error).message}\n`);
    process.exitCode = 1;
  }
}
