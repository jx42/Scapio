import { copyFileSync, existsSync, mkdtempSync, readdirSync, rmSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import {
  alteSicherungenLoeschen,
  migrationenLesen,
  migriere,
  oeffneDatenbank,
  schemaVersion,
  sichereWennFaellig,
  sichern,
  testDatenbank,
} from '../../db/verbindung.ts';
import { ladeKonfiguration } from '../../shared/konfiguration.ts';
import { erwarteRechte } from '../dateirechte.ts';

const verzeichnisse: string[] = [];

function temp(): string {
  const p = mkdtempSync(join(tmpdir(), 'portfolio-test-'));
  verzeichnisse.push(p);
  return p;
}

afterEach(() => {
  for (const v of verzeichnisse.splice(0)) rmSync(v, { recursive: true, force: true });
});

describe('migrationenLesen', () => {
  it('liest die eingecheckten Migrationen aufsteigend', () => {
    const m = migrationenLesen();
    expect(m.length).toBeGreaterThan(0);
    expect(m.map((x) => x.nummer)).toEqual(m.map((_, i) => i + 1));
    expect(m[0]!.sql).toContain('CREATE TABLE');
  });

  it('uebergeht Dateien, die nicht dem Namensschema folgen', () => {
    const v = temp();
    writeFileSync(join(v, '001-basis.sql'), 'CREATE TABLE a (x INTEGER);');
    writeFileSync(join(v, 'notizen.md'), '# egal');
    writeFileSync(join(v, '001-basis.sql.bak'), 'kaputt');
    const m = migrationenLesen(new URL(`file://${v}/`));
    expect(m.map((x) => x.datei)).toEqual(['001-basis.sql']);
  });

  it('bricht bei einer Luecke ab, statt sie zu ueberspringen', () => {
    const v = temp();
    writeFileSync(join(v, '001-eins.sql'), 'SELECT 1;');
    writeFileSync(join(v, '003-drei.sql'), 'SELECT 1;');
    expect(() => migrationenLesen(new URL(`file://${v}/`))).toThrow(/lueckenlos/);
  });
});

describe('migriere', () => {
  it('legt das Schema an und setzt user_version', async () => {
    const db = new DatabaseSync(':memory:');
    expect(schemaVersion(db)).toBe(0);

    const angewandt = await migriere(db, '');
    expect(angewandt).toEqual(migrationenLesen().map((m) => m.nummer));
    expect(schemaVersion(db)).toBe(migrationenLesen().length);

    const tabellen = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as {
      name: string;
    }[]).map((z) => z.name);
    expect(tabellen).toEqual(
      expect.arrayContaining([
        'bestand',
        'depot_tag',
        'etf_bestandteil',
        'kurs',
        'lauf',
        'raw_snapshot',
        'sparplan',
        'transaktion',
        'vpi',
      ]),
    );
    db.close();
  });

  it('tut beim zweiten Mal nichts', async () => {
    const db = new DatabaseSync(':memory:');
    await migriere(db, '');
    expect(await migriere(db, '')).toEqual([]);
    db.close();
  });

  it('bricht ab, wenn die Datenbank neuer ist als jede bekannte Migration', async () => {
    const db = new DatabaseSync(':memory:');
    const hoechsteBekannt = migrationenLesen().length;
    db.exec(`PRAGMA user_version = ${String(hoechsteBekannt + 1)}`);
    await expect(migriere(db, '')).rejects.toThrow(/neuer/);
    db.close();
  });
});

describe('oeffneDatenbank', () => {
  it('legt Datenbank, -wal und -shm nur fuer den Eigentuemer lesbar ab', async () => {
    const v = temp();
    const db = await oeffneDatenbank({ konfiguration: { ...ladeKonfiguration(join(v, 'keine.json')), datenpfad: v } });
    for (const d of ['portfolio.db', 'portfolio.db-wal', 'portfolio.db-shm']) erwarteRechte(join(v, d), 0o600);
    db.close();
  }, 30_000); // Migriert alle Stufen auf eine Datei samt Sicherung; unter Windows dauert das Sekunden.
});

describe('sichern', () => {
  it('schreibt eine lesbare Kopie mit Version im Namen', async () => {
    const db = await testDatenbank();
    db.exec("INSERT INTO vpi (monat, index_wert, quelle) VALUES ('2026-01', 100.0, 'test')");

    const v = temp();
    const ziel = await sichern(db, v, 1);
    expect(ziel).toMatch(/portfolio-1-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}\.db$/);

    const kopie = new DatabaseSync(ziel);
    const zeile = kopie.prepare('SELECT monat FROM vpi').get() as { monat: string };
    expect(zeile.monat).toBe('2026-01');
    kopie.close();
    db.close();
  });

  it('legt die Sicherung nur fuer den Eigentuemer lesbar ab', async () => {
    const db = await testDatenbank();
    const ziel = await sichern(db, temp(), 1);
    erwarteRechte(ziel, 0o600);
    expect(readdirSync(dirname(ziel)).filter((d) => d.endsWith('.tmp'))).toEqual([]);
    db.close();
  });

  it('markiert eine Migrationssicherung im Namen, damit sie getrennt gezaehlt wird', async () => {
    const db = await testDatenbank();
    const ziel = await sichern(db, temp(), 1, 'migration');
    expect(ziel).toMatch(/portfolio-migration-1-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}\.db$/);
    db.close();
  });
  it('ueberlebt zwei Sicherungen desselben Anlasses in derselben Sekunde', async () => {
    const db = await testDatenbank();
    const v = temp();
    const namen = new Set([await sichern(db, v, 1), await sichern(db, v, 1), await sichern(db, v, 1)]);
    expect(namen.size).toBe(3);
    db.close();
  });

  it('laesst sich zurueckspielen und oeffnen — nach dem Wegraeumen von -wal und -shm', async () => {
    const v = temp();
    const pfad = join(v, 'portfolio.db');
    const konfiguration = { ...ladeKonfiguration(), datenpfad: v };
    const db = await oeffneDatenbank({ konfiguration, pfad });
    db.exec("INSERT INTO vpi (monat, index_wert, quelle) VALUES ('2026-01', 100.0, 'test')");
    const sicherung = await sichern(db, join(v, 'sicherung'), schemaVersion(db));

    // Spaeter geschrieben, und die Datei bleibt offen: diese Zeile steht nur im WAL.
    db.exec("INSERT INTO vpi (monat, index_wert, quelle) VALUES ('2026-02', 101.0, 'test')");
    expect(existsSync(`${pfad}-wal`)).toBe(true);
    // Ein abgestuerzter Prozess hinterliesse das WAL; das Kopieren vor `close` bildet das nach.
    copyFileSync(`${pfad}-wal`, join(v, 'wal'));
    db.close();
    copyFileSync(join(v, 'wal'), `${pfad}-wal`);

    // RUNBOOK.md, „Datenbank beschädigt“: -wal und -shm loeschen, Sicherung zurueckkopieren.
    for (const p of [`${pfad}-wal`, `${pfad}-shm`]) if (existsSync(p)) unlinkSync(p);
    copyFileSync(sicherung, pfad);

    const zurueck = await oeffneDatenbank({ konfiguration, pfad });
    const monate = zurueck.prepare('SELECT monat FROM vpi ORDER BY monat').all() as { monat: string }[];
    expect(monate.map((z) => z.monat)).toEqual(['2026-01']);
    zurueck.close();
  });
});

describe('sichereWennFaellig [ADR-045]', () => {
  const TAG = 24 * 60 * 60 * 1000;

  function alteSicherung(v: string, name: string, alterTage: number, jetzt: number): void {
    const p = join(v, name);
    writeFileSync(p, '');
    const zeit = new Date(jetzt - alterTage * TAG);
    utimesSync(p, zeit, zeit);
  }

  it('sichert, wenn es noch keine Sicherung gibt', async () => {
    const db = await testDatenbank();
    const ziel = await sichereWennFaellig(db, join(temp(), 'sicherung'));
    expect(ziel).toMatch(/portfolio-auto-\d+-.+\.db$/);
    db.close();
  });

  it('wartet, solange irgendeine Sicherung juenger als sieben Tage ist', async () => {
    const db = await testDatenbank();
    const v = temp();
    const jetzt = Date.now();
    alteSicherung(v, 'portfolio-auto-1-2026-01-01T00-00-00-000.db', 10, jetzt);
    alteSicherung(v, 'portfolio-migration-1-2026-01-02T00-00-00-000.db', 6, jetzt);
    expect(await sichereWennFaellig(db, v, jetzt)).toBeNull();
    db.close();
  });

  it('sichert nach sieben Tagen und zaehlt dabei nur eigene Dateien', async () => {
    const db = await testDatenbank();
    const v = temp();
    const jetzt = Date.now();
    alteSicherung(v, 'portfolio-1-2026-01-01T00-00-00-000.db', 8, jetzt);
    alteSicherung(v, 'wichtig.txt', 0, jetzt);
    expect(await sichereWennFaellig(db, v, jetzt)).not.toBeNull();
    db.close();
  });

  it('rotiert automatische Sicherungen getrennt — die manuellen bleiben', async () => {
    const db = await testDatenbank();
    const v = temp();
    const jetzt = Date.now();
    for (let i = 0; i < 5; i += 1) {
      alteSicherung(v, `portfolio-auto-1-2026-01-0${i + 1}T00-00-00-000.db`, 30 - i, jetzt);
      alteSicherung(v, `portfolio-1-2026-01-0${i + 1}T00-00-00-000.db`, 30 - i, jetzt);
    }
    await sichereWennFaellig(db, v, jetzt);
    const uebrig = readdirSync(v);
    expect(uebrig.filter((d) => d.startsWith('portfolio-auto-'))).toHaveLength(5);
    expect(uebrig).not.toContain('portfolio-auto-1-2026-01-01T00-00-00-000.db');
    expect(uebrig.filter((d) => /^portfolio-\d/.test(d))).toHaveLength(5);
    db.close();
  });
});

describe('alteSicherungenLoeschen', () => {
  it('behaelt die juengsten fuenf und loescht den Rest', () => {
    const v = temp();
    for (let i = 0; i < 8; i += 1) {
      const p = join(v, `portfolio-1-2026-01-0${i + 1}T00-00-00.db`);
      writeFileSync(p, '');
      // Deterministische Zeiten statt Warten: die Reihenfolge ist der Prueffall.
      utimesSync(p, new Date(2026, 0, i + 1), new Date(2026, 0, i + 1));
    }
    const geloescht = alteSicherungenLoeschen(v);
    expect(geloescht).toHaveLength(3);
    expect(readdirSync(v)).toHaveLength(5);
    expect(readdirSync(v).sort()).toEqual([
      'portfolio-1-2026-01-04T00-00-00.db',
      'portfolio-1-2026-01-05T00-00-00.db',
      'portfolio-1-2026-01-06T00-00-00.db',
      'portfolio-1-2026-01-07T00-00-00.db',
      'portfolio-1-2026-01-08T00-00-00.db',
    ]);
  });

  it('laesst fremde Dateien liegen', () => {
    const v = temp();
    writeFileSync(join(v, 'wichtig.txt'), 'nicht anfassen');
    expect(alteSicherungenLoeschen(v, 0)).toEqual([]);
    expect(readdirSync(v)).toEqual(['wichtig.txt']);
  });

  it('haelt ein fehlendes Verzeichnis aus', () => {
    expect(alteSicherungenLoeschen(join(temp(), 'gibtsnicht'))).toEqual([]);
  });

  it('zaehlt Migrationssicherungen getrennt von manuellen, statt einen gemeinsamen Topf zu leeren', () => {
    const v = temp();
    for (let i = 0; i < 8; i += 1) {
      const manuell = join(v, `portfolio-1-2026-01-0${i + 1}T00-00-00.db`);
      writeFileSync(manuell, '');
      utimesSync(manuell, new Date(2026, 0, i + 1), new Date(2026, 0, i + 1));

      const migration = join(v, `portfolio-migration-1-2026-02-0${i + 1}T00-00-00.db`);
      writeFileSync(migration, '');
      utimesSync(migration, new Date(2026, 1, i + 1), new Date(2026, 1, i + 1));
    }

    const geloescht = alteSicherungenLoeschen(v);

    expect(geloescht).toHaveLength(6);
    const uebrig = readdirSync(v);
    expect(uebrig.filter((d) => d.startsWith('portfolio-migration-'))).toHaveLength(5);
    expect(uebrig.filter((d) => !d.startsWith('portfolio-migration-'))).toHaveLength(5);
  });
});

describe('testDatenbank', () => {
  it('kommt fertig migriert und leer', async () => {
    const db = await testDatenbank();
    expect(schemaVersion(db)).toBeGreaterThan(0);
    const zeile = db.prepare('SELECT COUNT(*) AS n FROM transaktion').get() as { n: number };
    expect(Number(zeile.n)).toBe(0);
    db.close();
  });

  it('setzt die PRAGMAs, auf die sich der Rest verlaesst', async () => {
    const db = await testDatenbank();
    const fk = db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number };
    expect(Number(fk.foreign_keys)).toBe(1);
    db.close();
  });
});
