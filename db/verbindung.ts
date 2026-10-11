/**
 * Verbindung, PRAGMAs, Migrationslaeufer, Sicherung. Bauanleitung Abschnitt 5.1.
 *
 * Die Datenbank liegt NICHT im Projektordner, sondern unter
 * `~/Library/Application Support/scapio/` bzw. `%LOCALAPPDATA%\scapio\` — ausserhalb von
 * iCloud, Roaming-Profil und Git. Verzeichnis 0700, Dateien 0600 (unter Windows
 * wirkungslos, siehe docs/SICHERHEIT.md, Restrisiko 2).
 */

import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync, backup } from 'node:sqlite';
import type { Konfiguration } from '../shared/konfiguration.ts';
import { dbPfad, ladeKonfiguration, sicherungsPfad } from '../shared/konfiguration.ts';

export type Datenbank = DatabaseSync;

const MIGRATIONSVERZEICHNIS = new URL('./migrationen/', import.meta.url);
const SICHERUNGEN_BEHALTEN = 5;

/** Genau die Reihenfolge aus Abschnitt 5.1. `synchronous = FULL`: Sicherheit vor Tempo. */
function setzePragmas(db: DatabaseSync): void {
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec('PRAGMA synchronous = FULL');
}

/** Beschaedigte Datei: kein roher SQLite-Fehler, sondern ein eigener Code mit Runbook-Abschnitt. */
export class DatenbankBeschaedigt extends Error {
  readonly code = 'E_DB_BESCHAEDIGT';
  readonly pfad: string;

  constructor(pfad: string, befund: string) {
    super(`Die Datenbank ${pfad} ist beschaedigt (${befund}). Siehe docs/RUNBOOK.md, „Datenbank beschädigt“.`);
    this.name = 'DatenbankBeschaedigt';
    this.pfad = pfad;
  }
}

/**
 * `quick_check` statt `integrity_check`: prueft Seiten und Zeilen ohne Indexabgleich und
 * bleibt damit auch bei einigen hundert MB unter einer Sekunde.
 */
export function pruefeIntegritaet(db: DatabaseSync, pfad: string): void {
  let zeilen: { quick_check?: unknown }[];
  try {
    zeilen = db.prepare('PRAGMA quick_check').all() as { quick_check?: unknown }[];
  } catch (fehler) {
    throw new DatenbankBeschaedigt(pfad, (fehler as Error).message);
  }
  const befunde = zeilen.map((z) => String(z.quick_check));
  if (befunde.length !== 1 || befunde[0] !== 'ok') throw new DatenbankBeschaedigt(pfad, befunde.slice(0, 3).join('; '));
}

function verzeichnisAnlegen(pfad: string): void {
  mkdirSync(pfad, { recursive: true, mode: 0o700 });
  try {
    chmodSync(pfad, 0o700);
  } catch {
    // Ein bereits bestehendes Verzeichnis mit anderem Eigentuemer ist kein Grund abzubrechen.
  }
}

function dateirechte(pfad: string): void {
  try {
    chmodSync(pfad, 0o600);
  } catch {
    // Datei existiert noch nicht oder gehoert jemand anderem — nicht toedlich.
  }
}

type Migration = { readonly nummer: number; readonly datei: string; readonly sql: string };

/** Alle `NNN-*.sql` aufsteigend. Kein Rueckwaertspfad, deshalb auch keine `down`-Datei. */
export function migrationenLesen(verzeichnis: URL = MIGRATIONSVERZEICHNIS): Migration[] {
  const dateien = readdirSync(verzeichnis);
  const migrationen: Migration[] = [];

  for (const datei of dateien) {
    const treffer = /^(\d{3})-[a-z0-9-]+\.sql$/.exec(datei);
    if (treffer === null) continue;
    const nummer = Number(treffer[1]);
    migrationen.push({ nummer, datei, sql: readFileSync(new URL(datei, verzeichnis), 'utf8') });
  }

  migrationen.sort((a, b) => a.nummer - b.nummer);

  for (let i = 0; i < migrationen.length; i += 1) {
    if (migrationen[i]!.nummer !== i + 1) {
      throw new Error(
        `Migrationen sind nicht lueckenlos: erwartet ${String(i + 1).padStart(3, '0')}, gefunden ${migrationen[i]!.datei}`,
      );
    }
  }

  return migrationen;
}

export function schemaVersion(db: DatabaseSync): number {
  const zeile = db.prepare('PRAGMA user_version').get() as { user_version?: number } | undefined;
  return Number(zeile?.user_version ?? 0);
}

export type SicherungsAnlass = 'manuell' | 'migration' | 'automatisch';

const MUSTER: Record<SicherungsAnlass, RegExp> = {
  manuell: /^portfolio-\d+-.+\.db$/,
  migration: /^portfolio-migration-\d+-.+\.db$/,
  automatisch: /^portfolio-auto-\d+-.+\.db$/,
};

/**
 * Sicherung ueber die SQLite-Backup-API — kein Dateikopieren, das waere im WAL-Modus
 * nicht konsistent. Name traegt die Schemaversion, damit man sieht, wohin sie passt.
 *
 * `anlass` steuert den Namen und damit den Rotationstopf in `alteSicherungenLoeschen`:
 * eine automatische Migrationssicherung darf nicht durch mehrfaches `npm run backup`
 * aus der Rotation gedrängt werden (RUNBOOK.md, „Schema geändert“), die woechentliche
 * beim Start ebenso wenig [ADR-045].
 */
export async function sichern(
  db: DatabaseSync,
  verzeichnis: string,
  version: number,
  anlass: SicherungsAnlass = 'manuell',
): Promise<string> {
  verzeichnisAnlegen(verzeichnis);
  // Mit Millisekunden: zwei Sicherungen desselben Anlasses in derselben Sekunde scheiterten
  // sonst am `wx` der Temp-Datei (EEXIST).
  const zeitstempel = new Date().toISOString().replaceAll(':', '-').replace('.', '-').replace(/Z$/, '');
  const praefix = { manuell: 'portfolio', migration: 'portfolio-migration', automatisch: 'portfolio-auto' }[anlass];
  const ziel = join(verzeichnis, `${praefix}-${version}-${zeitstempel}.db`);

  // Erst als leere 0600-Datei anlegen, dann fuellen und umbenennen: sonst laege die Kopie
  // zwischen `backup` und `chmod` mit Standardrechten da, und ein Abbruch hinterliesse
  // eine halbe Sicherung unter gueltigem Namen.
  const temp = `${ziel}.tmp`;
  writeFileSync(temp, '', { mode: 0o600, flag: 'wx' });
  try {
    await backup(db, temp);
    dateirechte(temp);
    // Eine ungepruefte Sicherung wuerde in der Rotation eine gute verdraengen.
    const kopie = new DatabaseSync(temp, { readOnly: true });
    try {
      pruefeIntegritaet(kopie, ziel);
    } finally {
      kopie.close();
    }
    renameSync(temp, ziel);
  } catch (fehler) {
    try {
      unlinkSync(temp);
    } catch {
      // schon weg
    }
    throw fehler;
  }
  alteSicherungenLoeschen(verzeichnis);
  return ziel;
}

/** Abstand, ab dem `npm start` von selbst sichert [ADR-045]. */
const AUTOMATISCH_NACH_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Sichert mit Anlass `automatisch`, wenn die juengste Sicherung gleich welchen Anlasses
 * aelter als sieben Tage ist (oder es keine gibt). `null`: nicht faellig. [ADR-045]
 */
export async function sichereWennFaellig(
  db: DatabaseSync,
  verzeichnis: string,
  jetzt: number = Date.now(),
): Promise<string | null> {
  if (existsSync(verzeichnis)) {
    const alle = Object.values(MUSTER);
    for (const datei of readdirSync(verzeichnis)) {
      if (!alle.some((muster) => muster.test(datei))) continue;
      if (jetzt - statSync(join(verzeichnis, datei)).mtimeMs < AUTOMATISCH_NACH_MS) return null;
    }
  }
  return sichern(db, verzeichnis, schemaVersion(db), 'automatisch');
}

/** Die letzten fuenf je Anlass bleiben liegen — jeder Anlass zaehlt fuer sich. */
export function alteSicherungenLoeschen(verzeichnis: string, behalten = SICHERUNGEN_BEHALTEN): string[] {
  if (!existsSync(verzeichnis)) return [];

  const alle = readdirSync(verzeichnis);
  const geloescht: string[] = [];

  for (const muster of Object.values(MUSTER)) {
    const dateien = alle
      .filter((d) => muster.test(d))
      .map((d) => ({ datei: d, zeit: statSync(join(verzeichnis, d)).mtimeMs }))
      .sort((a, b) => b.zeit - a.zeit);

    for (const { datei } of dateien.slice(behalten)) {
      unlinkSync(join(verzeichnis, datei));
      geloescht.push(datei);
    }
  }
  return geloescht;
}

/**
 * Wendet alle Migrationen mit hoeherer Nummer an, jede in einer eigenen Transaktion,
 * und setzt `user_version` am Ende jeder Migration.
 *
 * `PRAGMA user_version` vertraegt keine Bindung — deshalb ist dies die einzige Stelle im
 * Projekt, an der eine Zahl in SQL eingesetzt wird. Sie kommt aus dem Dateinamen und ist
 * durch `/^\d{3}$/` gegangen, nicht aus einer fremden Antwort.
 */
export async function migriere(
  db: DatabaseSync,
  sicherungsverzeichnis: string,
  verzeichnis: URL = MIGRATIONSVERZEICHNIS,
): Promise<number[]> {
  const migrationen = migrationenLesen(verzeichnis);
  const vorher = schemaVersion(db);

  // Lueckenlos und sortiert (siehe `migrationenLesen`), also ist die letzte Nummer
  // zugleich die hoechste bekannte. Steht die Datenbank darueber, kam sie von einer
  // neueren Installation — dieser Code kennt ihr Schema nicht und darf nicht so tun,
  // als gaebe es nichts zu tun.
  const hoechsteBekannt = migrationen.length;
  if (vorher > hoechsteBekannt) {
    throw new Error(
      `Diese Datenbank ist neuer (Schema ${String(vorher)}) als diese Installation (kennt bis ${String(hoechsteBekannt)}). ` +
        'Bitte die Anwendung aktualisieren, z. B. mit "npm run update".',
    );
  }

  const offen = migrationen.filter((m) => m.nummer > vorher);
  if (offen.length === 0) return [];

  // Vor der ERSTEN Migration sichern — aber nur, wenn es schon etwas zu sichern gibt.
  if (vorher > 0) await sichern(db, sicherungsverzeichnis, vorher, 'migration');

  const angewandt: number[] = [];
  for (const m of offen) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(m.sql);
      db.exec(`PRAGMA user_version = ${m.nummer}`);
      db.exec('COMMIT');
    } catch (fehler) {
      db.exec('ROLLBACK');
      throw new Error(`Migration ${m.datei} ist gescheitert: ${(fehler as Error).message}`);
    }
    angewandt.push(m.nummer);
  }

  return angewandt;
}

export type OeffnenOptionen = {
  readonly konfiguration?: Konfiguration;
  /** Abweichender Pfad, fuer Tests. `:memory:` erlaubt. */
  readonly pfad?: string;
  readonly migrieren?: boolean;
};

/**
 * Der normale Einstieg: Verzeichnis anlegen, oeffnen, PRAGMAs, migrieren.
 * Async, weil die Sicherung vor einer Migration async ist.
 */
export async function oeffneDatenbank(optionen: OeffnenOptionen = {}): Promise<DatabaseSync> {
  const k = optionen.konfiguration ?? ladeKonfiguration();
  const pfad = optionen.pfad ?? dbPfad(k);

  if (pfad !== ':memory:') verzeichnisAnlegen(k.datenpfad);

  const db = new DatabaseSync(pfad);
  // Unter Windows haelt ein offenes Handle die Datei fest: wirft etwas nach dem Oeffnen,
  // muss es vorher zu, sonst laesst sich die Datei nicht mehr loeschen.
  try {
    // Vor den PRAGMAs: schon `journal_mode = WAL` scheitert an einer kaputten Datei mit
    // einem Fehler, der nichts erklaert.
    pruefeIntegritaet(db, pfad);
    setzePragmas(db);

    if (pfad !== ':memory:') dateirechte(pfad);
    if (optionen.migrieren !== false) await migriere(db, sicherungsPfad(k));
    // `-wal` und `-shm` entstehen erst beim ersten Schreiben und tragen dieselben Daten.
    if (pfad !== ':memory:') for (const p of [`${pfad}-wal`, `${pfad}-shm`]) dateirechte(p);
  } catch (fehler) {
    db.close();
    throw fehler;
  }

  return db;
}

/** Nur fuer Tests und `verify`: leere Datenbank im Speicher, fertig migriert. */
export async function testDatenbank(): Promise<DatabaseSync> {
  const db = new DatabaseSync(':memory:');
  setzePragmas(db);
  await migriere(db, '');
  return db;
}
