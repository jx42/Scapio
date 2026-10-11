import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DatenbankBeschaedigt,
  migrationenLesen,
  migriere,
  oeffneDatenbank,
  pruefeIntegritaet,
  schemaVersion,
  sichern,
} from '../../db/verbindung.ts';
import { konfigurationVergessen, ladeKonfiguration } from '../../shared/konfiguration.ts';

const MIGRATIONEN = fileURLToPath(new URL('../../db/migrationen/', import.meta.url));
const FIXTURE_V1 = readFileSync(new URL('../fixtures/schema/v001.sql', import.meta.url), 'utf8');
const TABELLEN_V1 = ['raw_snapshot', 'transaktion', 'kurs', 'bestand', 'sparplan', 'depot_tag', 'etf_bestandteil', 'vpi', 'lauf'];

const verzeichnisse: string[] = [];

function temp(): string {
  const p = mkdtempSync(join(tmpdir(), 'portfolio-migration-'));
  verzeichnisse.push(p);
  return p;
}

afterEach(() => {
  for (const v of verzeichnisse.splice(0)) rmSync(v, { recursive: true, force: true });
});

function schema(db: DatabaseSync): string[] {
  return (db.prepare("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY name").all() as { sql: string }[]).map(
    (z) => z.sql,
  );
}

function anzahl(db: DatabaseSync, tabelle: string): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM ${tabelle}`).get() as { n: number }).n;
}

describe('Migration mit Daten', () => {
  const alle = migrationenLesen();
  const neueste = alle.length;

  it.each(alle.slice(0, -1).map((m) => m.nummer))('hebt eine befuellte Datenbank von Schema %i auf den neuesten Stand', async (n) => {
    const teil = temp();
    for (const m of alle.slice(0, n)) copyFileSync(join(MIGRATIONEN, m.datei), join(teil, m.datei));

    const verzeichnis = temp();
    const db = new DatabaseSync(join(verzeichnis, 'portfolio.db'));
    await migriere(db, join(verzeichnis, 'sicherung'), pathToFileURL(`${teil}/`));
    expect(schemaVersion(db)).toBe(n);
    db.exec(FIXTURE_V1);

    await migriere(db, join(verzeichnis, 'sicherung'));

    expect(schemaVersion(db)).toBe(neueste);
    for (const t of TABELLEN_V1) expect(anzahl(db, t), t).toBe(1);
    expect(db.prepare('SELECT positionen_json FROM depot_tag').get()).toEqual({ positionen_json: '{}' });
    expect(() => pruefeIntegritaet(db, 'test')).not.toThrow();

    const frisch = new DatabaseSync(':memory:');
    await migriere(frisch, '');
    expect(schema(db)).toEqual(schema(frisch));
    frisch.close();
    db.close();
  }, 30_000); // Jede Stufe migriert zweimal auf eine Datei samt Sicherung; unter Windows dauert das Sekunden.

  it('rollt eine gescheiterte Migration zurueck, statt sie halb stehen zu lassen', async () => {
    const v = temp();
    writeFileSync(join(v, '001-gut.sql'), 'CREATE TABLE gut (x INTEGER);');
    writeFileSync(join(v, '002-schlecht.sql'), 'CREATE TABLE halb (x INTEGER); DAS IST KEIN SQL;');

    const db = new DatabaseSync(':memory:');
    await expect(migriere(db, temp(), pathToFileURL(`${v}/`))).rejects.toThrow(/002-schlecht/);
    const tabellen = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map(
      (z) => z.name,
    );
    expect(tabellen).toContain('gut');
    expect(tabellen).not.toContain('halb');
    expect(schemaVersion(db)).toBe(1);
    db.close();
  });
});

describe('Integritaet', () => {
  it('meldet eine Datei ohne SQLite-Kopf als beschaedigt', async () => {
    const v = temp();
    const pfad = join(v, 'portfolio.db');
    writeFileSync(pfad, Buffer.alloc(8192, 0x5a));
    // Eigene, fehlende config.json: sonst laese der Test die einstellungen.json des Entwicklers.
    konfigurationVergessen();
    const konfiguration = { ...ladeKonfiguration(join(v, 'config.json')), datenpfad: v };
    konfigurationVergessen();
    await expect(oeffneDatenbank({ konfiguration, pfad })).rejects.toBeInstanceOf(DatenbankBeschaedigt);
  });

  it('meldet zerstoerte Seiten als beschaedigt', async () => {
    const v = temp();
    const pfad = join(v, 'portfolio.db');
    const db = new DatabaseSync(pfad);
    db.exec("CREATE TABLE t (x TEXT); WITH RECURSIVE r(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM r WHERE i < 2000) INSERT INTO t SELECT hex(randomblob(64)) FROM r;");
    db.close();
    // Kopf (Seite 1) bleibt heil, die Tabellenseiten dahinter werden ueberschrieben.
    const bytes = readFileSync(pfad);
    bytes.fill(0x5a, 4096 * 2, 4096 * 6);
    writeFileSync(pfad, bytes);

    const kaputt = new DatabaseSync(pfad);
    expect(() => pruefeIntegritaet(kaputt, pfad)).toThrow(DatenbankBeschaedigt);
    kaputt.close();
  });

  it('legt eine Sicherung erst nach bestandener Pruefung unter gueltigem Namen ab', async () => {
    const v = temp();
    const db = new DatabaseSync(':memory:');
    await migriere(db, '');
    db.exec(FIXTURE_V1);
    const ziel = await sichern(db, join(v, 'sicherung'), schemaVersion(db));
    const kopie = new DatabaseSync(ziel, { readOnly: true });
    expect(() => pruefeIntegritaet(kopie, ziel)).not.toThrow();
    expect(anzahl(kopie, 'transaktion')).toBe(1);
    kopie.close();
    db.close();
  });
});
