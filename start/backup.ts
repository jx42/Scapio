/**
 * `npm run backup` — Sicherung der Datenbank ueber die SQLite-Backup-API.
 *
 * Kein Dateikopieren: im WAL-Modus waere eine Kopie nicht notwendig konsistent.
 * Die Sicherung landet unter `<datenverzeichnis>/sicherung/` (macOS
 * `~/Library/Application Support/scapio/`, Windows `%LOCALAPPDATA%\scapio\`),
 * ausserhalb von iCloud und Git. [CLAUDE.md]
 */

import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { dbPfad, ladeKonfiguration, sicherungsPfad } from '../shared/konfiguration.ts';
import { alteSicherungenLoeschen, oeffneDatenbank, schemaVersion, sichern } from '../db/verbindung.ts';

export async function haupt(): Promise<void> {
  const konfiguration = ladeKonfiguration();
  // Sonst legte `oeffneDatenbank` eine leere Datenbank an und sicherte sie.
  if (!existsSync(dbPfad(konfiguration))) {
    process.stderr.write(`Keine Datenbank unter ${dbPfad(konfiguration)} — es gibt nichts zu sichern.\n`);
    process.exitCode = 1;
    return;
  }
  const db = await oeffneDatenbank({ konfiguration, migrieren: false });

  try {
    const verzeichnis = sicherungsPfad(konfiguration);
    const ziel = await sichern(db, verzeichnis, schemaVersion(db));
    process.stdout.write(`Gesichert nach:\n  ${ziel}\n\n`);

    // `sichern` raeumt selbst auf; dieser Aufruf ist nur die Anzeige des Ergebnisses.
    alteSicherungenLoeschen(verzeichnis);

    const vorhanden = readdirSync(verzeichnis)
      .filter((d) => d.endsWith('.db'))
      .sort()
      .reverse();

    process.stdout.write(`Vorhandene Sicherungen (${vorhanden.length}):\n`);
    for (const datei of vorhanden) {
      const groesse = statSync(join(verzeichnis, datei)).size;
      process.stdout.write(`  ${datei}  ${(groesse / 1024 / 1024).toFixed(1)} MB\n`);
    }
  } finally {
    db.close();
  }
}

if (import.meta.filename === resolve(process.argv[1] ?? '')) {
  try {
    await haupt();
  } catch (fehler) {
    process.stderr.write(`Die Sicherung ist gescheitert: ${(fehler as Error).message}\n`);
    process.exitCode = 1;
  }
}
